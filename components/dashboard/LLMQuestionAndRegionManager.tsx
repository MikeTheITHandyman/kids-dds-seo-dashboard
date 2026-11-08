'use client';

import { useState } from 'react';
import {
  Sparkles,
  MapPin,
  Plus,
  Trash2,
  Check,
  Loader2,
  ArrowUp,
  ArrowDown,
  RotateCw,
  Wand2,
  Globe,
  HelpCircle,
  Edit3,
  X,
} from 'lucide-react';
import type { ClientConfig, CustomQuestion } from '@/lib/clients';
import { formatPromptWithRegion, type LocationConfig } from '@/lib/ai-harness/config';

interface RecommendedQuestionItem {
  id: string;
  topic: string;
  promptTemplate: string;
  isRegional: boolean;
  rationale: string;
}

interface Props {
  client: ClientConfig;
  currentRegionIndex: number;
  regionalRotationEnabled: boolean;
  isAdmin: boolean;
  onClientUpdated?: (updated: ClientConfig) => void;
}

export default function LLMQuestionAndRegionManager({
  client,
  currentRegionIndex: initialRegionIndex,
  regionalRotationEnabled: initialRotationEnabled,
  isAdmin,
  onClientUpdated,
}: Props) {
  const [questions, setQuestions] = useState<CustomQuestion[]>(client.questions || []);
  const [regions, setRegions] = useState<LocationConfig[]>(client.regions || []);
  const [regionalRotationEnabled, setRegionalRotationEnabled] = useState<boolean>(
    initialRotationEnabled ?? client.regionalRotationEnabled ?? true
  );
  const [currentRegionIndex, setCurrentRegionIndex] = useState<number>(
    initialRegionIndex ?? client.currentRegionIndex ?? 0
  );

  // Add / Edit Question State
  const [newTopic, setNewTopic] = useState('');
  const [newPrompt, setNewPrompt] = useState('');
  const [newIsRegional, setNewIsRegional] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTopic, setEditTopic] = useState('');
  const [editPrompt, setEditPrompt] = useState('');
  const [editIsRegional, setEditIsRegional] = useState(true);

  // Add Region State
  const [newCityName, setNewCityName] = useState('');
  const [newCityState, setNewCityState] = useState('IL');
  const [newCityTier, setNewCityTier] = useState<'primary' | 'secondary' | 'regional'>('primary');

  // AI Recommendation State
  const [aiHint, setAiHint] = useState('');
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [aiRecommendations, setAiRecommendations] = useState<RecommendedQuestionItem[]>([]);
  const [aiEngineUsed, setAiEngineUsed] = useState('');
  const [aiError, setAiError] = useState('');

  // Save State
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const safeRegionIndex =
    regions.length > 0 ? ((currentRegionIndex % regions.length) + regions.length) % regions.length : 0;
  const activeRegion = regions[safeRegionIndex];

  const persistChanges = async (
    nextQuestions: CustomQuestion[],
    nextRegions: LocationConfig[],
    nextRotationEnabled: boolean,
    nextRegionIdx: number,
    noticeText: string = 'Questions & regional rotation saved.'
  ) => {
    if (!isAdmin) return;
    setIsSaving(true);
    setSaveMessage('');
    setErrorMessage('');

    try {
      const [clientRes] = await Promise.all([
        fetch('/api/clients', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: client.id,
            questions: nextQuestions,
            regions: nextRegions,
            regionalRotationEnabled: nextRotationEnabled,
            currentRegionIndex: nextRegionIdx,
          }),
        }),
        fetch('/api/settings/llm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientId: client.id,
            regionalRotationEnabled: nextRotationEnabled,
            currentRegionIndex: nextRegionIdx,
          }),
        }),
      ]);

      const data = await clientRes.json();
      if (!clientRes.ok || data.error) {
        throw new Error(data.error || 'Failed to save changes');
      }

      if (data.client && onClientUpdated) {
        onClientUpdated(data.client);
      }

      setSaveMessage(noticeText);
      setTimeout(() => setSaveMessage(''), 4000);
    } catch (e: any) {
      setErrorMessage(e.message || 'Error saving settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPrompt.trim()) return;
    const topicLabel = newTopic.trim() || 'Custom Question';
    const slug = topicLabel
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
    const created: CustomQuestion = {
      id: `${slug || 'q'}_${Date.now().toString(36).slice(-4)}`,
      topic: topicLabel,
      promptTemplate: newPrompt.trim(),
      isRegional: newIsRegional,
      enabled: true,
      language: 'en',
    };

    const next = [...questions, created];
    setQuestions(next);
    setNewTopic('');
    setNewPrompt('');
    await persistChanges(
      next,
      regions,
      regionalRotationEnabled,
      safeRegionIndex,
      `Added question "${topicLabel}".`
    );
  };

  const handleToggleQuestion = async (id: string) => {
    const next = questions.map(q => (q.id === id ? { ...q, enabled: !q.enabled } : q));
    setQuestions(next);
    await persistChanges(next, regions, regionalRotationEnabled, safeRegionIndex);
  };

  const handleToggleRegional = async (id: string) => {
    const next = questions.map(q => (q.id === id ? { ...q, isRegional: !q.isRegional } : q));
    setQuestions(next);
    await persistChanges(next, regions, regionalRotationEnabled, safeRegionIndex);
  };

  const handleDeleteQuestion = async (id: string) => {
    const next = questions.filter(q => q.id !== id);
    setQuestions(next);
    await persistChanges(
      next,
      regions,
      regionalRotationEnabled,
      safeRegionIndex,
      'Question removed.'
    );
  };

  const startEditingQuestion = (q: CustomQuestion) => {
    setEditingId(q.id);
    setEditTopic(q.topic);
    setEditPrompt(q.promptTemplate);
    setEditIsRegional(q.isRegional);
  };

  const saveEditedQuestion = async (id: string) => {
    if (!editPrompt.trim()) return;
    const next = questions.map(q =>
      q.id === id
        ? {
            ...q,
            topic: editTopic.trim() || q.topic,
            promptTemplate: editPrompt.trim(),
            isRegional: editIsRegional,
          }
        : q
    );
    setQuestions(next);
    setEditingId(null);
    await persistChanges(next, regions, regionalRotationEnabled, safeRegionIndex, 'Question updated.');
  };

  // Region Management
  const handleAddRegion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCityName.trim()) return;
    const created: LocationConfig = {
      name: newCityName.trim(),
      state: newCityState.trim() || 'IL',
      tier: newCityTier,
    };
    const next = [...regions, created];
    setRegions(next);
    setNewCityName('');
    await persistChanges(
      questions,
      next,
      regionalRotationEnabled,
      safeRegionIndex,
      `Added ${created.name} to regional rotation.`
    );
  };

  const handleRemoveRegion = async (idx: number) => {
    const next = regions.filter((_, i) => i !== idx);
    const nextIdx = next.length > 0 ? safeRegionIndex % next.length : 0;
    setRegions(next);
    setCurrentRegionIndex(nextIdx);
    await persistChanges(questions, next, regionalRotationEnabled, nextIdx, 'Region removed.');
  };

  const handleMoveRegion = async (idx: number, direction: -1 | 1) => {
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= regions.length) return;
    const next = [...regions];
    const temp = next[idx];
    next[idx] = next[targetIdx];
    next[targetIdx] = temp;
    setRegions(next);
    await persistChanges(questions, next, regionalRotationEnabled, safeRegionIndex, 'Region order updated.');
  };

  const handleSetNextRegion = async (idx: number) => {
    setCurrentRegionIndex(idx);
    await persistChanges(
      questions,
      regions,
      regionalRotationEnabled,
      idx,
      `Next run will target ${regions[idx]?.name}.`
    );
  };

  const handleToggleRotationMode = async () => {
    const nextMode = !regionalRotationEnabled;
    setRegionalRotationEnabled(nextMode);
    await persistChanges(
      questions,
      regions,
      nextMode,
      safeRegionIndex,
      nextMode
        ? 'Location-per-run rotation enabled.'
        : 'Multi-region interleaved mode enabled.'
    );
  };

  // AI Question Generator
  const handleGenerateRecommendations = async () => {
    setIsGeneratingAi(true);
    setAiError('');
    try {
      const res = await fetch('/api/llm/recommend-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: client.id,
          customHint: aiHint,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to generate recommendations');
      }
      setAiRecommendations(data.recommendations || []);
      setAiEngineUsed(data.engine || 'AI');
    } catch (e: any) {
      setAiError(e.message || 'Could not generate AI recommendations');
    } finally {
      setIsGeneratingAi(false);
    }
  };

  const handleAcceptRecommendation = async (rec: RecommendedQuestionItem) => {
    const created: CustomQuestion = {
      id: rec.id,
      topic: rec.topic,
      promptTemplate: rec.promptTemplate,
      isRegional: rec.isRegional,
      enabled: true,
      language: 'en',
    };
    const next = [...questions, created];
    setQuestions(next);
    setAiRecommendations(prev => prev.filter(r => r.id !== rec.id));
    await persistChanges(
      next,
      regions,
      regionalRotationEnabled,
      safeRegionIndex,
      `Added AI recommended question "${rec.topic}".`
    );
  };

  const handleAcceptAllRecommendations = async () => {
    if (aiRecommendations.length === 0) return;
    const added: CustomQuestion[] = aiRecommendations.map(rec => ({
      id: rec.id,
      topic: rec.topic,
      promptTemplate: rec.promptTemplate,
      isRegional: rec.isRegional,
      enabled: true,
      language: 'en',
    }));
    const next = [...questions, ...added];
    setQuestions(next);
    setAiRecommendations([]);
    await persistChanges(
      next,
      regions,
      regionalRotationEnabled,
      safeRegionIndex,
      `Added ${added.length} AI recommended questions.`
    );
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
      {/* Header */}
      <div className="p-4 sm:p-6 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base sm:text-lg font-semibold text-slate-800 flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-[#6B4BC8] shrink-0" />
            LLM Target Questions, Regional Rotation &amp; AI Generator
          </h2>
          <p className="text-xs sm:text-sm text-slate-500">
            Specify the exact questions asked to ChatGPT, Claude, and Gemini, manage the rotating geographic regions for{' '}
            <strong className="text-slate-700">{client.name}</strong>, or generate new questions with AI.
          </p>
        </div>

        {isSaving && (
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#6B4BC8] bg-purple-50 px-3 py-1.5 rounded-lg">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Saving...
          </div>
        )}
      </div>

      {saveMessage && (
        <div className="mx-4 sm:mx-6 mt-4 flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-xs sm:text-sm font-medium">
          <Check className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{saveMessage}</span>
        </div>
      )}
      {errorMessage && (
        <div className="mx-4 sm:mx-6 mt-4 flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs sm:text-sm font-medium">
          <span>{errorMessage}</span>
        </div>
      )}

      <div className="p-4 sm:p-6 space-y-8">
        {/* SECTION 1: Regional Rotation Queue */}
        <div className="bg-slate-50 rounded-xl p-4 sm:p-5 border border-slate-200/80 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-[#6B4BC8]" />
                <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-800">
                  Regional Rotation Queue ({regions.length} Geographic Areas)
                </h3>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Each run tests all regionalized questions in the <strong>Up Next</strong> geographic area, then automatically rotates to the next area on the following run.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={!isAdmin}
                onClick={handleToggleRotationMode}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                  regionalRotationEnabled
                    ? 'bg-[#6B4BC8] text-white border-[#6B4BC8]'
                    : 'bg-white text-slate-700 border-slate-300'
                }`}
              >
                <RotateCw className="h-3.5 w-3.5" />
                <span>
                  {regionalRotationEnabled
                    ? 'Rotation: 1 Region Per Run (Active)'
                    : 'Rotation: Mixed Regions Per Run'}
                </span>
              </button>
            </div>
          </div>

          {/* Active / Up Next Region Callout */}
          {activeRegion && (
            <div className="flex flex-wrap items-center justify-between gap-2 bg-white border border-purple-200 rounded-lg px-3.5 py-2.5">
              <div className="flex items-center gap-2 text-xs sm:text-sm">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#6B4BC8] text-white">
                  UP NEXT (#{safeRegionIndex + 1})
                </span>
                <span className="font-bold text-slate-800">
                  {activeRegion.name}, {activeRegion.state}
                </span>
                {regions.length > 1 && (
                  <span className="text-xs text-slate-500">
                    → followed by{' '}
                    <strong className="text-slate-700">
                      {regions[(safeRegionIndex + 1) % regions.length]?.name}
                    </strong>
                    {regions.length > 2 && (
                      <>
                        {' '}
                        →{' '}
                        <strong className="text-slate-700">
                          {regions[(safeRegionIndex + 2) % regions.length]?.name}
                        </strong>
                      </>
                    )}
                  </span>
                )}
              </div>
              <span className="text-[11px] text-slate-500">
                Click any city pill below to make it the next run&apos;s target
              </span>
            </div>
          )}

          {/* Region Chips List */}
          <div className="flex flex-wrap gap-2">
            {regions.map((loc, idx) => {
              const isCurrent = idx === safeRegionIndex;
              return (
                <div
                  key={`${loc.name}-${idx}`}
                  className={`inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-lg text-xs border transition-all ${
                    isCurrent
                      ? 'bg-purple-100/80 border-[#6B4BC8] text-slate-900 font-semibold shadow-2xs'
                      : 'bg-white border-slate-200 text-slate-700'
                  }`}
                >
                  <button
                    type="button"
                    disabled={!isAdmin}
                    onClick={() => handleSetNextRegion(idx)}
                    className="flex items-center gap-1.5 cursor-pointer hover:text-[#6B4BC8]"
                    title="Click to set this location as Up Next for the next run"
                  >
                    <span className="text-[10px] font-bold text-slate-400">{idx + 1}.</span>
                    <span>
                      {loc.name}
                      {loc.name.includes(loc.state) ? '' : `, ${loc.state}`}
                    </span>
                    {isCurrent && (
                      <span className="text-[10px] font-bold bg-[#6B4BC8] text-white px-1.5 py-0.2 rounded">
                        NEXT
                      </span>
                    )}
                  </button>

                  {isAdmin && (
                    <div className="flex items-center gap-0.5 ml-1 pl-1 border-l border-slate-200">
                      <button
                        type="button"
                        onClick={() => handleMoveRegion(idx, -1)}
                        disabled={idx === 0}
                        className="p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                        title="Move earlier in rotation"
                      >
                        <ArrowUp className="h-3 w-3 -rotate-90" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveRegion(idx, 1)}
                        disabled={idx === regions.length - 1}
                        className="p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                        title="Move later in rotation"
                      >
                        <ArrowDown className="h-3 w-3 -rotate-90" />
                      </button>
                      {regions.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveRegion(idx)}
                          className="p-0.5 text-slate-400 hover:text-rose-600 cursor-pointer"
                          title="Remove region"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Add New Region Form */}
          {isAdmin && (
            <form onSubmit={handleAddRegion} className="flex flex-wrap items-center gap-2 pt-2">
              <input
                type="text"
                placeholder="Add city or region (e.g. Vernon Hills)"
                value={newCityName}
                onChange={e => setNewCityName(e.target.value)}
                className="text-xs bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#6B4BC8] flex-1 min-w-[180px]"
              />
              <input
                type="text"
                placeholder="State (e.g. IL)"
                value={newCityState}
                onChange={e => setNewCityState(e.target.value)}
                className="text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-800 w-20 focus:outline-none focus:border-[#6B4BC8]"
              />
              <select
                value={newCityTier}
                onChange={e => setNewCityTier(e.target.value as any)}
                className="text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700"
              >
                <option value="primary">Primary Market</option>
                <option value="secondary">Secondary Market</option>
                <option value="regional">Regional Area</option>
              </select>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Area
              </button>
            </form>
          )}
        </div>

        {/* SECTION 2: Configured Questions List */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-800">
                Configured Questions ({questions.filter(q => q.enabled !== false).length} Active / {questions.length} Total)
              </h3>
              <p className="text-xs text-slate-500">
                Use <code className="bg-slate-100 px-1 py-0.5 rounded text-[#6B4BC8] font-mono">{'{location}'}</code> in regional questions to automatically inject the rotating geographic area.
              </p>
            </div>
          </div>

          <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
            {questions.length === 0 ? (
              <div className="p-6 text-center text-xs sm:text-sm text-slate-500">
                No questions configured yet. Add a question below or use the AI Recommender!
              </div>
            ) : (
              questions.map((q, idx) => {
                const isEditing = editingId === q.id;
                const previewPrompt = formatPromptWithRegion(q, activeRegion);

                return (
                  <div
                    key={q.id}
                    className={`p-3.5 sm:p-4 transition-colors ${
                      q.enabled === false ? 'bg-slate-50/70 opacity-60' : 'bg-white'
                    }`}
                  >
                    {isEditing ? (
                      <div className="space-y-3">
                        <div className="flex flex-wrap gap-2">
                          <input
                            type="text"
                            value={editTopic}
                            onChange={e => setEditTopic(e.target.value)}
                            placeholder="Topic Label (e.g. Emergency)"
                            className="text-xs font-semibold bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-slate-800 w-48"
                          />
                          <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 bg-slate-100 px-3 py-1.5 rounded-lg cursor-pointer">
                            <input
                              type="checkbox"
                              checked={editIsRegional}
                              onChange={e => setEditIsRegional(e.target.checked)}
                              className="rounded border-slate-300 text-[#6B4BC8]"
                            />
                            <span>Regionalize with {'{location}'}</span>
                          </label>
                        </div>
                        <textarea
                          rows={2}
                          value={editPrompt}
                          onChange={e => setEditPrompt(e.target.value)}
                          className="w-full text-xs sm:text-sm bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:outline-none focus:border-[#6B4BC8]"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => saveEditedQuestion(q.id)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#6B4BC8] text-white text-xs font-semibold rounded-lg cursor-pointer"
                          >
                            <Check className="h-3.5 w-3.5" /> Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 text-slate-600 text-xs font-medium rounded-lg cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                        <div className="space-y-1 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-bold text-slate-400">#{idx + 1}</span>
                            <span className="text-xs font-bold bg-slate-100 text-slate-800 px-2.5 py-0.5 rounded-md">
                              {q.topic}
                            </span>
                            <button
                              type="button"
                              disabled={!isAdmin}
                              onClick={() => handleToggleRegional(q.id)}
                              className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border transition-colors cursor-pointer ${
                                q.isRegional
                                  ? 'bg-purple-50 text-[#6B4BC8] border-purple-200'
                                  : 'bg-slate-100 text-slate-600 border-slate-200'
                              }`}
                              title="Click to toggle between Regional rotation and General non-regional question"
                            >
                              {q.isRegional ? (
                                <>
                                  <MapPin className="h-3 w-3" /> Regional (Rotates Area)
                                </>
                              ) : (
                                <>
                                  <Globe className="h-3 w-3" /> General (Non-Regional)
                                </>
                              )}
                            </button>
                          </div>

                          <p className="text-xs sm:text-sm font-medium text-slate-900">
                            {q.promptTemplate}
                          </p>

                          {q.isRegional && activeRegion && (
                            <p className="text-[11px] text-slate-500">
                              <span className="font-semibold text-[#6B4BC8]">Next Run Preview:</span>{' '}
                              &ldquo;{previewPrompt}&rdquo;
                            </p>
                          )}
                        </div>

                        {isAdmin && (
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleToggleQuestion(q.id)}
                              className={`px-2.5 py-1 rounded-md text-xs font-semibold border cursor-pointer ${
                                q.enabled !== false
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-slate-100 text-slate-500 border-slate-200'
                              }`}
                            >
                              {q.enabled !== false ? 'Active' : 'Paused'}
                            </button>
                            <button
                              type="button"
                              onClick={() => startEditingQuestion(q)}
                              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
                              title="Edit Question"
                            >
                              <Edit3 className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteQuestion(q.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                              title="Delete Question"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Add Custom Question Form */}
          {isAdmin && (
            <form
              onSubmit={handleAddQuestion}
              className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 space-y-3"
            >
              <div className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Add a Custom Question
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Topic / Category Label
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Invisalign & Teens"
                    value={newTopic}
                    onChange={e => setNewTopic(e.target.value)}
                    className="w-full text-xs sm:text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:border-[#6B4BC8]"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Question / Prompt Text (include {'{location}'} for regional rotation)
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Which pediatric dental offices in or near {location} offer..."
                    value={newPrompt}
                    onChange={e => setNewPrompt(e.target.value)}
                    className="w-full text-xs sm:text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:border-[#6B4BC8]"
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newIsRegional}
                    onChange={e => setNewIsRegional(e.target.checked)}
                    className="rounded border-slate-300 text-[#6B4BC8]"
                  />
                  <span>
                    Regionalize this question (rotates through {regions.length} geographic areas across runs)
                  </span>
                </label>

                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#6B4BC8] hover:bg-[#5a3da8] text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                  Add Question
                </button>
              </div>
            </form>
          )}
        </div>

        {/* SECTION 3: AI Recommended Questions Generator */}
        {isAdmin && (
          <div className="bg-gradient-to-br from-purple-50/70 via-white to-indigo-50/50 rounded-xl p-4 sm:p-5 border border-purple-200/80 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <Wand2 className="h-4 w-4 text-[#6B4BC8]" />
                  AI Question Recommender for {client.name}
                </h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  Uses AI and your client profile ({client.businessType || 'Local Business'}) to suggest high-intent customer questions you aren&apos;t testing yet.
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                placeholder="Optional focus hint (e.g. 'Focus on tongue-tie, weekend hours, or Medicaid/insurance')"
                value={aiHint}
                onChange={e => setAiHint(e.target.value)}
                className="flex-1 text-xs sm:text-sm bg-white border border-purple-200 rounded-lg px-3.5 py-2 text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#6B4BC8]"
              />
              <button
                type="button"
                onClick={handleGenerateRecommendations}
                disabled={isGeneratingAi}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-[#6B4BC8] hover:bg-[#5a3da8] text-white text-xs sm:text-sm font-semibold rounded-lg shadow-xs transition-colors disabled:opacity-50 shrink-0 cursor-pointer"
              >
                {isGeneratingAi ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating with AI...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Generate Recommended Questions
                  </>
                )}
              </button>
            </div>

            {aiError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 font-medium">
                {aiError}
              </div>
            )}

            {aiRecommendations.length > 0 && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#6B4BC8]">
                    AI Recommendations ({aiRecommendations.length} generated via {aiEngineUsed})
                  </span>
                  <button
                    type="button"
                    onClick={handleAcceptAllRecommendations}
                    className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add All ({aiRecommendations.length})
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {aiRecommendations.map(rec => (
                    <div
                      key={rec.id}
                      className="bg-white rounded-lg border border-purple-200/80 p-3.5 flex flex-col justify-between gap-3 shadow-2xs"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-slate-800 bg-purple-50 px-2 py-0.5 rounded">
                            {rec.topic}
                          </span>
                          <span className="text-[11px] font-medium text-[#6B4BC8]">
                            {rec.isRegional ? '📍 Regional ({location})' : '🌐 General'}
                          </span>
                        </div>
                        <p className="text-xs sm:text-sm font-semibold text-slate-900">
                          &ldquo;{rec.promptTemplate}&rdquo;
                        </p>
                        {rec.rationale && (
                          <p className="text-[11px] text-slate-500 leading-relaxed">
                            💡 {rec.rationale}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() =>
                            setAiRecommendations(prev => prev.filter(r => r.id !== rec.id))
                          }
                          className="px-2.5 py-1 text-xs text-slate-500 hover:text-slate-700 cursor-pointer"
                        >
                          Dismiss
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAcceptRecommendation(rec)}
                          className="inline-flex items-center gap-1 px-3 py-1 bg-[#6B4BC8] hover:bg-[#5a3da8] text-white text-xs font-semibold rounded-md cursor-pointer"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Add to Questions
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
