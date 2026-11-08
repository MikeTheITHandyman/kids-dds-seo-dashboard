'use client';

import { useState, useEffect } from 'react';
import {
  Sliders,
  Check,
  Loader2,
  Plus,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  BarChart3,
  Database,
} from 'lucide-react';
import type { ClientConfig } from '@/lib/clients';
import type { GA4DiscoveredEvent } from '@/lib/ga4-api';

interface Props {
  client: ClientConfig;
  isAdmin: boolean;
}

export default function GA4LeadEventsSelector({ client, isAdmin }: Props) {
  const [isOpen, setIsOpen] = useState(
    client.leadsConfig?.source === 'ga4_events' &&
      (!client.leadsConfig?.selectedGa4Events || client.leadsConfig.selectedGa4Events.length === 0)
  );
  const [source, setSource] = useState<'ga4_events' | 'sanity'>(
    client.leadsConfig?.source || 'ga4_events'
  );
  const [selectedEvents, setSelectedEvents] = useState<string[]>(
    client.leadsConfig?.selectedGa4Events || []
  );
  const [discoveredEvents, setDiscoveredEvents] = useState<GA4DiscoveredEvent[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [discoverError, setDiscoverError] = useState('');
  const [customEventName, setCustomEventName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState('');

  const fetchEventsFromGA4 = async () => {
    if (!client.ga4PropertyId) {
      setDiscoverError('Configure a Google Analytics 4 Property ID in Settings first.');
      return;
    }
    setIsLoadingEvents(true);
    setDiscoverError('');
    try {
      const res = await fetch(
        `/api/ga4/events?propertyId=${encodeURIComponent(client.ga4PropertyId)}`
      );
      const data = await res.json();
      if (data.error) {
        setDiscoverError(data.error);
      } else {
        setDiscoveredEvents(data.events || []);
      }
    } catch (e: any) {
      setDiscoverError(e.message || 'Could not load GA4 events');
    } finally {
      setIsLoadingEvents(false);
    }
  };

  useEffect(() => {
    if (isOpen && discoveredEvents.length === 0 && client.ga4PropertyId) {
      fetchEventsFromGA4();
    }
  }, [isOpen, client.ga4PropertyId]);

  const toggleEvent = (eventName: string) => {
    if (!isAdmin) return;
    setSelectedEvents(prev =>
      prev.includes(eventName) ? prev.filter(e => e !== eventName) : [...prev, eventName]
    );
  };

  const handleAddCustomEvent = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = customEventName.trim();
    if (!clean) return;
    if (!selectedEvents.includes(clean)) {
      setSelectedEvents(prev => [...prev, clean]);
    }
    setCustomEventName('');
  };

  const handleSaveLeadsConfig = async () => {
    if (!isAdmin) return;
    setIsSaving(true);
    setSavedNotice('');
    try {
      const res = await fetch('/api/clients', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: client.id,
          leadsConfig: {
            ...client.leadsConfig,
            source,
            selectedGa4Events: selectedEvents,
          },
        }),
      });
      if (res.ok) {
        setSavedNotice('Lead tracking configuration saved. Refreshing...');
        setTimeout(() => window.location.reload(), 900);
      }
    } finally {
      setIsSaving(false);
    }
  };

  if (!isAdmin) return null;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
      <div className="px-4 py-3 sm:px-6 sm:py-4 flex flex-wrap items-center justify-between gap-3 bg-slate-50/70">
        <div className="flex items-center gap-2.5">
          <Sliders className="h-4 w-4 text-[#6B4BC8]" />
          <div>
            <span className="text-xs sm:text-sm font-semibold text-slate-800">
              Lead Source &amp; Google Analytics Key Events Selector
            </span>
            <span className="ml-2 text-[11px] font-medium px-2 py-0.5 rounded-full bg-purple-100 text-[#6B4BC8]">
              {source === 'ga4_events'
                ? `GA4 Key Events (${selectedEvents.length} selected)`
                : 'Sanity CMS Form Submissions'}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#6B4BC8] bg-white hover:bg-purple-50 border border-purple-200 rounded-lg transition-colors cursor-pointer"
        >
          <span>{isOpen ? 'Hide Event Selector' : 'Configure Lead Key Events'}</span>
          {isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      </div>

      {isOpen && (
        <div className="p-4 sm:p-6 border-t border-slate-200 space-y-5">
          {savedNotice && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 font-medium flex items-center gap-2">
              <Check className="h-4 w-4 text-emerald-600" />
              <span>{savedNotice}</span>
            </div>
          )}

          {/* Data Source Toggle */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                1. Choose Conversion Data Source
              </label>
              <div className="inline-flex rounded-lg bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setSource('ga4_events')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                    source === 'ga4_events'
                      ? 'bg-[#6B4BC8] text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <BarChart3 className="h-3.5 w-3.5" />
                  Google Analytics 4 Key Events
                </button>
                {client.id === 'kids-dentist' && (
                  <button
                    type="button"
                    onClick={() => setSource('sanity')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                      source === 'sanity'
                        ? 'bg-[#6B4BC8] text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Database className="h-3.5 w-3.5" />
                    Sanity.io Form Submissions
                  </button>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={handleSaveLeadsConfig}
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#6B4BC8] hover:bg-[#5a3da8] text-white text-xs sm:text-sm font-semibold rounded-lg shadow-xs disabled:opacity-50 cursor-pointer"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  Save Lead Events Selection
                </>
              )}
            </button>
          </div>

          {source === 'ga4_events' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-600">
                    2. Select GA4 Key Events / Conversions to Track as Leads (Property: {client.ga4PropertyId || 'Not Set'})
                  </div>
                  <p className="text-xs text-slate-500">
                    Check any GA4 events below to include them in your Leads KPI cards and conversion charts.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={fetchEventsFromGA4}
                  disabled={isLoadingEvents}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isLoadingEvents ? 'animate-spin' : ''}`} />
                  Refresh GA4 Events
                </button>
              </div>

              {discoverError && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                  {discoverError}
                </div>
              )}

              {/* Currently Selected Pills */}
              {selectedEvents.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-semibold text-slate-500 mr-1">Selected:</span>
                  {selectedEvents.map(ev => (
                    <button
                      key={ev}
                      type="button"
                      onClick={() => toggleEvent(ev)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#6B4BC8] text-white cursor-pointer"
                    >
                      <Check className="h-3 w-3" />
                      <span>{ev}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Discovered GA4 Events Grid */}
              {isLoadingEvents ? (
                <div className="py-6 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-[#6B4BC8]" />
                  <span>Querying Google Analytics 4 for recorded event names...</span>
                </div>
              ) : discoveredEvents.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-60 overflow-y-auto p-1">
                  {discoveredEvents.map(item => {
                    const checked = selectedEvents.includes(item.eventName);
                    return (
                      <button
                        key={item.eventName}
                        type="button"
                        onClick={() => toggleEvent(item.eventName)}
                        className={`flex items-center justify-between p-2.5 rounded-lg border text-left text-xs transition-all cursor-pointer ${
                          checked
                            ? 'border-[#6B4BC8] bg-purple-50/60 text-slate-900 font-semibold'
                            : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <input
                            type="checkbox"
                            readOnly
                            checked={checked}
                            className="rounded border-slate-300 text-[#6B4BC8]"
                          />
                          <span className="truncate font-mono">{item.eventName}</span>
                        </div>
                        <span className="text-[11px] text-slate-500 shrink-0 ml-2">
                          {item.eventCount.toLocaleString()}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {/* Add Custom Event Name */}
              <form onSubmit={handleAddCustomEvent} className="flex items-center gap-2 pt-1">
                <input
                  type="text"
                  placeholder="Or type a custom GA4 event name (e.g. generate_lead, call_click)"
                  value={customEventName}
                  onChange={e => setCustomEventName(e.target.value)}
                  className="text-xs bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-slate-800 font-mono flex-1 max-w-md"
                />
                <button
                  type="submit"
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-800 text-white text-xs font-semibold rounded-lg cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Event
                </button>
              </form>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
