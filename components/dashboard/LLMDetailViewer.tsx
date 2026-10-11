'use client';
import { useState, useMemo } from 'react';
import { Bot, Sparkles, CheckCircle2, XCircle, Calendar, Copy, Check, Filter, FileSpreadsheet, Download } from 'lucide-react';

interface LogItem {
  prompt: string;
  location?: string;
  topic?: string;
  chatgptResponse?: string;
  chatgptMentioned?: boolean;
  claudeResponse?: string;
  claudeMentioned?: boolean;
  geminiResponse?: string;
  geminiMentioned?: boolean;
}

export interface CronRunLog {
  id: string;
  date: string;
  startTime?: any;
  communities_tested?: string[];
  chatgpt_score?: number;
  claude_score?: number;
  gemini_score?: number;
  logs?: LogItem[];
}

function escapeCSV(val: any): string {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

export default function LLMDetailViewer({ runs }: { runs: CronRunLog[] }) {
  const [selectedRunId, setSelectedRunId] = useState<string>(runs[0]?.id || '');
  const [selectedLlm, setSelectedLlm] = useState<'all' | 'chatgpt' | 'claude' | 'gemini'>('all');
  const [mentionFilter, setMentionFilter] = useState<'all' | 'mentioned' | 'not_mentioned'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const currentRun = useMemo(() => {
    return runs.find(r => r.id === selectedRunId) || runs[0];
  }, [runs, selectedRunId]);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleExportCurrent = () => {
    if (!currentRun) return;
    const itemsToExport = filteredLogs.length > 0 ? filteredLogs : (currentRun.logs || []);
    const headers = [
      'Date',
      'Location',
      'Topic',
      'Question / Prompt',
      'ChatGPT Mentioned',
      'ChatGPT Response',
      'Claude Mentioned',
      'Claude Response',
      'Gemini Mentioned',
      'Gemini Response'
    ];

    const rows = itemsToExport.map(log => [
      escapeCSV(currentRun.date),
      escapeCSV(log.location || ''),
      escapeCSV(log.topic || ''),
      escapeCSV(log.prompt),
      escapeCSV(log.chatgptMentioned ? 'Yes' : 'No'),
      escapeCSV(log.chatgptResponse || ''),
      escapeCSV(log.claudeMentioned ? 'Yes' : 'No'),
      escapeCSV(log.claudeResponse || ''),
      escapeCSV(log.geminiMentioned ? 'Yes' : 'No'),
      escapeCSV(log.geminiResponse || '')
    ].join(','));

    const csvContent = '\uFEFF' + [headers.map(escapeCSV).join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const cleanComm = currentRun.communities_tested?.join('_').replace(/[^a-zA-Z0-9_]/g, '') || 'run';
    link.download = `LLM_Questions_Answers_${currentRun.date}_${cleanComm}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportAll = () => {
    if (!runs || runs.length === 0) return;
    const headers = [
      'Date',
      'Location',
      'Topic',
      'Question / Prompt',
      'ChatGPT Mentioned',
      'ChatGPT Response',
      'Claude Mentioned',
      'Claude Response',
      'Gemini Mentioned',
      'Gemini Response'
    ];

    const rows: string[] = [];
    runs.forEach(run => {
      (run.logs || []).forEach(log => {
        rows.push([
          escapeCSV(run.date),
          escapeCSV(log.location || ''),
          escapeCSV(log.topic || ''),
          escapeCSV(log.prompt),
          escapeCSV(log.chatgptMentioned ? 'Yes' : 'No'),
          escapeCSV(log.chatgptResponse || ''),
          escapeCSV(log.claudeMentioned ? 'Yes' : 'No'),
          escapeCSV(log.claudeResponse || ''),
          escapeCSV(log.geminiMentioned ? 'Yes' : 'No'),
          escapeCSV(log.geminiResponse || '')
        ].join(','));
      });
    });

    const csvContent = '\uFEFF' + [headers.map(escapeCSV).join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `LLM_Questions_Answers_All_Runs_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (!runs || runs.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center shadow-sm">
        <Bot className="h-10 w-10 text-slate-400 mx-auto mb-3" />
        <h4 className="text-base font-semibold text-slate-700">No Prompt Logs Available Yet</h4>
        <p className="text-sm text-slate-500 max-w-md mx-auto mt-1">
          Detailed question-and-answer transcripts will appear here automatically every night after the cron job tests ChatGPT, Claude, and Gemini.
        </p>
      </div>
    );
  }

  const logs = currentRun?.logs || [];

  const filteredLogs = logs.filter(log => {
    // Search filter
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const matchPrompt = log.prompt.toLowerCase().includes(q);
      const matchGPT = (log.chatgptResponse || '').toLowerCase().includes(q);
      const matchClaude = (log.claudeResponse || '').toLowerCase().includes(q);
      const matchGemini = (log.geminiResponse || '').toLowerCase().includes(q);
      if (!matchPrompt && !matchGPT && !matchClaude && !matchGemini) return false;
    }

    // Mention filter
    if (mentionFilter === 'mentioned') {
      if (selectedLlm === 'chatgpt' && !log.chatgptMentioned) return false;
      if (selectedLlm === 'claude' && !log.claudeMentioned) return false;
      if (selectedLlm === 'gemini' && !log.geminiMentioned) return false;
      if (selectedLlm === 'all' && !log.chatgptMentioned && !log.claudeMentioned && !log.geminiMentioned) return false;
    } else if (mentionFilter === 'not_mentioned') {
      if (selectedLlm === 'chatgpt' && log.chatgptMentioned) return false;
      if (selectedLlm === 'claude' && log.claudeMentioned) return false;
      if (selectedLlm === 'gemini' && log.geminiMentioned) return false;
      if (selectedLlm === 'all' && (log.chatgptMentioned || log.claudeMentioned || log.geminiMentioned)) return false;
    }

    return true;
  });

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header & Controls */}
      <div className="p-6 border-b border-slate-200 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-[#6B4BC8]" />
              LLM Question & Answer Audit Trail
            </h3>
            <p className="text-sm text-slate-500">
              Inspect the exact prompts asked to each AI and read their raw, verbatim responses.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Date Selector */}
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-slate-400 shrink-0" />
              <select
                value={selectedRunId}
                onChange={(e) => setSelectedRunId(e.target.value)}
                className="text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#6B4BC8]/20 focus:border-[#6B4BC8] cursor-pointer"
              >
                {runs.map(run => (
                  <option key={run.id} value={run.id}>
                    {run.date} ({run.communities_tested?.join(', ') || 'Lake County'})
                  </option>
                ))}
              </select>
            </div>

            {/* Export Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleExportCurrent}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors shadow-sm"
                title="Download CSV spreadsheet for currently selected day (Excel / Google Sheets compatible)"
              >
                <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                Export to Spreadsheet ({filteredLogs.length})
              </button>
              {runs.length > 1 && (
                <button
                  onClick={handleExportAll}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 transition-colors"
                  title="Export all historical audit logs across all dates to CSV"
                >
                  <Download className="h-3.5 w-3.5 text-slate-500" />
                  All Dates
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          {/* LLM Selector Tabs */}
          <div className="flex items-center bg-slate-100 p-1 rounded-lg">
            <button
              onClick={() => setSelectedLlm('all')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                selectedLlm === 'all' 
                  ? 'bg-white text-slate-800 shadow-sm' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Models
            </button>
            <button
              onClick={() => setSelectedLlm('chatgpt')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 ${
                selectedLlm === 'chatgpt' 
                  ? 'bg-emerald-600 text-white shadow-sm' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-300"></span>
              ChatGPT
            </button>
            <button
              onClick={() => setSelectedLlm('claude')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 ${
                selectedLlm === 'claude' 
                  ? 'bg-amber-600 text-white shadow-sm' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-amber-300"></span>
              Claude
            </button>
            <button
              onClick={() => setSelectedLlm('gemini')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 ${
                selectedLlm === 'gemini' 
                  ? 'bg-blue-600 text-white shadow-sm' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-blue-300"></span>
              Gemini
            </button>
          </div>

          {/* Outcome Filter & Search */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Filter className="h-3.5 w-3.5 text-slate-400" />
              <select
                value={mentionFilter}
                onChange={(e) => setMentionFilter(e.target.value as any)}
                className="text-xs bg-white border border-slate-200 rounded-md px-2 py-1 text-slate-700 cursor-pointer"
              >
                <option value="all">All Outcomes</option>
                <option value="mentioned">✅ Mentioned Practice</option>
                <option value="not_mentioned">⚪ Not Mentioned</option>
              </select>
            </div>

            <input
              type="text"
              placeholder="Search in answers..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-200 rounded-md px-3 py-1 text-slate-700 placeholder-slate-400 focus:outline-none focus:bg-white w-40"
            />
          </div>
        </div>
      </div>

      {/* Questions & Responses List */}
      <div className="p-6 divide-y divide-slate-100 space-y-6">
        {filteredLogs.length === 0 ? (
          <div className="text-center py-8 text-slate-500 text-sm">
            No questions matched your filter criteria.
          </div>
        ) : (
          filteredLogs.map((item, idx) => (
            <div key={idx} className={idx > 0 ? 'pt-6' : ''}>
              {/* Question Banner */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-3.5 mb-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Question #{idx + 1}
                  </span>
                  {item.location && (
                    <span className="text-[11px] font-medium bg-[#6B4BC8]/10 text-[#6B4BC8] px-2 py-0.5 rounded-full">
                      📍 {item.location}
                    </span>
                  )}
                  {item.topic && (
                    <span className="text-[11px] font-medium bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full">
                      {item.topic}
                    </span>
                  )}
                </div>
                <p className="text-sm font-semibold text-slate-900 leading-snug">
                  "{item.prompt}"
                </p>
              </div>

              {/* Model Answers Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* ChatGPT Card */}
                {(selectedLlm === 'all' || selectedLlm === 'chatgpt') && (
                  <div className={`rounded-lg border p-4 transition-all flex flex-col justify-between ${
                    item.chatgptMentioned 
                      ? 'border-emerald-300 bg-emerald-50/40 shadow-xs' 
                      : 'border-slate-200 bg-white'
                  }`}>
                    <div>
                      <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                        <div className="flex items-center gap-1.5">
                          <Bot className="h-4 w-4 text-emerald-600" />
                          <span className="text-xs font-bold text-slate-800">ChatGPT (OpenAI)</span>
                        </div>
                        {item.chatgptMentioned ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                            <CheckCircle2 className="h-3 w-3" /> Mentioned
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                            <XCircle className="h-3 w-3" /> Not Mentioned
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed line-clamp-10 hover:line-clamp-none transition-all">
                        {item.chatgptResponse || '[No response generated]'}
                      </p>
                    </div>

                    {item.chatgptResponse && (
                      <div className="mt-3 pt-2 flex justify-end border-t border-slate-100">
                        <button
                          onClick={() => copyToClipboard(item.chatgptResponse!, `gpt-${idx}`)}
                          className="text-[11px] text-slate-400 hover:text-slate-600 flex items-center gap-1 cursor-pointer"
                        >
                          {copiedId === `gpt-${idx}` ? (
                            <>
                              <Check className="h-3 w-3 text-emerald-600" /> Copied
                            </>
                          ) : (
                            <>
                              <Copy className="h-3 w-3" /> Copy
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Claude Card */}
                {(selectedLlm === 'all' || selectedLlm === 'claude') && (
                  <div className={`rounded-lg border p-4 transition-all flex flex-col justify-between ${
                    item.claudeMentioned 
                      ? 'border-amber-300 bg-amber-50/40 shadow-xs' 
                      : 'border-slate-200 bg-white'
                  }`}>
                    <div>
                      <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                        <div className="flex items-center gap-1.5">
                          <Bot className="h-4 w-4 text-amber-600" />
                          <span className="text-xs font-bold text-slate-800">Claude (Anthropic)</span>
                        </div>
                        {item.claudeMentioned ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                            <CheckCircle2 className="h-3 w-3" /> Mentioned
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                            <XCircle className="h-3 w-3" /> Not Mentioned
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed line-clamp-10 hover:line-clamp-none transition-all">
                        {item.claudeResponse || '[No response generated]'}
                      </p>
                    </div>

                    {item.claudeResponse && (
                      <div className="mt-3 pt-2 flex justify-end border-t border-slate-100">
                        <button
                          onClick={() => copyToClipboard(item.claudeResponse!, `claude-${idx}`)}
                          className="text-[11px] text-slate-400 hover:text-slate-600 flex items-center gap-1 cursor-pointer"
                        >
                          {copiedId === `claude-${idx}` ? (
                            <>
                              <Check className="h-3 w-3 text-amber-600" /> Copied
                            </>
                          ) : (
                            <>
                              <Copy className="h-3 w-3" /> Copy
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Gemini Card */}
                {(selectedLlm === 'all' || selectedLlm === 'gemini') && (
                  <div className={`rounded-lg border p-4 transition-all flex flex-col justify-between ${
                    item.geminiMentioned 
                      ? 'border-blue-300 bg-blue-50/40 shadow-xs' 
                      : 'border-slate-200 bg-white'
                  }`}>
                    <div>
                      <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                        <div className="flex items-center gap-1.5">
                          <Bot className="h-4 w-4 text-blue-600" />
                          <span className="text-xs font-bold text-slate-800">Gemini (Google)</span>
                        </div>
                        {item.geminiMentioned ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                            <CheckCircle2 className="h-3 w-3" /> Mentioned
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                            <XCircle className="h-3 w-3" /> Not Mentioned
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed line-clamp-10 hover:line-clamp-none transition-all">
                        {item.geminiResponse || '[No response generated]'}
                      </p>
                    </div>

                    {item.geminiResponse && (
                      <div className="mt-3 pt-2 flex justify-end border-t border-slate-100">
                        <button
                          onClick={() => copyToClipboard(item.geminiResponse!, `gemini-${idx}`)}
                          className="text-[11px] text-slate-400 hover:text-slate-600 flex items-center gap-1 cursor-pointer"
                        >
                          {copiedId === `gemini-${idx}` ? (
                            <>
                              <Check className="h-3 w-3 text-blue-600" /> Copied
                            </>
                          ) : (
                            <>
                              <Copy className="h-3 w-3" /> Copy
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
