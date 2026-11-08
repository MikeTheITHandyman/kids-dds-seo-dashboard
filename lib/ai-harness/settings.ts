import { adminDb } from '@/lib/firebase-admin';
import { LOCATIONS, TOPIC_TEMPLATES, formatLocationString, LocationConfig } from './config';
import {
  ClientConfig,
  CustomQuestion,
  DEFAULT_CLIENT_ID,
  DEFAULT_KIDS_DENTIST_CLIENT,
  DEFAULT_KIDS_DENTIST_QUESTIONS,
  getClientConfig,
  getScopedDocId,
  saveClientConfig,
} from '@/lib/clients';

export type LLMPreset = 'minimize_costs' | 'balanced' | 'maximize_inquiries' | 'custom';
export type LLMFrequency = 'daily' | 'every_other_day' | 'weekly' | 'monthly';

export interface LLMBudgetConfig {
  preset: LLMPreset;
  frequency: LLMFrequency;
  questionsPerRun: number;
  smartSkipMastered: boolean;
  recheckDays: number;
  autoFollowUpNotMentioned: boolean;
  regionalRotationEnabled: boolean;
  currentRegionIndex: number;
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

export const PRESET_CONFIGS: Record<
  Exclude<LLMPreset, 'custom'>,
  Omit<LLMBudgetConfig, 'updatedAt' | 'updatedBy' | 'autoFollowUpNotMentioned' | 'regionalRotationEnabled' | 'currentRegionIndex'>
> = {
  minimize_costs: {
    preset: 'minimize_costs',
    frequency: 'weekly',
    questionsPerRun: 3,
    smartSkipMastered: true,
    recheckDays: 30,
  },
  balanced: {
    preset: 'balanced',
    frequency: 'every_other_day',
    questionsPerRun: 6,
    smartSkipMastered: true,
    recheckDays: 30,
  },
  maximize_inquiries: {
    preset: 'maximize_inquiries',
    frequency: 'daily',
    questionsPerRun: 15,
    smartSkipMastered: false,
    recheckDays: 30,
  },
};

export const DEFAULT_LLM_CONFIG: LLMBudgetConfig = {
  ...PRESET_CONFIGS.balanced,
  autoFollowUpNotMentioned: false,
  regionalRotationEnabled: true,
  currentRegionIndex: 0,
};

export async function getLLMBudgetConfig(clientId: string = DEFAULT_CLIENT_ID): Promise<LLMBudgetConfig> {
  if (!adminDb || !adminDb.collection) {
    return DEFAULT_LLM_CONFIG;
  }
  const docId = getScopedDocId('llm_config', clientId);
  try {
    const doc = await adminDb.collection('settings').doc(docId).get();
    if (doc.exists) {
      const data = doc.data() as Partial<LLMBudgetConfig>;
      return {
        preset: data.preset || DEFAULT_LLM_CONFIG.preset,
        frequency: data.frequency || DEFAULT_LLM_CONFIG.frequency,
        questionsPerRun:
          typeof data.questionsPerRun === 'number'
            ? data.questionsPerRun
            : DEFAULT_LLM_CONFIG.questionsPerRun,
        smartSkipMastered:
          typeof data.smartSkipMastered === 'boolean'
            ? data.smartSkipMastered
            : DEFAULT_LLM_CONFIG.smartSkipMastered,
        recheckDays:
          typeof data.recheckDays === 'number' ? data.recheckDays : DEFAULT_LLM_CONFIG.recheckDays,
        autoFollowUpNotMentioned:
          typeof data.autoFollowUpNotMentioned === 'boolean'
            ? data.autoFollowUpNotMentioned
            : DEFAULT_LLM_CONFIG.autoFollowUpNotMentioned,
        regionalRotationEnabled:
          typeof data.regionalRotationEnabled === 'boolean'
            ? data.regionalRotationEnabled
            : DEFAULT_LLM_CONFIG.regionalRotationEnabled,
        currentRegionIndex:
          typeof data.currentRegionIndex === 'number'
            ? data.currentRegionIndex
            : DEFAULT_LLM_CONFIG.currentRegionIndex,
        updatedAt: data.updatedAt,
        updatedBy: data.updatedBy,
      };
    }
  } catch (e) {
    console.error('Error loading llm_config from Firestore:', e);
  }
  return DEFAULT_LLM_CONFIG;
}

export async function saveLLMBudgetConfig(
  config: Partial<LLMBudgetConfig>,
  userEmail?: string,
  clientId: string = DEFAULT_CLIENT_ID
): Promise<LLMBudgetConfig> {
  const current = await getLLMBudgetConfig(clientId);
  const next: LLMBudgetConfig = {
    preset: config.preset ?? current.preset,
    frequency: config.frequency ?? current.frequency,
    questionsPerRun: config.questionsPerRun ?? current.questionsPerRun,
    smartSkipMastered: config.smartSkipMastered ?? current.smartSkipMastered,
    recheckDays: config.recheckDays ?? current.recheckDays,
    autoFollowUpNotMentioned: config.autoFollowUpNotMentioned ?? current.autoFollowUpNotMentioned,
    regionalRotationEnabled: config.regionalRotationEnabled ?? current.regionalRotationEnabled,
    currentRegionIndex: config.currentRegionIndex ?? current.currentRegionIndex,
    updatedAt: new Date().toISOString(),
    updatedBy: userEmail || current.updatedBy || 'admin',
  };

  if (adminDb && adminDb.collection) {
    const docId = getScopedDocId('llm_config', clientId);
    await adminDb.collection('settings').doc(docId).set(next, { merge: true });
  }
  return next;
}

export function daysBetweenDates(dateA: string, dateB: string): number {
  const a = new Date(`${dateA}T00:00:00Z`).getTime();
  const b = new Date(`${dateB}T00:00:00Z`).getTime();
  if (isNaN(a) || isNaN(b)) return 999;
  return Math.round(Math.abs(b - a) / (1000 * 60 * 60 * 24));
}

export async function getLastRunDate(clientId: string = DEFAULT_CLIENT_ID): Promise<string | null> {
  if (!adminDb || !adminDb.collection) return null;
  try {
    const snap = await adminDb
      .collection('llm_visibility')
      .orderBy('date', 'desc')
      .limit(25)
      .get();
    if (!snap.empty) {
      for (const doc of snap.docs) {
        const d = doc.data();
        const docClient = d?.clientId || DEFAULT_CLIENT_ID;
        if (docClient === clientId) {
          return d?.date || doc.id || null;
        }
      }
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
    monthly: 30,
  };

  const requiredDays = requiredDaysMap[config.frequency] || 2;

  if (daysSince < requiredDays) {
    return {
      shouldRun: false,
      reason: `Frequency is set to '${config.frequency}' (requires ${requiredDays}d gap; last run was ${lastRunDate}, ${daysSince}d ago)`,
      daysSinceLastRun: daysSince,
    };
  }

  return {
    shouldRun: true,
    reason: `Eligible to run (${daysSince}d since last run on ${lastRunDate}; frequency=${config.frequency})`,
    daysSinceLastRun: daysSince,
  };
}

/**
 * Loads the rolling question state map from Firestore (`settings/llm_question_state` or client-scoped).
 */
export async function loadQuestionStateMap(
  clientId: string = DEFAULT_CLIENT_ID
): Promise<Record<string, QuestionStateRecord>> {
  if (!adminDb || !adminDb.collection) return {};

  const docId = getScopedDocId('llm_question_state', clientId);
  try {
    const stateDoc = await adminDb.collection('settings').doc(docId).get();
    if (stateDoc.exists && stateDoc.data()?.questions) {
      return stateDoc.data()!.questions as Record<string, QuestionStateRecord>;
    }

    if (clientId !== DEFAULT_CLIENT_ID) {
      return {};
    }

    // Backfill from historical cron_logs for default client (Kids Dentist)
    const logsSnap = await adminDb.collection('cron_logs').limit(20).get();
    const allRuns = logsSnap.docs
      .map((d: any) => ({ id: d.id, ...(d.data() || {}) }))
      .filter((r: any) => (!r.clientId || r.clientId === DEFAULT_CLIENT_ID) && Array.isArray(r.logs) && r.logs.length > 0)
      .sort((a: any, b: any) => String(a.date || '').localeCompare(String(b.date || '')));

    const map: Record<string, QuestionStateRecord> = {};

    for (const run of allRuns) {
      const runDate = run.date || new Date().toISOString().split('T')[0];
      for (const item of run.logs) {
        if (!item.location || !item.topic) continue;
        const matchedTemplate = TOPIC_TEMPLATES.find(
          t => t.topic.toLowerCase() === String(item.topic).toLowerCase() || t.id === item.topic
        );
        const topicId = matchedTemplate
          ? matchedTemplate.id
          : String(item.topic)
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '_');
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
          mastered,
        };
      }
    }

    if (Object.keys(map).length > 0) {
      await adminDb.collection('settings').doc(docId).set({
        questions: map,
        updatedAt: new Date().toISOString(),
      });
    }

    return map;
  } catch (e) {
    console.error('Error loading/backfilling question state map:', e);
    return {};
  }
}

export async function saveQuestionStateMap(
  map: Record<string, QuestionStateRecord>,
  clientId: string = DEFAULT_CLIENT_ID
): Promise<void> {
  if (!adminDb || !adminDb.collection) return;
  const docId = getScopedDocId('llm_question_state', clientId);
  try {
    await adminDb.collection('settings').doc(docId).set({
      questions: map,
      updatedAt: new Date().toISOString(),
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
  isRegional: boolean;
}

export function formatPromptWithRegion(question: CustomQuestion, loc?: LocationConfig): string {
  const template = question.promptTemplate.trim();
  if (!question.isRegional || !loc) {
    return template.replace(/\{location\}/gi, '').replace(/\s+/g, ' ').trim();
  }
  const formattedLoc = formatLocationString(loc);
  if (/\{location\}/i.test(template)) {
    return template.replace(/\{location\}/gi, formattedLoc);
  }
  // If user marked question as regional but omitted {location}, append naturally
  const withoutTrailingQ = template.endsWith('?') ? template.slice(0, -1).trim() : template;
  return `${withoutTrailingQ} in or near ${formattedLoc}?`;
}

/**
 * Generates the ordered candidate list of questions for a client.
 * When `regionalRotationEnabled` is true, orders the pool starting from `startRegionIndex`
 * so each run focuses on the current region in the rotation list (e.g. Run 1: Mundelein, Run 2: Libertyville, Run 3: Waukegan).
 */
export function buildCandidateQuestionPool(
  client: ClientConfig = DEFAULT_KIDS_DENTIST_CLIENT,
  startRegionIndex: number = 0,
  regionalRotationEnabled: boolean = true
): CandidateQuestion[] {
  const activeQuestions = (
    client.questions && client.questions.length > 0
      ? client.questions
      : DEFAULT_KIDS_DENTIST_QUESTIONS
  ).filter(q => q.enabled !== false);

  const regions =
    client.regions && client.regions.length > 0 ? client.regions : LOCATIONS;

  const pool: CandidateQuestion[] = [];

  // 1. Non-regional questions (if any)
  const nonRegionalQuestions = activeQuestions.filter(q => !q.isRegional);
  for (const q of nonRegionalQuestions) {
    pool.push({
      key: `General__${q.id}`,
      location: client.primaryLocation || 'General',
      tier: 'primary',
      topicId: q.id,
      topicName: q.topic,
      prompt: formatPromptWithRegion(q),
      isRegional: false,
    });
  }

  // 2. Regional questions
  const regionalQuestions = activeQuestions.filter(q => q.isRegional);
  if (regionalQuestions.length === 0 || regions.length === 0) {
    return pool;
  }

  if (regionalRotationEnabled) {
    // Location-per-run order: group all regional questions for the current region first,
    // then the next region in the rotation, and so on.
    for (let offset = 0; offset < regions.length; offset++) {
      const regIdx = (startRegionIndex + offset) % regions.length;
      const loc = regions[regIdx];
      for (const q of regionalQuestions) {
        pool.push({
          key: `${loc.name}__${q.id}`,
          location: loc.name,
          tier: loc.tier || 'primary',
          topicId: q.id,
          topicName: q.topic,
          prompt: formatPromptWithRegion(q, loc),
          isRegional: true,
        });
      }
    }
  } else {
    // Interleave by topic then location
    for (const q of regionalQuestions) {
      for (const loc of regions) {
        pool.push({
          key: `${loc.name}__${q.id}`,
          location: loc.name,
          tier: loc.tier || 'primary',
          topicId: q.id,
          topicName: q.topic,
          prompt: formatPromptWithRegion(q, loc),
          isRegional: true,
        });
      }
    }
  }

  return pool;
}

export function selectNextQuestionsForRun(
  config: LLMBudgetConfig,
  stateMap: Record<string, QuestionStateRecord>,
  todayDateStr: string,
  isDryRun: boolean = false,
  client: ClientConfig = DEFAULT_KIDS_DENTIST_CLIENT
): {
  selected: CandidateQuestion[];
  skippedMasteredCount: number;
  recheckedMasteredCount: number;
  nextRegionIndex: number;
  primaryRegionTested: string | null;
} {
  const regions = client.regions && client.regions.length > 0 ? client.regions : LOCATIONS;
  const regionalRotation = config.regionalRotationEnabled ?? client.regionalRotationEnabled ?? true;
  const startRegionIdx =
    regions.length > 0
      ? ((config.currentRegionIndex ?? client.currentRegionIndex ?? 0) % regions.length + regions.length) %
        regions.length
      : 0;

  const pool = buildCandidateQuestionPool(client, startRegionIdx, regionalRotation);
  const limit = isDryRun ? 2 : Math.max(1, Math.min(25, config.questionsPerRun || 6));

  let skippedMasteredCount = 0;
  let recheckedMasteredCount = 0;

  const eligible: {
    candidate: CandidateQuestion;
    lastTestedDate: string;
    isStaleMastered: boolean;
    poolIdx: number;
  }[] = [];

  pool.forEach((candidate, poolIdx) => {
    const existing = stateMap[candidate.key];
    if (existing && existing.mastered && config.smartSkipMastered) {
      const daysSince = daysBetweenDates(existing.lastTestedDate, todayDateStr);
      if (daysSince < (config.recheckDays || 30)) {
        skippedMasteredCount++;
        return; // Skip this mastered question
      } else {
        eligible.push({
          candidate,
          lastTestedDate: existing.lastTestedDate,
          isStaleMastered: true,
          poolIdx,
        });
        return;
      }
    }

    eligible.push({
      candidate,
      lastTestedDate: existing?.lastTestedDate || '0000-00-00',
      isStaleMastered: false,
      poolIdx,
    });
  });

  const picked: CandidateQuestion[] = [];

  if (regionalRotation) {
    // Location-per-run mode: preserve the rotation order starting at startRegionIdx
    // so all eligible questions for the current region are asked before moving to the next region
    for (const item of eligible) {
      if (picked.length >= limit) break;
      picked.push(item.candidate);
      if (item.isStaleMastered) recheckedMasteredCount++;
    }
  } else {
    // Multi-town diversified mode: sort by oldest lastTestedDate, then pick distinct locations first
    eligible.sort((a, b) => {
      if (a.lastTestedDate !== b.lastTestedDate) {
        return a.lastTestedDate.localeCompare(b.lastTestedDate);
      }
      return a.poolIdx - b.poolIdx;
    });

    const usedLocationsInBatch = new Set<string>();
    for (const item of eligible) {
      if (picked.length >= limit) break;
      if (!usedLocationsInBatch.has(item.candidate.location)) {
        picked.push(item.candidate);
        usedLocationsInBatch.add(item.candidate.location);
        if (item.isStaleMastered) recheckedMasteredCount++;
      }
    }

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
  }

  // Advance region pointer for the next run
  const nextRegionIndex =
    regions.length > 0 ? (startRegionIdx + 1) % regions.length : 0;
  const primaryRegionTested =
    regions.length > 0 ? regions[startRegionIdx]?.name || null : null;

  return {
    selected: picked,
    skippedMasteredCount,
    recheckedMasteredCount,
    nextRegionIndex,
    primaryRegionTested,
  };
}

/**
 * Builds the follow-up prompt asking an LLM why the client was not mentioned in its prior answer.
 */
export function buildWhyNotMentionedPrompt(
  originalQuestion: string,
  originalResponse: string,
  client: ClientConfig = DEFAULT_KIDS_DENTIST_CLIENT
): string {
  const snippet =
    originalResponse.length > 1500
      ? originalResponse.slice(0, 1500) + '...'
      : originalResponse;
  const domainInfo = client.domain ? ` (${client.domain})` : '';
  const locationInfo = client.primaryLocation ? ` located in ${client.primaryLocation}` : '';

  return [
    `Regarding the question: "${originalQuestion}"`,
    `Your previous response was:`,
    `"""`,
    snippet,
    `"""`,
    ``,
    `Why was "${client.name}"${domainInfo}${locationInfo} not included in your recommendations above?`,
    `Please explain concisely:`,
    `1. What specific criteria, authority signals, citations, or geographic factors caused other practices/businesses to be listed instead.`,
    `2. What concrete steps, directory citations, or website content signals would help "${client.name}" be included for this query in the future.`,
  ].join('\n');
}

/**
 * Computes rolling visibility scores across all tracked questions in `stateMap`
 * so that mastered questions carry their scores forward when skipped.
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
      masteredQuestionsCount: 0,
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
    masteredQuestionsCount: masteredCount,
  };
}
