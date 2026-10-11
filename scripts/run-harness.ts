import * as path from 'path';
import { 
  LOCATIONS, 
  TOPIC_TEMPLATES, 
  formatLocationString 
} from '../lib/ai-harness/config';
import { detectBrandMention } from '../lib/ai-harness/detector';
import { analyzeCitations } from '../lib/ai-harness/citations';
import { 
  HarnessRow, 
  computeHash, 
  saveRunOutputs, 
  generateMarkdownSummary 
} from '../lib/ai-harness/export';
import { runPreflightChecks } from '../lib/ai-harness/preflight';
import { acquireRunLock, releaseRunLock } from '../lib/ai-harness/lock';

// Load env if dotenv available
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('dotenv').config({ path: path.resolve(process.cwd(), '.env.local') });
} catch {
  // ignore
}

export interface RunnerOptions {
  cities?: string[];
  topicIds?: string[];
  repeats?: number;
  dryRun?: boolean;
}

export async function runHarness(options: RunnerOptions = {}): Promise<{ exitCode: number; summary: string }> {
  console.log("=================================================");
  console.log("   Kids Dentist AI Visibility Test Harness       ");
  console.log("=================================================");
  console.log(`Timestamp: ${new Date().toISOString()}`);

  const lock = await acquireRunLock();
  if (!lock.acquired) {
    console.error(`[LOCK ERROR] Another harness run is currently active: ${lock.reason}`);
    return { exitCode: 2, summary: "Run skipped: lock active" };
  }

  const runDate = new Date().toISOString().split('T')[0];
  const allRows: HarnessRow[] = [];

  try {
    // 1. Preflight
    console.log("\n[1/4] Running preflight checks across all configured engines...");
    const preflight = await runPreflightChecks();

    console.log(`Preflight status: ${preflight.isDegraded ? 'DEGRADED / WARNING' : 'PASSED'}`);
    for (const eng of preflight.activeEngines) {
      console.log(` - ${eng.name}: Active & Ready`);
    }
    for (const ab of preflight.abortedEngines) {
      console.warn(` ⚠️  ${ab.name} (${ab.model}): Aborted (${ab.reason})`);
    }

    if (preflight.activeEngines.length === 0) {
      console.error("[FATAL] No search engines passed preflight. Cannot proceed.");
      return { exitCode: 2, summary: "All engines failed preflight" };
    }

    // 2. Select locations and topics
    const targetLocations = options.cities 
      ? LOCATIONS.filter(l => options.cities!.includes(l.name))
      : (options.dryRun ? LOCATIONS.filter(l => l.name === 'Grayslake') : LOCATIONS);

    const targetTopics = options.topicIds
      ? TOPIC_TEMPLATES.filter(t => options.topicIds!.includes(t.id))
      : (options.dryRun ? TOPIC_TEMPLATES.slice(0, 2) : TOPIC_TEMPLATES);

    const repeats = options.repeats || (options.dryRun ? 1 : 3);

    console.log(`\n[2/4] Testing ${targetLocations.length} locations across ${targetTopics.length} topics with ${repeats} repeat(s).`);
    const totalCallsExpected = targetLocations.length * targetTopics.length * 2 * repeats * preflight.activeEngines.length;
    console.log(`Total scheduled engine calls: ${totalCallsExpected}`);
    console.log(`Estimated API cost for this run: ~$${(totalCallsExpected * 0.006).toFixed(2)} USD\n`);

    // 3. Execution loop
    console.log("[3/4] Executing grounded test harness...");
    let callCounter = 0;

    for (const loc of targetLocations) {
      const formattedLoc = formatLocationString(loc);

      for (const topic of targetTopics) {
        // Run both phrasings: natural and explicit
        const phrasings: ('natural' | 'explicit')[] = ['natural', 'explicit'];

        for (const phrasing of phrasings) {
          const promptTemplate = phrasing === 'natural' ? topic.naturalTemplate : topic.explicitTemplate;
          const promptText = promptTemplate.replace("{location}", formattedLoc);

          for (let runIdx = 1; runIdx <= repeats; runIdx++) {
            for (const engine of preflight.activeEngines) {
              callCounter++;
              process.stdout.write(`[${callCounter}/${totalCallsExpected}] ${engine.name} | ${loc.name} | ${topic.topic} (${phrasing} #${runIdx})... `);

              let queryResult;
              let retryCount = 0;
              const maxRetries = 3;

              while (retryCount < maxRetries) {
                try {
                  queryResult = await engine.query(promptText, 90000);
                  break;
                } catch (err: any) {
                  retryCount++;
                  if (retryCount >= maxRetries) {
                    queryResult = {
                      engine: engine.name,
                      model: 'unknown',
                      status: 'api_error' as const,
                      responseText: '',
                      rawCitations: [],
                      latencyMs: 0,
                      errorMessage: err?.message || String(err)
                    };
                  } else {
                    const delayMs = Math.pow(2, retryCount) * 1000;
                    await new Promise(r => setTimeout(r, delayMs));
                  }
                }
              }

              const responseText = queryResult?.responseText || '';
              const detection = detectBrandMention(responseText);
              const citationData = analyzeCitations(responseText, queryResult?.rawCitations || []);

              const row: HarnessRow = {
                run_date: runDate,
                engine: engine.name,
                model: queryResult?.model || 'unknown',
                prompt_id: topic.id,
                topic: topic.topic,
                location: loc.name,
                language: topic.language,
                phrasing,
                run_idx: runIdx,
                status: queryResult?.status || 'api_error',
                mention_class: detection.mentionClass,
                list_position: detection.listPosition === null ? '' : detection.listPosition,
                kidsdds_cited: citationData.kidsddsCited,
                cited_domains: citationData.citedDomains.join('; '),
                competitors: citationData.competitors.join('; '),
                response_text: responseText,
                response_hash: computeHash(responseText)
              };

              allRows.push(row);
              console.log(`${row.status.toUpperCase()} -> ${detection.mentionClass} (Pos: ${detection.listPosition || '-'})`);

              // Polite rate-limiting pause
              await new Promise(r => setTimeout(r, 500));
            }
          }
        }
      }
    }

    // 4. Persistence & Summary
    console.log("\n[4/4] Writing long-format CSV and Markdown summary reports...");
    const saved = saveRunOutputs(runDate, allRows);
    if (saved.csvPath) {
      console.log(`Saved run CSV: ${saved.csvPath}`);
      console.log(`Saved executive summary: ${saved.summaryPath}`);
    }

    const summaryMd = generateMarkdownSummary(runDate, allRows);

    // Calculate engine failure rates
    const engineFailures: Record<string, { total: number; failed: number }> = {};
    for (const r of allRows) {
      if (!engineFailures[r.engine]) engineFailures[r.engine] = { total: 0, failed: 0 };
      engineFailures[r.engine].total++;
      if (r.status !== 'ok') {
        engineFailures[r.engine].failed++;
      }
    }

    let isDegraded = preflight.isDegraded;
    let isFailed = false;

    for (const [eng, stats] of Object.entries(engineFailures)) {
      const failRate = stats.failed / stats.total;
      if (failRate > 0.20) {
        isDegraded = true;
        console.warn(`[WARNING] Engine ${eng} failure rate is ${(failRate * 100).toFixed(1)}% (>20% threshold)`);
      }
      if (failRate === 1.0) {
        isFailed = true;
      }
    }

    const exitCode = isFailed ? 2 : (isDegraded ? 1 : 0);
    console.log(`\nHarness finished with exit code ${exitCode} (${exitCode === 0 ? 'OK' : exitCode === 1 ? 'DEGRADED' : 'FAILED'})`);

    return { exitCode, summary: summaryMd };
  } finally {
    await releaseRunLock();
  }
}

// Direct CLI entrypoint
if (require.main === module) {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run') || args.includes('-d');
  const repeatsArg = args.find(a => a.startsWith('--repeats='));
  const repeats = repeatsArg ? parseInt(repeatsArg.split('=')[1], 10) : undefined;

  runHarness({
    dryRun: isDryRun,
    repeats
  }).then(({ exitCode }) => {
    process.exit(exitCode);
  }).catch((err) => {
    console.error("[FATAL ERROR]", err);
    process.exit(2);
  });
}
