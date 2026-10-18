'use client';

import { useState } from 'react';
import {
  Sparkles,
  Zap,
  Scale,
  PiggyBank,
  Check,
  Loader2,
  Calendar,
  Sliders,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Info
} from 'lucide-react';
import type { LLMBudgetConfig, LLMPreset, LLMFrequency } from '@/lib/ai-harness/settings';

export interface MasteredQuestionSummary {
  key: string;
  location: string;
  topicName: string;
  lastTestedDate: string;
}

interface Props {
  initialConfig: LLMBudgetConfig;
  totalTracked: number;
  masteredList: MasteredQuestionSummary[];
  isAdmin: boolean;
}

const PRESET_CARDS: {
  id: Exclude<LLMPreset, 'custom'>;
  title: string;
  badge?: string;
  subtitle: string;
  frequencyLabel: string;
  questionsLabel: string;
  skipLabel: string;
  frequency: LLMFrequency;
  questionsPerRun: number;
  smartSkipMastered: boolean;
  icon: any;
  accentColor: string;
}[] = [
  {
    id: 'minimize_costs',
    title: 'Minimize Costs',
    subtitle: 'Lowest API credit usage with weekly rotation',
    frequencyLabel: 'Weekly',
    questionsLabel: '3 questions / run',
    skipLabel: 'Smart Skip ON (30d recheck)',
    frequency: 'weekly',
    questionsPerRun: 3,
    smartSkipMastered: true,
    icon: PiggyBank,
    accentColor: 'emerald'
  },
  {
    id: 'balanced',
    title: 'Balanced',
    badge: 'Recommended Default',
    subtitle: 'Steady multi-town rotation at ~85% lower cost',
    frequencyLabel: 'Every Other Day',
    questionsLabel: '6 questions / run',
    skipLabel: 'Smart Skip ON (30d recheck)',
    frequency: 'every_other_day',
    questionsPerRun: 6,
    smartSkipMastered: true,
    icon: Scale,
    accentColor: 'purple'
  },
  {
    id: 'maximize_inquiries',
    title: 'Maximize Inquiries',
    subtitle: 'Full daily sweep across communities without skipping',
    frequencyLabel: 'Daily',
    questionsLabel: '15 questions / run',
    skipLabel: 'Smart Skip OFF (tests all)',
    frequency: 'daily',
    questionsPerRun: 15,
    smartSkipMastered: false,
    icon: Zap,
    accentColor: 'amber'
  }
];

export default function LLMBudgetSettings({
  initialConfig,
  totalTracked,
  masteredList,
  isAdmin
}: Props) {
  const [preset, setPreset] = useState<LLMPreset>(initialConfig.preset || 'balanced');
  const [frequency, setFrequency] = useState<LLMFrequency>(initialConfig.frequency || 'every_other_day');
  const [questionsPerRun, setQuestionsPerRun] = useState<number>(initialConfig.questionsPerRun || 6);
  const [smartSkipMastered, setSmartSkipMastered] = useState<boolean>(
    initialConfig.smartSkipMastered ?? true
  );
  const [recheckDays] = useState<number>(initialConfig.recheckDays || 30);

  const [isSaving, setIsSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState('');
  const [errorNotice, setErrorNotice] = useState('');
  const [showMasteredDetails, setShowMasteredDetails] = useState(false);

  const selectPresetCard = (card: typeof PRESET_CARDS[number]) => {
    if (!isAdmin) return;
    setPreset(card.id);
    setFrequency(card.frequency);
    setQuestionsPerRun(card.questionsPerRun);
    setSmartSkipMastered(card.smartSkipMastered);
  };

  const handleCustomChange = (
    nextFreq: LLMFrequency,
    nextQuestions: number,
    nextSkip: boolean
  ) => {
    setFrequency(nextFreq);
    setQuestionsPerRun(nextQuestions);
    setSmartSkipMastered(nextSkip);

    const matched = PRESET_CARDS.find(
      c =>
        c.frequency === nextFreq &&
        c.questionsPerRun === nextQuestions &&
        c.smartSkipMastered === nextSkip
    );
    setPreset(matched ? matched.id : 'custom');
  };

  const handleSave = async () => {
    if (!isAdmin) return;
    setIsSaving(true);
    setSavedNotice('');
    setErrorNotice('');

    try {
      const res = await fetch('/api/settings/llm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preset: 'custom', // Let server match preset or mark custom from exact values
          frequency,
          questionsPerRun,
          smartSkipMastered,
          recheckDays
        })
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        setErrorNotice(data.error || 'Failed to save settings');
        return;
      }

      if (data.config?.preset) {
        setPreset(data.config.preset);
      }
      setSavedNotice('AI Visibility schedule & credit budget settings saved.');
      setTimeout(() => setSavedNotice(''), 4000);
    } catch (e: any) {
      setErrorNotice(e.message || 'Network error while saving');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
      {/* Header */}
      <div className="p-4 sm:p-6 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base sm:text-lg font-semibold text-slate-800 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[#6B4BC8] shrink-0" />
            AI Visibility Credit Budget & Schedule
          </h2>
          <p className="text-xs sm:text-sm text-slate-500">
            Control how often LLMs are queried, how many rotating questions run per batch, and smart-skipping of mastered topics.
          </p>
        </div>

        {isAdmin && (
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-[#6B4BC8] hover:bg-[#5a3da8] text-white rounded-lg transition-colors text-xs sm:text-sm font-semibold shadow-xs disabled:opacity-50 shrink-0 cursor-pointer"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                Save LLM Settings
              </>
            )}
          </button>
        )}
      </div>

      {/* Feedback Banner */}
      {savedNotice && (
        <div className="mx-4 sm:mx-6 mt-4 flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-xs sm:text-sm font-medium">
          <Check className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{savedNotice}</span>
        </div>
      )}
      {errorNotice && (
        <div className="mx-4 sm:mx-6 mt-4 flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs sm:text-sm font-medium">
          <span>{errorNotice}</span>
        </div>
      )}

      <div className="p-4 sm:p-6 space-y-6">
        {/* 3 Mode Preset Cards */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
            1. Choose an Optimization Level
          </label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
            {PRESET_CARDS.map((card) => {
              const Icon = card.icon;
              const isSelected = preset === card.id;
              return (
                <button
                  key={card.id}
                  type="button"
                  disabled={!isAdmin}
                  onClick={() => selectPresetCard(card)}
                  className={`text-left rounded-xl p-4 border-2 transition-all flex flex-col justify-between cursor-pointer ${
                    isSelected
                      ? 'border-[#6B4BC8] bg-purple-50/40 shadow-xs'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  } ${!isAdmin ? 'opacity-75 cursor-not-allowed' : ''}`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <div
                          className={`p-2 rounded-lg ${
                            isSelected
                              ? 'bg-[#6B4BC8] text-white'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="font-bold text-slate-800 text-sm">{card.title}</div>
                          {card.badge && (
                            <span className="inline-block text-[10px] font-semibold bg-purple-100 text-[#6B4BC8] px-2 py-0.5 rounded-full mt-0.5">
                              {card.badge}
                            </span>
                          )}
                        </div>
                      </div>
                      <div
                        className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${
                          isSelected
                            ? 'border-[#6B4BC8] bg-[#6B4BC8] text-white'
                            : 'border-slate-300 bg-white'
                        }`}
                      >
                        {isSelected && <Check className="h-3 w-3" />}
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 mb-3">{card.subtitle}</p>
                  </div>

                  <div className="pt-3 border-t border-slate-100 space-y-1 text-xs text-slate-700">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Frequency:</span>
                      <span className="font-semibold">{card.frequencyLabel}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Batch Size:</span>
                      <span className="font-semibold">{card.questionsLabel}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Smart Filter:</span>
                      <span className="font-semibold text-emerald-700">{card.skipLabel}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Fine-Grained Custom Controls */}
        <div className="bg-slate-50 rounded-xl p-4 sm:p-5 border border-slate-200/80 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sliders className="h-4 w-4 text-[#6B4BC8]" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                2. Fine-Tune Schedule & Rotation
              </span>
            </div>
            {preset === 'custom' && (
              <span className="text-[11px] font-semibold bg-slate-200 text-slate-700 px-2.5 py-0.5 rounded-full">
                Custom Configuration
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Frequency Selector */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-slate-400" />
                Run Frequency
              </label>
              <select
                disabled={!isAdmin}
                value={frequency}
                onChange={(e) =>
                  handleCustomChange(e.target.value as LLMFrequency, questionsPerRun, smartSkipMastered)
                }
                className="w-full text-xs sm:text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#6B4BC8]/20 focus:border-[#6B4BC8]"
              >
                <option value="daily">Daily (Every Night)</option>
                <option value="every_other_day">Every Other Day (Recommended)</option>
                <option value="weekly">Weekly (Every 7 Days)</option>
                <option value="monthly">Monthly (Every 30 Days)</option>
              </select>
            </div>

            {/* Questions Per Run Selector */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Questions Per Run (Rotated)
              </label>
              <select
                disabled={!isAdmin}
                value={questionsPerRun}
                onChange={(e) =>
                  handleCustomChange(frequency, Number(e.target.value), smartSkipMastered)
                }
                className="w-full text-xs sm:text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#6B4BC8]/20 focus:border-[#6B4BC8]"
              >
                <option value={3}>3 questions / run (Minimum Burn)</option>
                <option value={5}>5 questions / run</option>
                <option value={6}>6 questions / run (Balanced)</option>
                <option value={10}>10 questions / run</option>
                <option value={15}>15 questions / run (Full Batch)</option>
              </select>
            </div>

            {/* Smart Skip Toggle */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Smart Skip Highly Relevant
              </label>
              <button
                type="button"
                disabled={!isAdmin}
                onClick={() =>
                  handleCustomChange(frequency, questionsPerRun, !smartSkipMastered)
                }
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-xs sm:text-sm font-medium transition-colors cursor-pointer ${
                  smartSkipMastered
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                    : 'bg-white border-slate-200 text-slate-700'
                }`}
              >
                <span>
                  {smartSkipMastered ? 'Enabled (30-day recheck)' : 'Disabled (Ask every time)'}
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                    smartSkipMastered
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {smartSkipMastered ? 'ON' : 'OFF'}
                </span>
              </button>
            </div>
          </div>

          {/* Info Note & Mastered Questions Summary */}
          <div className="pt-2 border-t border-slate-200/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-600">
            <div className="flex items-start sm:items-center gap-2">
              <Info className="h-4 w-4 text-[#6B4BC8] shrink-0 mt-0.5 sm:mt-0" />
              <span>
                <strong>Carry-Forward Scoring:</strong> Questions where ChatGPT, Claude, and Gemini all recommend Kids Dentist are marked{' '}
                <strong className="text-emerald-700">Mastered</strong>, skipped for 30 days, and carried forward in your trend score.
              </span>
            </div>

            {masteredList.length > 0 && (
              <button
                type="button"
                onClick={() => setShowMasteredDetails(!showMasteredDetails)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#6B4BC8] hover:text-[#5a3da8] shrink-0 cursor-pointer"
              >
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                <span>
                  {masteredList.length} / {totalTracked} Mastered
                </span>
                {showMasteredDetails ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </button>
            )}
          </div>

          {showMasteredDetails && masteredList.length > 0 && (
            <div className="pt-2">
              <div className="bg-white rounded-lg border border-slate-200 p-3 max-h-48 overflow-y-auto">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                  Currently Mastered Questions (100% Across ChatGPT, Claude & Gemini — Auto-Skipped for 30 Days)
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {masteredList.map((item) => (
                    <span
                      key={item.key}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs bg-emerald-50 text-emerald-800 border border-emerald-200 font-medium"
                    >
                      <CheckCircle2 className="h-3 w-3 text-emerald-600 shrink-0" />
                      <span>
                        {item.location} — {item.topicName}
                      </span>
                      <span className="text-[10px] text-emerald-600/80">({item.lastTestedDate})</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
