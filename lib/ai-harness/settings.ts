import { adminDb } from '@/lib/firebase-admin';
import { LOCATIONS, TOPIC_TEMPLATES, formatLocationString } from './config';

export type LLMPreset = 'minimize_costs' | 'balanced' | 'maximize_inquiries' | 'custom';
export type LLMFrequency = 'daily' | 'every_other_day' | 'weekly' | 'monthly';

export interface LLMBudgetConfig {
  preset: LLMPreset;
  frequency: LLMFrequency;
  questionsPerRun: number;
  smartSkipMastered: boolean;
  recheckDays: number;
  updatedAt?: string;
  updatedBy?: string;
}

export interface QuestionStateRecord {
  key: string; // `${location}__${topicId}`
  location: string;
  topicId: string;
  topicName: string;
  prompt: string;
  lastTestedDate: string; // YYYY-MM-DD
  chatgptMentioned: boolean;
  claudeMentioned: boolean;
  geminiMentioned: boolean;
  perplexityMentioned?: boolean;
  mastered: boolean; // True when mentioned across all active LLMs
}

export const PRESET_CONFIGS: Record<Exclude<LLMPreset, 'custom'>, Omit<LLMBudgetConfig, 'updatedAt' | 'updatedBy'>> = {
  minimize_costs: {
    preset: 'minimize_costs',
    frequency: 'weekly',
    questionsPerRun: 3,
    smartSkipMastered: true,
    recheckDays: 30
  },
  balanced: {
    preset: 'balanced',
    frequency: 'every_other_day',
    questionsPerRun: 6,
    smartSkipMastered: true,
    recheckDays: 30
  },
  maximize_inquiries: {
    preset: 'maximize_inquiries',
    frequency: 'daily',
    questionsPerRun: 15,
    smartSkipMastered: false,
    recheckDays: 30
  }
};

export const DEFAULT_LLM_CONFIG: LLMBudgetConfig = {
  ...PRESET_CONFIGS.balanced
};

export async function getLLMBudgetConfig(): Promise<LLMBudgetConfig> {
  if (!adminDb || !adminDb.collection) {
    return DEFAULT_LLM_CONFIG;
  }
  try {
    const doc = await adminDb.collection('settings').doc('llm_config').get();
    if (doc.exists) {
      const data = doc.data() as Partial<LLMBudgetConfig>;
      return {
        preset: data.preset || DEFAULT_LLM_CONFIG.preset,
        frequency: data.frequency || DEFAULT_LLM_CONFIG.frequency,
        questionsPerRun: typeof data.questionsPerRun === 'number' ? data.questionsPerRun : DEFAULT_LLM_CONFIG.questionsPerRun,
        smartSkipMastered: typeof data.smartSkipMastered === 'boolean' ? data.smartSkipMastered : DEFAULT_LLM_CONFIG.smartSkipMastered,
        recheckDays: typeof data.recheckDays === 'number' ? data.recheckDays : DEFAULT_LLM_CONFIG.recheckDays,
        updatedAt: data.updatedAt,
        updatedBy: data.updatedBy
      };
    }
  } catch (e) {
    console.error('Error loading llm_config from Firestore:', e);
  }
  return DEFAULT_LLM_CONFIG;
}

export async function saveLLMBudgetConfig(config: Partial<LLMBudgetConfig>, userEmail?: string): Promise<LLMBudgetConfig> {
  const current = await getLLMBudgetConfig();
  const next: LLMBudgetConfig = {
    preset: config.preset ?? current.preset,
    frequency: config.frequency ?? current.frequency,
    questionsPerRun: config.questionsPerRun ?? current.questionsPerRun,
    smartSkipMastered: config.smartSkipMastered ?? current.smartSkipMastered,
    recheckDays: config.recheckDays ?? current.recheckDays,
    updatedAt: new Date().toISOString(),
    updatedBy: userEmail || current.updatedBy || 'admin'
  };

  if (adminDb && adminDb.collection) {
    await adminDb.collection('settings').doc('llm_config').set(next, { merge: true });
  }
  return next;
}

export function daysBetweenDates(dateA: string, dateB: string): number {
  const a = new Date(`${dateA}T00:00:00Z`).getTime();
  const b = new Date(`${dateB}T00:00:00Z`).getTime();
  if (isNaN(a) || isNaN(b)) return 999;
  return Math.round(Math.abs(b - a) / (1000 * 60 * 60 * 24));
}

export async function getLastRunDate(): Promise<string | null> {
  if (!adminDb || !adminDb.collection) return null;
  try {
    const snap = await adminDb.collection('llm_visibility')
      .orderBy('date', 'desc')
      .limit(1)
      .get();
    if (!snap.empty) {
      return snap.docs[0].data()?.date || snap.docs[0].id || null;
    }
  } catch (e) {
    console.error('Error fetching last run date:', e);
  }
  return null;
}

export function checkScheduleEligibility(
  config: LLMBudgetConfig,
  lastRunDate: string | null,
  todayDateStr: string
): { shouldRun: boolean; reason: string; daysSinceLastRun: number | null } {
  if (!lastRunDate) {
    return { shouldRun: true, reason: 'No previous run recorded', daysSinceLastRun: null };
  }

  const daysSince = daysBetweenDates(lastRunDate, todayDateStr);

  const requiredDaysMap: Record<LLMFrequency, number> = {
    daily: 1,
    every_other_day: 2,
    weekly: 7,
    monthly: 30
  };

  const requiredDays = requiredDaysMap[config.frequency] || 2;

  if (daysSince < requiredDays) {
    return {
      shouldRun: false,
      reason: `Frequency is set to '${config.frequency}' (requires ${requiredDays}d gap; last run was ${lastRunDate}, ${daysSince}d ago)`,
      daysSinceLastRun: daysSince
    };
  }

  return {
    shouldRun: true,
    reason: `Eligible to run (${daysSince}d since last run on ${lastRunDate}; frequency=${config.frequency})`,
    daysSinceLastRun: daysSince
  };
}

/**
 * Loads the rolling question state map from Firestore (`settings/llm_question_state`).
 * If it does not exist yet, automatically backfills from recent `cron_logs` so existing
 * Grayslake & Lake County 100% wins are immediately recognized as Mastered.
 */
export async function loadQuestionStateMap(): Promise<Record<string, QuestionStateRecord>> {
  if (!adminDb || !adminDb.collection) return {};

  try {
    const stateDoc = await adminDb.collection('settings').doc('llm_question_state').get();
    if (stateDoc.exists && stateDoc.data()?.questions) {
      return stateDoc.data()!.questions as Record<string, QuestionStateRecord>;
    }

    // Backfill from historical cron_logs (oldest to newest among last 10 runs)
    const logsSnap = await adminDb.collection('cron_logs').limit(20).get();
    const allRuns = logsSnap.docs
      .map((d: any) => ({ id: d.id, ...(d.data() || {}) }))
      .filter((r: any) => Array.isArray(r.logs) && r.logs.length > 0)
      .sort((a: any, b: any) => String(a.date || '').localeCompare(String(b.date || '')));

    const map: Record<string, QuestionStateRecord> = {};

    for (const run of allRuns) {
      const runDate = run.date || new Date().toISOString().split('T')[0];
      for (const item of run.logs) {
        if (!item.location || !item.topic) continue;
        const matchedTemplate = TOPIC_TEMPLATES.find(
          t => t.topic.toLowerCase() === String(item.topic).toLowerCase() || t.id === item.topic
        );
        const topicId = matchedTemplate ? matchedTemplate.id : String(item.topic).toLowerCase().replace(/[^a-z0-9]+/g, '_');
        const key = `${item.location}__${topicId}`;

        const chatgptMentioned = Boolean(item.chatgptMentioned);
        const claudeMentioned = Boolean(item.claudeMentioned);
        const geminiMentioned = Boolean(item.geminiMentioned);
        const mastered = chatgptMentioned && claudeMentioned && geminiMentioned;

        map[key] = {
          key,
          location: item.location,
          topicId,
          topicName: matchedTemplate ? matchedTemplate.topic : item.topic,
          prompt: item.prompt || '',
          lastTestedDate: runDate,
          chatgptMentioned,
          claudeMentioned,
          geminiMentioned,
          mastered
        };
      }
    }

    if (Object.keys(map).length > 0) {
      await adminDb.collection('settings').doc('llm_question_state').set({
        questions: map,
        updatedAt: new Date().toISOString()
      });
    }

    return map;
  } catch (e) {
    console.error('Error loading/backfilling question state map:', e);
    return {};
  }
}

export async function saveQuestionStateMap(map: Record<string, QuestionStateRecord>): Promise<void> {
  if (!adminDb || !adminDb.collection) return;
  try {
    await adminDb.collection('settings').doc('llm_question_state').set({
      questions: map,
      updatedAt: new Date().toISOString()
    });
  } catch (e) {
    console.error('Error saving question state map:', e);
  }
}

export interface CandidateQuestion {
  key: string;
  location: string;
  tier: 'primary' | 'secondary' | 'regional';
  topicId: string;
  topicName: string;
  prompt: string;
}

/**
 * Generates the full ordered candidate list of (location, topic) questions.
 * Uses the core 5 English topics across primary & regional locations first,
 * interleaved by topic/location so each small batch tests a diverse mix of towns.
 */
export function buildCandidateQuestionPool(): CandidateQuestion[] {
  const coreTopics = TOPIC_TEMPLATES.slice(0, 5);
  const primaryAndRegional = LOCATIONS.filter(l => l.tier === 'primary' || l.tier === 'regional');
  const secondaryLocs = LOCATIONS.filter(l => l.tier === 'secondary');

  const pool: CandidateQuestion[] = [];

  // Interleave by topic then location so consecutive picks cover different towns and topics
  for (const t of coreTopics) {
    for (const loc of primaryAndRegional) {
      const formattedLoc = formatLocationString(loc);
      pool.push({
        key: `${loc.name}__${t.id}`,
        location: loc.name,
        tier: loc.tier,
        topicId: t.id,
        topicName: t.topic,
        prompt: t.explicitTemplate.replace('{location}', formattedLoc)
      });
    }
  }

  // Also include secondary locations for general & emergency topics
  for (const t of coreTopics.slice(0, 2)) {
    for (const loc of secondaryLocs) {
      const formattedLoc = formatLocationString(loc);
      pool.push({
        key: `${loc.name}__${t.id}`,
        location: loc.name,
        tier: loc.tier,
        topicId: t.id,
        topicName: t.topic,
        prompt: t.explicitTemplate.replace('{location}', formattedLoc)
      });
    }
  }

  return pool;
}

export function selectNextQuestionsForRun(
  config: LLMBudgetConfig,
  stateMap: Record<string, QuestionStateRecord>,
  todayDateStr: string,
  isDryRun: boolean = false
): {
  selected: CandidateQuestion[];
  skippedMasteredCount: number;
  recheckedMasteredCount: number;
} {
  const pool = buildCandidateQuestionPool();
  const limit = isDryRun ? 2 : Math.max(1, Math.min(25, config.questionsPerRun || 6));

  let skippedMasteredCount = 0;
  let recheckedMasteredCount = 0;

  const eligible: { candidate: CandidateQuestion; lastTestedDate: string; isStaleMastered: boolean; poolIdx: number }[] = [];

  pool.forEach((candidate, poolIdx) => {
    const existing = stateMap[candidate.key];
    if (existing && existing.mastered && config.smartSkipMastered) {
      const daysSince = daysBetweenDates(existing.lastTestedDate, todayDateStr);
      if (daysSince < (config.recheckDays || 30)) {
        skippedMasteredCount++;
        return; // Skip this mastered question!
      } else {
        // Eligible for 30-day spot recheck
        eligible.push({
          candidate,
          lastTestedDate: existing.lastTestedDate,
          isStaleMastered: true,
          poolIdx
        });
        return;
      }
    }

    eligible.push({
      candidate,
      lastTestedDate: existing?.lastTestedDate || '0000-00-00', // Never-tested comes first
      isStaleMastered: false,
      poolIdx
    });
  });

  // Sort by oldest lastTestedDate first (never-tested '0000-00-00' first), then by poolIdx
  eligible.sort((a, b) => {
    if (a.lastTestedDate !== b.lastTestedDate) {
      return a.lastTestedDate.localeCompare(b.lastTestedDate);
    }
    return a.poolIdx - b.poolIdx;
  });

  // Pick up to `limit` questions, trying to diversify locations within the batch
  const picked: CandidateQuestion[] = [];
  const usedLocationsInBatch = new Set<string>();

  // Pass 1: pick distinct locations first
  for (const item of eligible) {
    if (picked.length >= limit) break;
    if (!usedLocationsInBatch.has(item.candidate.location)) {
      picked.push(item.candidate);
      usedLocationsInBatch.add(item.candidate.location);
      if (item.isStaleMastered) recheckedMasteredCount++;
    }
  }

  // Pass 2: if we still need more to fill `limit`, take remaining in order
  if (picked.length < limit) {
    const pickedKeys = new Set(picked.map(p => p.key));
    for (const item of eligible) {
      if (picked.length >= limit) break;
      if (!pickedKeys.has(item.candidate.key)) {
        picked.push(item.candidate);
        pickedKeys.add(item.candidate.key);
        if (item.isStaleMastered) recheckedMasteredCount++;
      }
    }
  }

  return {
    selected: picked,
    skippedMasteredCount,
    recheckedMasteredCount
  };
}

/**
 * Computes rolling visibility scores across all tracked questions in `stateMap`
 * so that mastered questions (e.g. Grayslake) carry their scores forward when skipped.
 */
export function calculateCarryForwardScores(stateMap: Record<string, QuestionStateRecord>): {
  chatgptScore: number;
  claudeScore: number;
  geminiScore: number;
  totalTrackedQuestions: number;
  masteredQuestionsCount: number;
} {
  const entries = Object.values(stateMap);
  const total = entries.length;
  if (total === 0) {
    return {
      chatgptScore: 0,
      claudeScore: 0,
      geminiScore: 0,
      totalTrackedQuestions: 0,
      masteredQuestionsCount: 0
    };
  }

  let gptHits = 0;
  let claudeHits = 0;
  let geminiHits = 0;
  let masteredCount = 0;

  for (const item of entries) {
    if (item.chatgptMentioned) gptHits++;
    if (item.claudeMentioned) claudeHits++;
    if (item.geminiMentioned) geminiHits++;
    if (item.mastered) masteredCount++;
  }

  return {
    chatgptScore: Math.round((gptHits / total) * 100),
    claudeScore: Math.round((claudeHits / total) * 100),
    geminiScore: Math.round((geminiHits / total) * 100),
    totalTrackedQuestions: total,
    masteredQuestionsCount: masteredCount
  };
}
