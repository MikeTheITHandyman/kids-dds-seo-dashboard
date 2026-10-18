import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { detectBrandMention } from '@/lib/ai-harness/detector';
import { analyzeCitations } from '@/lib/ai-harness/citations';
import { runPreflightChecks } from '@/lib/ai-harness/preflight';
import { acquireRunLock, releaseRunLock } from '@/lib/ai-harness/lock';
import { HarnessRow, computeHash, saveRunOutputs } from '@/lib/ai-harness/export';
import {
  getLLMBudgetConfig,
  getLastRunDate,
  checkScheduleEligibility,
  loadQuestionStateMap,
  saveQuestionStateMap,
  selectNextQuestionsForRun,
  calculateCarryForwardScores
} from '@/lib/ai-harness/settings';

export const maxDuration = 60; // 60 seconds serverless maximum

export async function GET(request: Request) {
  // Validate authorization (cron secret) to prevent unauthorized triggering
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const isDryRun = searchParams.get('dryRun') === 'true';
  const isForceRun = searchParams.get('force') === 'true';

  const startTime = new Date();
  const dateStr = startTime.toISOString().split('T')[0];

  // 0. Check frequency & budget schedule BEFORE preflight so off-days spend 0 API credits
  const budgetConfig = await getLLMBudgetConfig();
  if (!isDryRun && !isForceRun) {
    const lastRunDate = await getLastRunDate();
    const scheduleCheck = checkScheduleEligibility(budgetConfig, lastRunDate, dateStr);
    if (!scheduleCheck.shouldRun) {
      return NextResponse.json({
        success: true,
        skipped: true,
        date: dateStr,
        preset: budgetConfig.preset,
        frequency: budgetConfig.frequency,
        reason: scheduleCheck.reason
      });
    }
  }

  // Acquire concurrency lock
  const lock = await acquireRunLock();
  if (!lock.acquired) {
    return NextResponse.json({
      error: 'Harness run currently active',
      reason: lock.reason
    }, { status: 429 });
  }

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

    // 2. Load rolling question state & select rotated questions (skipping mastered unless >30d old)
    const stateMap = await loadQuestionStateMap();
    const { selected: tasks, skippedMasteredCount, recheckedMasteredCount } = selectNextQuestionsForRun(
      budgetConfig,
      stateMap,
      dateStr,
      isDryRun
    );

    const selectedCommunities = Array.from(new Set(tasks.map(t => t.location)));

    const runRows: HarnessRow[] = [];
    const dashboardLogs: any[] = [];
    const criticalErrors: string[] = [];

    if (preflight.alertMessage) {
      criticalErrors.push(preflight.alertMessage);
    }

    // Track batch metrics
    const engineSuccesses: Record<string, number> = {};
    const engineFailures: Record<string, number> = {};
    const engineTotals: Record<string, number> = {};
    activeEngines.forEach(e => {
      engineSuccesses[e.name] = 0;
      engineFailures[e.name] = 0;
      engineTotals[e.name] = 0;
    });

    // Execute tasks CONCURRENTLY across all engines to finish within serverless timeouts
    const taskResults = await Promise.all(
      tasks.map(async (task, taskIdx) => {
        const taskLog: any = {
          key: task.key,
          location: task.location,
          topicId: task.topicId,
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
              await new Promise(r => setTimeout(r, (taskIdx % 4) * 200));
            }

            let queryResult;
            try {
              // 18s per-call timeout
              queryResult = await engine.query(task.prompt, 18000);
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

            engineTotals[engine.name] = (engineTotals[engine.name] || 0) + 1;
            if (status === 'api_error' || status === 'timeout') {
              engineFailures[engine.name] = (engineFailures[engine.name] || 0) + 1;
            }

            const detection = detectBrandMention(responseText);
            const citationData = analyzeCitations(responseText, queryResult.rawCitations);

            if (detection.isMentioned) {
              engineSuccesses[engine.name] = (engineSuccesses[engine.name] || 0) + 1;
            }

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

    // Aggregate results & update rolling question state
    for (const res of taskResults) {
      dashboardLogs.push(res.taskLog);
      runRows.push(...res.rowsForTask);

      const tLog = res.taskLog;
      const gptOk = tLog.engines['OpenAI']?.status === 'ok';
      const claudeOk = tLog.engines['Claude']?.status === 'ok';
      const geminiOk = tLog.engines['Gemini']?.status === 'ok';

      // Only update rolling state if at least one engine succeeded cleanly
      if (gptOk || claudeOk || geminiOk) {
        const prev = stateMap[tLog.key];
        const chatgptMentioned = gptOk ? Boolean(tLog.chatgptMentioned) : Boolean(prev?.chatgptMentioned);
        const claudeMentioned = claudeOk ? Boolean(tLog.claudeMentioned) : Boolean(prev?.claudeMentioned);
        const geminiMentioned = geminiOk ? Boolean(tLog.geminiMentioned) : Boolean(prev?.geminiMentioned);

        stateMap[tLog.key] = {
          key: tLog.key,
          location: tLog.location,
          topicId: tLog.topicId,
          topicName: tLog.topic,
          prompt: tLog.prompt,
          lastTestedDate: dateStr,
          chatgptMentioned,
          claudeMentioned,
          geminiMentioned,
          mastered: chatgptMentioned && claudeMentioned && geminiMentioned
        };
      }
    }

    if (!isDryRun) {
      await saveQuestionStateMap(stateMap);
    }

    const endTime = new Date();
    const durationMs = endTime.getTime() - startTime.getTime();

    // Calculate batch visibility percentages (just the questions asked in this run)
    const batchChatgptScore = engineTotals['OpenAI'] ? Math.round(((engineSuccesses['OpenAI'] || 0) / engineTotals['OpenAI']) * 100) : 0;
    const batchClaudeScore = engineTotals['Claude'] ? Math.round(((engineSuccesses['Claude'] || 0) / engineTotals['Claude']) * 100) : 0;
    const batchGeminiScore = engineTotals['Gemini'] ? Math.round(((engineSuccesses['Gemini'] || 0) / engineTotals['Gemini']) * 100) : 0;
    const perplexityScore = engineTotals['Perplexity'] ? Math.round(((engineSuccesses['Perplexity'] || 0) / engineTotals['Perplexity']) * 100) : 0;

    // Calculate rolling carry-forward visibility scores across all tracked questions (including skipped Mastered ones)
    const rolling = calculateCarryForwardScores(stateMap);
    const chatgptScore = rolling.totalTrackedQuestions > 0 ? rolling.chatgptScore : batchChatgptScore;
    const claudeScore = rolling.totalTrackedQuestions > 0 ? rolling.claudeScore : batchClaudeScore;
    const geminiScore = rolling.totalTrackedQuestions > 0 ? rolling.geminiScore : batchGeminiScore;

    // Check failure rates per engine: only report critical error if > 20% fail
    for (const [engName, failedCount] of Object.entries(engineFailures)) {
      const totalCount = engineTotals[engName] || 1;
      const failRatio = failedCount / totalCount;
      if (failRatio > 0.20) {
        criticalErrors.push(`${engName}: ${failedCount}/${totalCount} calls failed (${Math.round(failRatio * 100)}% > 20% threshold)`);
      }
    }

    saveRunOutputs(dateStr, runRows);

    // Save to Firebase Firestore
    if (adminDb && adminDb.collection && !isDryRun) {
      try {
        await adminDb.collection('cron_logs').add({
          date: dateStr,
          startTime,
          endTime,
          durationMs,
          budget_preset: budgetConfig.preset,
          questions_asked: tasks.length,
          questions_skipped_mastered: skippedMasteredCount,
          questions_rechecked_mastered: recheckedMasteredCount,
          total_tracked_questions: rolling.totalTrackedQuestions,
          mastered_questions_count: rolling.masteredQuestionsCount,
          communities_tested: selectedCommunities,
          chatgpt_score: chatgptScore,
          claude_score: claudeScore,
          gemini_score: geminiScore,
          perplexity_score: perplexityScore,
          batch_scores: {
            chatgpt: batchChatgptScore,
            claude: batchClaudeScore,
            gemini: batchGeminiScore
          },
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
          questions_asked: tasks.length,
          questions_skipped_mastered: skippedMasteredCount,
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
      budgetPreset: budgetConfig.preset,
      questionsAsked: tasks.length,
      skippedMasteredCount,
      recheckedMasteredCount,
      totalTrackedQuestions: rolling.totalTrackedQuestions,
      masteredQuestionsCount: rolling.masteredQuestionsCount,
      scores: {
        chatgpt: chatgptScore,
        claude: claudeScore,
        gemini: geminiScore,
        perplexity: perplexityScore
      },
      batchScores: {
        chatgpt: batchChatgptScore,
        claude: batchClaudeScore,
        gemini: batchGeminiScore
      },
      criticalErrors,
      tested: selectedCommunities
    }, { status: hasCriticalIssues ? 502 : 200 });

  } finally {
    await releaseRunLock();
  }
}
