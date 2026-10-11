import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { 
  LOCATIONS, 
  TOPIC_TEMPLATES, 
  formatLocationString 
} from '@/lib/ai-harness/config';
import { detectBrandMention } from '@/lib/ai-harness/detector';
import { analyzeCitations } from '@/lib/ai-harness/citations';
import { runPreflightChecks } from '@/lib/ai-harness/preflight';
import { acquireRunLock, releaseRunLock } from '@/lib/ai-harness/lock';
import { HarnessRow, computeHash, saveRunOutputs } from '@/lib/ai-harness/export';

export const maxDuration = 60; // 60 seconds serverless maximum

// Core communities always tested on every run
const CORE_COMMUNITIES = [
  "Grayslake",
  "Lake County, IL"
];

// Rotating communities (one tested per run)
const ROTATING_COMMUNITIES = [
  "Round Lake Beach",
  "Lake Villa",
  "Libertyville",
  "Waukegan",
  "Gurnee",
  "Mundelein",
  "Antioch",
  "Round Lake",
  "Lindenhurst",
  "McHenry"
];

export async function GET(request: Request) {
  // Validate authorization (cron secret) to prevent unauthorized triggering
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const isDryRun = searchParams.get('dryRun') === 'true';

  // Acquire concurrency lock
  const lock = await acquireRunLock();
  if (!lock.acquired) {
    return NextResponse.json({
      error: 'Harness run currently active',
      reason: lock.reason
    }, { status: 429 });
  }

  const startTime = new Date();
  const dateStr = startTime.toISOString().split('T')[0];

  try {
    // 1. Preflight check
    const preflight = await runPreflightChecks();
    const activeEngines = preflight.activeEngines;

    if (activeEngines.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No active AI search engines passed preflight',
        abortedEngines: preflight.abortedEngines,
        alertMessage: preflight.alertMessage
      }, { status: 502 });
    }

    // 2. Select communities
    const shuffledRotating = [...ROTATING_COMMUNITIES].sort(() => 0.5 - Math.random());
    const selectedCommunities = isDryRun 
      ? ["Grayslake"] 
      : [...CORE_COMMUNITIES, shuffledRotating[0]];

    // 3. Select topic templates
    const templatesToTest = isDryRun 
      ? TOPIC_TEMPLATES.slice(0, 2) 
      : TOPIC_TEMPLATES.slice(0, 5);

    const tasks: { location: string; topicId: string; topicName: string; prompt: string }[] = [];
    for (const locName of selectedCommunities) {
      for (const t of templatesToTest) {
        const locConfig = LOCATIONS.find(l => l.name.toLowerCase() === locName.toLowerCase()) || {
          name: locName,
          state: locName.includes("WI") ? "WI" : "IL",
          tier: 'primary' as const
        };
        const formattedLoc = formatLocationString(locConfig);
        const promptText = t.explicitTemplate.replace("{location}", formattedLoc);
        tasks.push({
          location: locName,
          topicId: t.id,
          topicName: t.topic,
          prompt: promptText
        });
      }
    }

    const runRows: HarnessRow[] = [];
    const dashboardLogs: any[] = [];
    const criticalErrors: string[] = [];

    if (preflight.alertMessage) {
      criticalErrors.push(preflight.alertMessage);
    }

    // Track metrics
    const engineSuccesses: Record<string, number> = {};
    const engineTotals: Record<string, number> = {};
    activeEngines.forEach(e => {
      engineSuccesses[e.name] = 0;
      engineTotals[e.name] = 0;
    });

    // Execute tasks CONCURRENTLY across all engines to finish within serverless timeouts (typically < 10s)
    const taskResults = await Promise.all(
      tasks.map(async (task, taskIdx) => {
        const taskLog: any = {
          location: task.location,
          topic: task.topicName,
          prompt: task.prompt,
          engines: {}
        };
        const rowsForTask: HarnessRow[] = [];

        // Run all active engines concurrently for this prompt
        await Promise.all(
          activeEngines.map(async (engine) => {
            // Slight stagger for Gemini rate-limits
            if (engine.name === 'Gemini' && taskIdx > 0) {
              await new Promise(r => setTimeout(r, (taskIdx % 4) * 250));
            }

            let queryResult;
            try {
              // 12s per-call timeout
              queryResult = await engine.query(task.prompt, 12000);
            } catch (err: any) {
              queryResult = {
                engine: engine.name,
                model: 'unknown',
                status: 'api_error' as const,
                responseText: '',
                rawCitations: [],
                latencyMs: 0,
                errorMessage: err?.message || String(err)
              };
            }

            const responseText = queryResult.responseText || '';
            const status = queryResult.status;

            if (status === 'api_error' || status === 'timeout') {
              const errAlert = `${engine.name} (${queryResult.model}): ${queryResult.errorMessage || status}`;
              if (!criticalErrors.includes(errAlert)) criticalErrors.push(errAlert);
            }

            const detection = detectBrandMention(responseText);
            const citationData = analyzeCitations(responseText, queryResult.rawCitations);

            if (detection.isMentioned) {
              engineSuccesses[engine.name] = (engineSuccesses[engine.name] || 0) + 1;
            }
            engineTotals[engine.name] = (engineTotals[engine.name] || 0) + 1;

            const row: HarnessRow = {
              run_date: dateStr,
              engine: engine.name,
              model: queryResult.model,
              prompt_id: task.topicId,
              topic: task.topicName,
              location: task.location,
              language: "en",
              phrasing: "explicit",
              run_idx: 1,
              status,
              mention_class: detection.mentionClass,
              list_position: detection.listPosition === null ? '' : detection.listPosition,
              kidsdds_cited: citationData.kidsddsCited,
              cited_domains: citationData.citedDomains.join('; '),
              competitors: citationData.competitors.join('; '),
              response_text: responseText,
              response_hash: computeHash(responseText)
            };
            rowsForTask.push(row);

            taskLog.engines[engine.name] = {
              response: responseText,
              status,
              mentioned: detection.isMentioned,
              mentionClass: detection.mentionClass,
              listPosition: detection.listPosition,
              kidsddsCited: citationData.kidsddsCited
            };

            if (engine.name === 'OpenAI') {
              taskLog.chatgptResponse = responseText;
              taskLog.chatgptMentioned = detection.isMentioned;
            } else if (engine.name === 'Claude') {
              taskLog.claudeResponse = responseText;
              taskLog.claudeMentioned = detection.isMentioned;
            } else if (engine.name === 'Gemini') {
              taskLog.geminiResponse = responseText;
              taskLog.geminiMentioned = detection.isMentioned;
            } else if (engine.name === 'Perplexity') {
              taskLog.perplexityResponse = responseText;
              taskLog.perplexityMentioned = detection.isMentioned;
            }
          })
        );

        return { taskLog, rowsForTask };
      })
    );

    // Aggregate results
    for (const res of taskResults) {
      dashboardLogs.push(res.taskLog);
      runRows.push(...res.rowsForTask);
    }

    const endTime = new Date();
    const durationMs = endTime.getTime() - startTime.getTime();

    // Calculate visibility percentages
    const chatgptScore = engineTotals['OpenAI'] ? Math.round(((engineSuccesses['OpenAI'] || 0) / engineTotals['OpenAI']) * 100) : 0;
    const claudeScore = engineTotals['Claude'] ? Math.round(((engineSuccesses['Claude'] || 0) / engineTotals['Claude']) * 100) : 0;
    const geminiScore = engineTotals['Gemini'] ? Math.round(((engineSuccesses['Gemini'] || 0) / engineTotals['Gemini']) * 100) : 0;
    const perplexityScore = engineTotals['Perplexity'] ? Math.round(((engineSuccesses['Perplexity'] || 0) / engineTotals['Perplexity']) * 100) : 0;

    saveRunOutputs(dateStr, runRows);

    // Save to Firebase Firestore
    if (adminDb && adminDb.collection) {
      try {
        await adminDb.collection('cron_logs').add({
          date: dateStr,
          startTime,
          endTime,
          durationMs,
          communities_tested: selectedCommunities,
          chatgpt_score: chatgptScore,
          claude_score: claudeScore,
          gemini_score: geminiScore,
          perplexity_score: perplexityScore,
          engineTotals,
          engineSuccesses,
          criticalErrors,
          logs: dashboardLogs
        });

        await adminDb.collection('llm_visibility').doc(dateStr).set({
          date: dateStr,
          chatgpt_score: chatgptScore,
          claude_score: claudeScore,
          gemini_score: geminiScore,
          perplexity_score: perplexityScore,
          communities_tested: selectedCommunities,
          timestamp: new Date()
        });

        await adminDb.collection('system_alerts').doc('latest_cron_alert').set({
          date: dateStr,
          timestamp: new Date(),
          resolved: criticalErrors.length === 0,
          issues: criticalErrors
        });
      } catch (fbErr) {
        console.error("Firestore persistence error:", fbErr);
      }
    }

    const hasCriticalIssues = criticalErrors.length > 0;
    return NextResponse.json({
      success: !hasCriticalIssues,
      date: dateStr,
      durationMs,
      scores: {
        chatgpt: chatgptScore,
        claude: claudeScore,
        gemini: geminiScore,
        perplexity: perplexityScore
      },
      criticalErrors,
      tested: selectedCommunities
    }, { status: hasCriticalIssues ? 502 : 200 });

  } finally {
    await releaseRunLock();
  }
}
