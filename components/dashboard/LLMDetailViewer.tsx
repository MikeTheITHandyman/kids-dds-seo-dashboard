'use client';

import { useState, useMemo } from 'react';
import {
  Bot,
  Sparkles,
  CheckCircle2,
  XCircle,
  Calendar,
  Copy,
  Check,
  Filter,
  FileSpreadsheet,
  Download,
  HelpCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface LogItem {
  prompt: string;
  location?: string;
  topic?: string;
  chatgptResponse?: string;
  chatgptMentioned?: boolean;
  chatgptFollowUp?: string;
  claudeResponse?: string;
  claudeMentioned?: boolean;
  claudeFollowUp?: string;
  geminiResponse?: string;
  geminiMentioned?: boolean;
  geminiFollowUp?: string;
  engines?: Record<string, any>;
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

export default function LLMDetailViewer({
  runs: initialRuns,
  clientId = 'kids-dentist',
  clientName = 'Kids Dentist',
}: {
  runs: CronRunLog[];
  clientId?: string;
  clientName?: string;
}) {
  const [runs, setRuns] = useState<CronRunLog[]>(initialRuns);
  const [selectedRunId, setSelectedRunId] = useState<string>(initialRuns[0]?.id || '');
  const [selectedLlm, setSelectedLlm] = useState<'all' | 'chatgpt' | 'claude' | 'gemini'>('all');
  const [mentionFilter, setMentionFilter] = useState<'all' | 'mentioned' | 'not_mentioned'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});
  const [expandedFollowUps, setExpandedFollowUps] = useState<Record<string, boolean>>({});
  const [loadingFollowUp, setLoadingFollowUp] = useState<Record<string, boolean>>({});
  const [followUpErrors, setFollowUpErrors] = useState<Record<string, string>>({});

  const toggleExpand = (id: string) => {
    setExpandedCards(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleFollowUpExpand = (id: string) => {
    setExpandedFollowUps(prev => ({ ...prev, [id]: !(prev[id] ?? true) }));
  };

  const currentRun = useMemo(() => {
    return runs.find(r => r.id === selectedRunId) || runs[0];
  }, [runs, selectedRunId]);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getFollowUpText = (log: LogItem, engine: 'chatgpt' | 'claude' | 'gemini'): string => {
    if (engine === 'chatgpt') {
      return log.chatgptFollowUp || log.engines?.OpenAI?.followUp || '';
    }
    if (engine === 'claude') {
      return log.claudeFollowUp || log.engines?.Claude?.followUp || '';
    }
    return log.geminiFollowUp || log.engines?.Gemini?.followUp || '';
  };

  const handleAskWhyNotMentioned = async (
    logItem: LogItem,
    engine: 'chatgpt' | 'claude' | 'gemini',
    cardKey: string
  ) => {
    if (!currentRun) return;
    const originalResponse =
      engine === 'chatgpt'
        ? logItem.chatgptResponse
        : engine === 'claude'
        ? logItem.claudeResponse
        : logItem.geminiResponse;

    if (!originalResponse) return;

    setLoadingFollowUp(prev => ({ ...prev, [cardKey]: true }));
    setFollowUpErrors(prev => ({ ...prev, [cardKey]: '' }));

    try {
      const realIndex = (currentRun.logs || []).findIndex(l => l.prompt === logItem.prompt);
      const res = await fetch('/api/llm/follow-up', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          runId: currentRun.id,
          logIndex: realIndex,
          prompt: logItem.prompt,
          originalResponse,
          engine,
          clientId,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to ask follow-up');
      }

      const followUpResponse = data.followUpResponse || '';

      // Update local state so UI shows it immediately
      setRuns(prevRuns =>
        prevRuns.map(r => {
          if (r.id !== currentRun.id) return r;
          const updatedLogs = (r.logs || []).map(l => {
            if (l.prompt !== logItem.prompt) return l;
            if (engine === 'chatgpt') return { ...l, chatgptFollowUp: followUpResponse };
            if (engine === 'claude') return { ...l, claudeFollowUp: followUpResponse };
            return { ...l, geminiFollowUp: followUpResponse };
          });
          return { ...r, logs: updatedLogs };
        })
      );

      setExpandedFollowUps(prev => ({ ...prev, [cardKey]: true }));
    } catch (e: any) {
      setFollowUpErrors(prev => ({
        ...prev,
        [cardKey]: e.message || 'Error querying LLM follow-up',
      }));
    } finally {
      setLoadingFollowUp(prev => ({ ...prev, [cardKey]: false }));
    }
  };

  const handleExportCurrent = () => {
    if (!currentRun) return;
    const itemsToExport = filteredLogs.length > 0 ? filteredLogs : currentRun.logs || [];
    const headers = [
      'Date',
      'Location',
      'Topic',
      'Question / Prompt',
      'ChatGPT Mentioned',
      'ChatGPT Response',
      'ChatGPT Why Not Mentioned',
      'Claude Mentioned',
      'Claude Response',
      'Claude Why Not Mentioned',
      'Gemini Mentioned',
      'Gemini Response',
      'Gemini Why Not Mentioned',
    ];

    const rows = itemsToExport.map(log =>
      [
        escapeCSV(currentRun.date),
        escapeCSV(log.location || ''),
        escapeCSV(log.topic || ''),
        escapeCSV(log.prompt),
        escapeCSV(log.chatgptMentioned ? 'Yes' : 'No'),
        escapeCSV(log.chatgptResponse || ''),
        escapeCSV(getFollowUpText(log, 'chatgpt')),
        escapeCSV(log.claudeMentioned ? 'Yes' : 'No'),
        escapeCSV(log.claudeResponse || ''),
        escapeCSV(getFollowUpText(log, 'claude')),
        escapeCSV(log.geminiMentioned ? 'Yes' : 'No'),
        escapeCSV(log.geminiResponse || ''),
        escapeCSV(getFollowUpText(log, 'gemini')),
      ].join(',')
    );

    const csvContent = '\uFEFF' + [headers.map(escapeCSV).join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const cleanComm =
      currentRun.communities_tested?.join('_').replace(/[^a-zA-Z0-9_]/g, '') || 'run';
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
      'ChatGPT Why Not Mentioned',
      'Claude Mentioned',
      'Claude Response',
      'Claude Why Not Mentioned',
      'Gemini Mentioned',
      'Gemini Response',
      'Gemini Why Not Mentioned',
    ];

    const rows: string[] = [];
    runs.forEach(run => {
      (run.logs || []).forEach(log => {
        rows.push(
          [
            escapeCSV(run.date),
            escapeCSV(log.location || ''),
            escapeCSV(log.topic || ''),
            escapeCSV(log.prompt),
            escapeCSV(log.chatgptMentioned ? 'Yes' : 'No'),
            escapeCSV(log.chatgptResponse || ''),
            escapeCSV(getFollowUpText(log, 'chatgpt')),
            escapeCSV(log.claudeMentioned ? 'Yes' : 'No'),
            escapeCSV(log.claudeResponse || ''),
            escapeCSV(getFollowUpText(log, 'claude')),
            escapeCSV(log.geminiMentioned ? 'Yes' : 'No'),
            escapeCSV(log.geminiResponse || ''),
            escapeCSV(getFollowUpText(log, 'gemini')),
          ].join(',')
        );
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
          Detailed question-and-answer transcripts for <strong>{clientName}</strong> will appear here automatically after running a test batch or nightly cron job.
        </p>
      </div>
    );
  }

  const logs = currentRun?.logs || [];

  const filteredLogs = logs.filter(log => {
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const matchPrompt = log.prompt.toLowerCase().includes(q);
      const matchGPT = (log.chatgptResponse || '').toLowerCase().includes(q);
      const matchClaude = (log.claudeResponse || '').toLowerCase().includes(q);
      const matchGemini = (log.geminiResponse || '').toLowerCase().includes(q);
      if (!matchPrompt && !matchGPT && !matchClaude && !matchGemini) return false;
    }

    if (mentionFilter === 'mentioned') {
      if (selectedLlm === 'chatgpt' && !log.chatgptMentioned) return false;
      if (selectedLlm === 'claude' && !log.claudeMentioned) return false;
      if (selectedLlm === 'gemini' && !log.geminiMentioned) return false;
      if (
        selectedLlm === 'all' &&
        !log.chatgptMentioned &&
        !log.claudeMentioned &&
        !log.geminiMentioned
      )
        return false;
    } else if (mentionFilter === 'not_mentioned') {
      if (selectedLlm === 'chatgpt' && log.chatgptMentioned) return false;
      if (selectedLlm === 'claude' && log.claudeMentioned) return false;
      if (selectedLlm === 'gemini' && log.geminiMentioned) return false;
      if (
        selectedLlm === 'all' &&
        (log.chatgptMentioned || log.claudeMentioned || log.geminiMentioned)
      )
        return false;
    }

    return true;
  });

  const renderFollowUpSection = (
    item: LogItem,
    engine: 'chatgpt' | 'claude' | 'gemini',
    isMentioned: boolean | undefined,
    hasResponse: boolean,
    idx: number
  ) => {
    if (isMentioned || !hasResponse) return null;
    const cardKey = `${currentRun?.id}-${engine}-${idx}`;
    const followUpText = getFollowUpText(item, engine);
    const isLoading = Boolean(loadingFollowUp[cardKey]);
    const errText = followUpErrors[cardKey];
    const isExpanded = expandedFollowUps[cardKey] ?? true;

    return (
      <div className="mt-3 pt-2.5 border-t border-slate-100">
        {!followUpText ? (
          <div className="space-y-1.5">
            <button
              type="button"
              onClick={() => handleAskWhyNotMentioned(item, engine, cardKey)}
              disabled={isLoading}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-50 hover:bg-purple-100 text-[#6B4BC8] border border-purple-200 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Asking why {clientName} wasn&apos;t included...
                </>
              ) : (
                <>
                  <HelpCircle className="h-3.5 w-3.5" />
                  Ask Why {clientName} Was Not Included
                </>
              )}
            </button>
            {errText && <p className="text-[11px] text-rose-600">{errText}</p>}
          </div>
        ) : (
          <div className="bg-purple-50/60 border border-purple-200/80 rounded-lg p-2.5 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => toggleFollowUpExpand(cardKey)}
                className="flex items-center gap-1 text-[11px] font-bold text-[#6B4BC8] cursor-pointer"
              >
                <HelpCircle className="h-3.5 w-3.5 shrink-0" />
                <span>Why {clientName} Was Not Included</span>
                {isExpanded ? (
                  <ChevronUp className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => copyToClipboard(followUpText, `fu-${cardKey}`)}
                  className="text-[10px] text-slate-500 hover:text-slate-800 flex items-center gap-0.5 cursor-pointer"
                >
                  {copiedId === `fu-${cardKey}` ? (
                    <>
                      <Check className="h-2.5 w-2.5 text-emerald-600" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-2.5 w-2.5" /> Copy
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => handleAskWhyNotMentioned(item, engine, cardKey)}
                  disabled={isLoading}
                  className="text-[10px] text-[#6B4BC8] hover:underline font-medium cursor-pointer"
                >
                  {isLoading ? 'Refreshing...' : 'Re-ask'}
                </button>
              </div>
            </div>

            {isExpanded && (
              <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed pt-1 border-t border-purple-200/50">
                {followUpText}
              </p>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
      {/* Header & Controls */}
      <div className="p-4 sm:p-6 border-b border-slate-200 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4">
          <div>
            <h3 className="text-base sm:text-lg font-semibold text-slate-800 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-[#6B4BC8] shrink-0" />
              LLM Question &amp; Answer Audit Trail
            </h3>
            <p className="text-xs sm:text-sm text-slate-500">
              Inspect exact prompts, read verbatim AI responses, and ask any AI why{' '}
              <strong className="text-slate-700">{clientName}</strong> was not included when omitted.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* Date Selector */}
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Calendar className="h-4 w-4 text-slate-400 shrink-0" />
              <select
                value={selectedRunId}
                onChange={e => setSelectedRunId(e.target.value)}
                className="text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#6B4BC8]/20 focus:border-[#6B4BC8] cursor-pointer flex-1 sm:flex-initial max-w-full truncate"
              >
                {runs.map(run => (
                  <option key={run.id} value={run.id}>
                    {run.date} ({run.communities_tested?.join(', ') || 'Regional Run'})
                  </option>
                ))}
              </select>
            </div>

            {/* Export Actions */}
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                onClick={handleExportCurrent}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors shadow-xs flex-1 sm:flex-initial cursor-pointer"
                title="Download CSV spreadsheet for currently selected day (includes follow-up explanations)"
              >
                <FileSpreadsheet className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>Export CSV ({filteredLogs.length})</span>
              </button>
              {runs.length > 1 && (
                <button
                  onClick={handleExportAll}
                  className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 transition-colors shrink-0 cursor-pointer"
                  title="Export all historical audit logs across all dates to CSV"
                >
                  <Download className="h-3.5 w-3.5 text-slate-500" />
                  <span>All Dates</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          {/* LLM Selector Tabs */}
          <div className="flex items-center bg-slate-100 p-1 rounded-lg overflow-x-auto max-w-full">
            <button
              onClick={() => setSelectedLlm('all')}
              className={`px-2.5 sm:px-3 py-1 text-xs font-semibold rounded-md transition-all whitespace-nowrap cursor-pointer ${
                selectedLlm === 'all'
                  ? 'bg-white text-slate-800 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Models
            </button>
            <button
              onClick={() => setSelectedLlm('chatgpt')}
              className={`px-2.5 sm:px-3 py-1 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                selectedLlm === 'chatgpt'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-300 shrink-0"></span>
              ChatGPT
            </button>
            <button
              onClick={() => setSelectedLlm('claude')}
              className={`px-2.5 sm:px-3 py-1 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                selectedLlm === 'claude'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-amber-300 shrink-0"></span>
              Claude
            </button>
            <button
              onClick={() => setSelectedLlm('gemini')}
              className={`px-2.5 sm:px-3 py-1 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                selectedLlm === 'gemini'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-blue-300 shrink-0"></span>
              Gemini
            </button>
          </div>

          {/* Outcome Filter & Search */}
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 w-full sm:w-auto">
            <div className="flex items-center gap-1.5 flex-1 sm:flex-initial">
              <Filter className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <select
                value={mentionFilter}
                onChange={e => setMentionFilter(e.target.value as any)}
                className="text-xs bg-white border border-slate-200 rounded-md px-2 py-1.5 text-slate-700 cursor-pointer w-full sm:w-auto"
              >
                <option value="all">All Outcomes</option>
                <option value="mentioned">✅ Mentioned</option>
                <option value="not_mentioned">⚪ Not Mentioned</option>
              </select>
            </div>

            <input
              type="text"
              placeholder="Search answers..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-200 rounded-md px-3 py-1.5 text-slate-700 placeholder-slate-400 focus:outline-none focus:bg-white flex-1 sm:w-40"
            />
          </div>
        </div>
      </div>

      {/* Questions & Responses List */}
      <div className="p-4 sm:p-6 divide-y divide-slate-100 space-y-6">
        {filteredLogs.length === 0 ? (
          <div className="text-center py-8 text-slate-500 text-sm">
            No questions matched your filter criteria.
          </div>
        ) : (
          filteredLogs.map((item, idx) => (
            <div key={idx} className={idx > 0 ? 'pt-6' : ''}>
              {/* Question Banner */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-3 sm:p-3.5 mb-4">
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-1.5">
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
                <p className="text-xs sm:text-sm font-semibold text-slate-900 leading-snug">
                  &ldquo;{item.prompt}&rdquo;
                </p>
              </div>

              {/* Model Answers Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
                {/* ChatGPT Card */}
                {(selectedLlm === 'all' || selectedLlm === 'chatgpt') && (
                  <div
                    className={`rounded-lg border p-4 transition-all flex flex-col justify-between ${
                      item.chatgptMentioned
                        ? 'border-emerald-300 bg-emerald-50/40 shadow-xs'
                        : 'border-slate-200 bg-white'
                    }`}
                  >
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
                      <p
                        onClick={() => toggleExpand(`gpt-${idx}`)}
                        className={`text-xs text-slate-700 whitespace-pre-wrap leading-relaxed cursor-pointer transition-all ${
                          expandedCards[`gpt-${idx}`]
                            ? ''
                            : 'line-clamp-8 sm:line-clamp-10 hover:line-clamp-none'
                        }`}
                      >
                        {item.chatgptResponse || '[No response generated]'}
                      </p>
                    </div>

                    <div>
                      {renderFollowUpSection(
                        item,
                        'chatgpt',
                        item.chatgptMentioned,
                        Boolean(item.chatgptResponse),
                        idx
                      )}

                      {item.chatgptResponse && (
                        <div className="mt-3 pt-2 flex items-center justify-between border-t border-slate-100">
                          <button
                            onClick={() => toggleExpand(`gpt-${idx}`)}
                            className="text-[11px] font-medium text-emerald-700 hover:text-emerald-800 cursor-pointer"
                          >
                            {expandedCards[`gpt-${idx}`] ? 'Show less' : 'Show full answer'}
                          </button>
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
                  </div>
                )}

                {/* Claude Card */}
                {(selectedLlm === 'all' || selectedLlm === 'claude') && (
                  <div
                    className={`rounded-lg border p-3.5 sm:p-4 transition-all flex flex-col justify-between ${
                      item.claudeMentioned
                        ? 'border-amber-300 bg-amber-50/40 shadow-xs'
                        : 'border-slate-200 bg-white'
                    }`}
                  >
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
                      <p
                        onClick={() => toggleExpand(`claude-${idx}`)}
                        className={`text-xs text-slate-700 whitespace-pre-wrap leading-relaxed cursor-pointer transition-all ${
                          expandedCards[`claude-${idx}`]
                            ? ''
                            : 'line-clamp-8 sm:line-clamp-10 hover:line-clamp-none'
                        }`}
                      >
                        {item.claudeResponse || '[No response generated]'}
                      </p>
                    </div>

                    <div>
                      {renderFollowUpSection(
                        item,
                        'claude',
                        item.claudeMentioned,
                        Boolean(item.claudeResponse),
                        idx
                      )}

                      {item.claudeResponse && (
                        <div className="mt-3 pt-2 flex items-center justify-between border-t border-slate-100">
                          <button
                            onClick={() => toggleExpand(`claude-${idx}`)}
                            className="text-[11px] font-medium text-amber-700 hover:text-amber-800 cursor-pointer"
                          >
                            {expandedCards[`claude-${idx}`] ? 'Show less' : 'Show full answer'}
                          </button>
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
                  </div>
                )}

                {/* Gemini Card */}
                {(selectedLlm === 'all' || selectedLlm === 'gemini') && (
                  <div
                    className={`rounded-lg border p-3.5 sm:p-4 transition-all flex flex-col justify-between ${
                      item.geminiMentioned
                        ? 'border-blue-300 bg-blue-50/40 shadow-xs'
                        : 'border-slate-200 bg-white'
                    }`}
                  >
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
                      <p
                        onClick={() => toggleExpand(`gemini-${idx}`)}
                        className={`text-xs text-slate-700 whitespace-pre-wrap leading-relaxed cursor-pointer transition-all ${
                          expandedCards[`gemini-${idx}`]
                            ? ''
                            : 'line-clamp-8 sm:line-clamp-10 hover:line-clamp-none'
                        }`}
                      >
                        {item.geminiResponse || '[No response generated]'}
                      </p>
                    </div>

                    <div>
                      {renderFollowUpSection(
                        item,
                        'gemini',
                        item.geminiMentioned,
                        Boolean(item.geminiResponse),
                        idx
                      )}

                      {item.geminiResponse && (
                        <div className="mt-3 pt-2 flex items-center justify-between border-t border-slate-100">
                          <button
                            onClick={() => toggleExpand(`gemini-${idx}`)}
                            className="text-[11px] font-medium text-blue-700 hover:text-blue-800 cursor-pointer"
                          >
                            {expandedCards[`gemini-${idx}`] ? 'Show less' : 'Show full answer'}
                          </button>
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
