import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export interface HarnessRow {
  run_date: string;
  engine: string;
  model: string;
  prompt_id: string;
  topic: string;
  location: string;
  language: string;
  phrasing: 'natural' | 'explicit';
  run_idx: number;
  status: 'ok' | 'refusal' | 'timeout' | 'api_error' | 'empty';
  mention_class: 'STRONG' | 'WEAK' | 'COLLISION' | 'NONE';
  list_position: number | string;
  kidsdds_cited: boolean;
  cited_domains: string;
  competitors: string;
  response_text: string;
  response_hash: string;
}

function escapeCSV(val: any): string {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

export function computeHash(text: string): string {
  if (!text) return '';
  return crypto.createHash('sha256').update(text).digest('hex').substring(0, 16);
}

export const CSV_HEADERS = [
  'run_date',
  'engine',
  'model',
  'prompt_id',
  'topic',
  'location',
  'language',
  'phrasing',
  'run_idx',
  'status',
  'mention_class',
  'list_position',
  'kidsdds_cited',
  'cited_domains',
  'competitors',
  'response_text',
  'response_hash'
];

export function formatRowsToCSV(rows: HarnessRow[]): string {
  const lines = [
    CSV_HEADERS.join(','),
    ...rows.map(r => [
      escapeCSV(r.run_date),
      escapeCSV(r.engine),
      escapeCSV(r.model),
      escapeCSV(r.prompt_id),
      escapeCSV(r.topic),
      escapeCSV(r.location),
      escapeCSV(r.language),
      escapeCSV(r.phrasing),
      escapeCSV(r.run_idx),
      escapeCSV(r.status),
      escapeCSV(r.mention_class),
      escapeCSV(r.list_position === null ? '' : r.list_position),
      escapeCSV(r.kidsdds_cited ? 'true' : 'false'),
      escapeCSV(r.cited_domains),
      escapeCSV(r.competitors),
      escapeCSV(r.response_text),
      escapeCSV(r.response_hash)
    ].join(','))
  ];
  return '\uFEFF' + lines.join('\r\n');
}

export function saveRunOutputs(runDate: string, rows: HarnessRow[]): { runDir: string; csvPath: string; summaryPath: string } {
  const baseDir = path.join(process.cwd(), 'data');
  const runDir = path.join(baseDir, 'runs', runDate);
  const masterCsvPath = path.join(baseDir, 'master_history.csv');

  try {
    fs.mkdirSync(runDir, { recursive: true });

    // 1. Write dated run CSV
    const csvContent = formatRowsToCSV(rows);
    const runCsvPath = path.join(runDir, `ai_visibility_${runDate}.csv`);
    fs.writeFileSync(runCsvPath, csvContent, 'utf8');

    // 2. Append to master history CSV
    const masterExists = fs.existsSync(masterCsvPath);
    if (!masterExists) {
      fs.writeFileSync(masterCsvPath, csvContent, 'utf8');
    } else {
      const dataRows = rows.map(r => [
        escapeCSV(r.run_date),
        escapeCSV(r.engine),
        escapeCSV(r.model),
        escapeCSV(r.prompt_id),
        escapeCSV(r.topic),
        escapeCSV(r.location),
        escapeCSV(r.language),
        escapeCSV(r.phrasing),
        escapeCSV(r.run_idx),
        escapeCSV(r.status),
        escapeCSV(r.mention_class),
        escapeCSV(r.list_position === null ? '' : r.list_position),
        escapeCSV(r.kidsdds_cited ? 'true' : 'false'),
        escapeCSV(r.cited_domains),
        escapeCSV(r.competitors),
        escapeCSV(r.response_text),
        escapeCSV(r.response_hash)
      ].join(',')).join('\r\n');
      fs.appendFileSync(masterCsvPath, '\r\n' + dataRows, 'utf8');
    }

    // 3. Write summary report
    const summaryMd = generateMarkdownSummary(runDate, rows);
    const summaryPath = path.join(runDir, `summary_${runDate}.md`);
    fs.writeFileSync(summaryPath, summaryMd, 'utf8');

    return { runDir, csvPath: runCsvPath, summaryPath };
  } catch (e: any) {
    console.warn("Could not save to local filesystem (serverless environment):", e.message);
    return { runDir: '', csvPath: '', summaryPath: '' };
  }
}

export function generateMarkdownSummary(runDate: string, rows: HarnessRow[], previousRuns: any[] = []): string {
  const totalRows = rows.length;
  if (totalRows === 0) return `# AI Visibility Audit Summary (${runDate})\n\nNo rows recorded.`;

  // Filter valid completed calls
  const okRows = rows.filter(r => r.status === 'ok');
  const failureRows = rows.filter(r => r.status === 'api_error' || r.status === 'timeout');
  const refusalRows = rows.filter(r => r.status === 'refusal');

  // Engines
  const engines = Array.from(new Set(rows.map(r => r.engine)));
  const engineStats: Record<string, { total: number; ok: number; mentioned: number; failed: number; refusals: number }> = {};

  for (const eng of engines) {
    const engRows = rows.filter(r => r.engine === eng);
    const engOk = engRows.filter(r => r.status === 'ok');
    const engMentions = engOk.filter(r => r.mention_class === 'STRONG' || r.mention_class === 'WEAK');
    const engFailed = engRows.filter(r => r.status === 'api_error' || r.status === 'timeout');
    const engRefusals = engRows.filter(r => r.status === 'refusal');

    engineStats[eng] = {
      total: engRows.length,
      ok: engOk.length,
      mentioned: engMentions.length,
      failed: engFailed.length,
      refusals: engRefusals.length
    };
  }

  // Domain citation frequency
  const domainCounts: Record<string, number> = {};
  for (const r of rows) {
    if (r.cited_domains) {
      r.cited_domains.split(';').map(d => d.trim()).filter(Boolean).forEach(d => {
        domainCounts[d] = (domainCounts[d] || 0) + 1;
      });
    }
  }
  const topDomains = Object.entries(domainCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);

  // Competitor frequency
  const compCounts: Record<string, number> = {};
  for (const r of rows) {
    if (r.competitors) {
      r.competitors.split(';').map(c => c.trim()).filter(Boolean).forEach(c => {
        compCounts[c] = (compCounts[c] || 0) + 1;
      });
    }
  }
  const topCompetitors = Object.entries(compCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);

  // City breakdown
  const cities = Array.from(new Set(rows.map(r => r.location)));
  const cityStats = cities.map(city => {
    const cRows = rows.filter(r => r.location === city && r.status === 'ok');
    const cMentions = cRows.filter(r => r.mention_class === 'STRONG' || r.mention_class === 'WEAK');
    const rate = cRows.length > 0 ? Math.round((cMentions.length / cRows.length) * 100) : 0;
    return { city, total: cRows.length, mentions: cMentions.length, rate };
  });

  return `# Weekly AI Visibility Audit Report (${runDate})

## Executive Summary
- **Total Inquiries Tested:** ${totalRows}
- **Successfully Grounded Answers:** ${okRows.length} (${Math.round((okRows.length / totalRows) * 100)}%)
- **AI Model Refusals:** ${refusalRows.length} (${Math.round((refusalRows.length / totalRows) * 100)}%)
- **System Failures / Timeouts:** ${failureRows.length} (${Math.round((failureRows.length / totalRows) * 100)}%)
- **Practice Website (kidsdds.com) Direct Citations:** ${rows.filter(r => r.kidsdds_cited).length}

---

## Engine Visibility & Health Breakdown
| Engine | Total Calls | Valid Answers | Mention Share | Refusals | System Errors | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
${engines.map(eng => {
  const s = engineStats[eng];
  const shareStr = s.ok > 0 ? `${Math.round((s.mentioned / s.ok) * 100)}% (${s.mentioned}/${s.ok})` : 'N/A (Failed)';
  const statusStr = s.failed > (s.total * 0.2) ? '⚠️ Degraded' : s.ok > 0 ? '✅ Healthy' : '❌ Offline';
  return `| **${eng}** | ${s.total} | ${s.ok} | **${shareStr}** | ${s.refusals} | ${s.failed} | ${statusStr} |`;
}).join('\n')}

*(Note: Failed engines are reported as System Errors, never falsely counted as 0% practice visibility).*

---

## Top Sourced Domains (Grounding Directories)
The directories and platforms AI models actively cite when recommending pediatric dental practices:
${topDomains.length > 0 ? topDomains.map(([domain, count], i) => `${i + 1}. **${domain}** (${count} citations)`).join('\n') : '_No external citations parsed._'}

---

## Top Competitor Clinic Mentions
${topCompetitors.length > 0 ? topCompetitors.map(([comp, count], i) => `${i + 1}. **${comp}** (${count} appearances)`).join('\n') : '_No competitor clinics recorded._'}

---

## Location Visibility
| Location | Tested Prompts | Practice Mentions | Visibility Rate |
| :--- | :--- | :--- | :--- |
${cityStats.map(c => `| **${c.city}** | ${c.total} | ${c.mentions} | **${c.rate}%** |`).join('\n')}
`;
}
