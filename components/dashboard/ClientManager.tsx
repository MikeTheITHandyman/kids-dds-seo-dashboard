'use client';

import { useState } from 'react';
import {
  Building2,
  Plus,
  Check,
  Loader2,
  Copy,
  Globe,
  BarChart3,
  ShieldCheck,
  Trash2,
  X,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { ClientConfig } from '@/lib/clients';

const DEFAULT_CLIENT_ID = 'kids-dentist';

interface Props {
  activeClient: ClientConfig;
  allClients: ClientConfig[];
  isSuperAdmin: boolean;
  isAdmin: boolean;
  serviceAccountEmail?: string | null;
}

export default function ClientManager({
  activeClient: initialClient,
  allClients: initialAllClients,
  isSuperAdmin,
  isAdmin,
  serviceAccountEmail,
}: Props) {
  const [client, setClient] = useState<ClientConfig>(initialClient);
  const [clients, setClients] = useState<ClientConfig[]>(initialAllClients);

  // Editable fields for active client
  const [name, setName] = useState(client.name);
  const [shortName, setShortName] = useState(client.shortName);
  const [primaryLocation, setPrimaryLocation] = useState(client.primaryLocation);
  const [homeCity, setHomeCity] = useState(client.homeCity);
  const [domain, setDomain] = useState(client.domain);
  const [businessType, setBusinessType] = useState(client.businessType);
  const [services, setServices] = useState(client.services);
  const [targetAudience, setTargetAudience] = useState(client.targetAudience);
  const [address, setAddress] = useState(client.address);
  const [ga4PropertyId, setGa4PropertyId] = useState(client.ga4PropertyId);
  const [gscSiteUrl, setGscSiteUrl] = useState(client.gscSiteUrl);
  const [targetKeywordsStr, setTargetKeywordsStr] = useState(
    (client.targetKeywords || []).join(', ')
  );
  const [strongIndicatorsStr, setStrongIndicatorsStr] = useState(
    (client.strongIndicators || []).join(', ')
  );
  const [brandAliasesStr, setBrandAliasesStr] = useState(
    (client.brandAliases || []).join(', ')
  );
  const [knownCompetitorsStr, setKnownCompetitorsStr] = useState(
    (client.knownCompetitors || []).join(', ')
  );
  const [conflictingCitiesStr, setConflictingCitiesStr] = useState(
    (client.conflictingCities || []).join(', ')
  );

  const [showAdvancedDetection, setShowAdvancedDetection] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveNotice, setSaveNotice] = useState('');
  const [errorNotice, setErrorNotice] = useState('');
  const [copiedSa, setCopiedSa] = useState(false);

  // Create New Client Modal State (Super Admin)
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDomain, setNewDomain] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [newBusinessType, setNewBusinessType] = useState('');
  const [newServices, setNewServices] = useState('');
  const [newGa4Id, setNewGa4Id] = useState('');
  const [newGscUrl, setNewGscUrl] = useState('');
  const [newRegionsStr, setNewRegionsStr] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const parseCommaList = (str: string): string[] =>
    str
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

  const handleSaveClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    setIsSaving(true);
    setSaveNotice('');
    setErrorNotice('');

    try {
      const res = await fetch('/api/clients', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: client.id,
          name: name.trim(),
          shortName: shortName.trim().slice(0, 3).toUpperCase() || 'CL',
          subtitle: `${name.trim()} • ${primaryLocation.trim()}`.replace(/ • $/, ''),
          primaryLocation: primaryLocation.trim(),
          homeCity: homeCity.trim() || primaryLocation.split(',')[0].trim(),
          domain: domain.trim().replace(/^https?:\/\//, '').replace(/\/$/, ''),
          businessType: businessType.trim(),
          services: services.trim(),
          targetAudience: targetAudience.trim(),
          address: address.trim(),
          ga4PropertyId: ga4PropertyId.trim(),
          gscSiteUrl: gscSiteUrl.trim(),
          targetKeywords: parseCommaList(targetKeywordsStr),
          strongIndicators: parseCommaList(strongIndicatorsStr),
          brandAliases: parseCommaList(brandAliasesStr),
          knownCompetitors: parseCommaList(knownCompetitorsStr),
          conflictingCities: parseCommaList(conflictingCitiesStr),
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to save client configuration');
      }

      setClient(data.client);
      setSaveNotice(`Configuration for ${data.client.name} saved.`);
      setTimeout(() => setSaveNotice(''), 4000);
    } catch (e: any) {
      setErrorNotice(e.message || 'Error saving client');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSuperAdmin || !newName.trim()) return;
    setIsCreating(true);
    setErrorNotice('');

    try {
      const parsedRegions = parseCommaList(newRegionsStr).map(r => {
        const parts = r.split(':');
        return {
          name: parts[0].trim(),
          state: (parts[1] || newLocation.split(',')[1] || 'IL').trim(),
          tier: 'primary' as const,
        };
      });

      const defaultHomeCity = newLocation.split(',')[0].trim();
      const defaultState = (newLocation.split(',')[1] || 'IL').trim();
      const regionsToUse =
        parsedRegions.length > 0
          ? parsedRegions
          : defaultHomeCity
          ? [{ name: defaultHomeCity, state: defaultState, tier: 'primary' as const }]
          : [];

      const cleanDomain = newDomain.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');

      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          domain: cleanDomain,
          primaryLocation: newLocation.trim(),
          homeCity: defaultHomeCity,
          businessType: newBusinessType.trim(),
          services: newServices.trim(),
          ga4PropertyId: newGa4Id.trim(),
          gscSiteUrl: newGscUrl.trim() || (cleanDomain ? `sc-domain:${cleanDomain}` : ''),
          strongIndicators: [cleanDomain, newName.trim()].filter(Boolean),
          brandAliases: [newName.trim()],
          regions: regionsToUse,
          questions: [
            {
              id: 'local_general',
              topic: 'Local General',
              promptTemplate: `What are the most reputable, highly recommended ${
                newBusinessType.trim() || 'businesses'
              } in or near {location}? Please list specific names.`,
              isRegional: true,
              enabled: true,
              language: 'en',
            },
          ],
          switchToNew: true,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to create client');
      }

      setClients(prev => [...prev, data.client]);
      setIsCreateOpen(false);
      window.location.reload();
    } catch (e: any) {
      setErrorNotice(e.message || 'Failed to create client');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteClient = async () => {
    if (!isSuperAdmin || client.id === DEFAULT_CLIENT_ID) return;
    if (
      !confirm(
        `Are you sure you want to delete the client "${client.name}"? You will be switched back to Kids Dentist.`
      )
    ) {
      return;
    }

    try {
      const res = await fetch(`/api/clients?id=${encodeURIComponent(client.id)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        window.location.reload();
      }
    } catch (e) {
      console.error('Error deleting client:', e);
    }
  };

  const handleSwitchClient = async (targetId: string) => {
    try {
      await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'switch', clientId: targetId }),
      });
      window.location.reload();
    } catch (e) {
      console.error('Error switching client:', e);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
      {/* Header */}
      <div className="p-4 sm:p-6 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-[#6B4BC8] shrink-0" />
            <h2 className="text-base sm:text-lg font-semibold text-slate-800">
              Client Profile, GA4 &amp; Search Console Configuration
            </h2>
            {isSuperAdmin && (
              <span className="text-[10px] font-bold uppercase tracking-wider bg-purple-100 text-[#6B4BC8] px-2 py-0.5 rounded-full">
                Super Admin
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Configure business details, Google Analytics 4 Property ID, Search Console domain, and AI brand detection rules for{' '}
            <strong className="text-slate-800">{client.name}</strong>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {clients.length > 1 && (
            <select
              value={client.id}
              onChange={e => handleSwitchClient(e.target.value)}
              className="text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-semibold text-slate-800 cursor-pointer"
            >
              {clients.map(c => (
                <option key={c.id} value={c.id}>
                  Active Client: {c.name}
                </option>
              ))}
            </select>
          )}

          {isSuperAdmin && (
            <button
              type="button"
              onClick={() => setIsCreateOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              New Client
            </button>
          )}
        </div>
      </div>

      {saveNotice && (
        <div className="mx-4 sm:mx-6 mt-4 flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-xs sm:text-sm font-medium">
          <Check className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{saveNotice}</span>
        </div>
      )}
      {errorNotice && (
        <div className="mx-4 sm:mx-6 mt-4 flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs sm:text-sm font-medium">
          <span>{errorNotice}</span>
        </div>
      )}

      <form onSubmit={handleSaveClient} className="p-4 sm:p-6 space-y-6">
        {/* Google Service Account Callout */}
        {serviceAccountEmail && (
          <div className="bg-indigo-50/60 border border-indigo-200/80 rounded-xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <div className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-[#6B4BC8]" />
                Google Analytics &amp; Search Console Service Account
              </div>
              <p className="text-xs text-slate-600">
                When onboarding a new client, grant <strong>Viewer</strong> access in their GA4 Property and Google Search Console to:{' '}
                <code className="bg-white px-1.5 py-0.5 rounded border border-indigo-200 text-indigo-900 font-mono text-[11px]">
                  {serviceAccountEmail}
                </code>
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(serviceAccountEmail);
                setCopiedSa(true);
                setTimeout(() => setCopiedSa(false), 2000);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-indigo-50 text-indigo-800 border border-indigo-200 rounded-lg text-xs font-semibold shrink-0 cursor-pointer"
            >
              {copiedSa ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-600" /> Copied Email
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" /> Copy Service Account
                </>
              )}
            </button>
          </div>
        )}

        {/* Core Identity & Integrations Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Client / Business Name
            </label>
            <input
              type="text"
              required
              disabled={!isAdmin}
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full text-xs sm:text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:border-[#6B4BC8]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Badge Initials (2–3 chars)
            </label>
            <input
              type="text"
              maxLength={3}
              disabled={!isAdmin}
              value={shortName}
              onChange={e => setShortName(e.target.value)}
              className="w-full text-xs sm:text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:border-[#6B4BC8]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Primary City &amp; State
            </label>
            <input
              type="text"
              disabled={!isAdmin}
              placeholder="e.g. Grayslake, IL"
              value={primaryLocation}
              onChange={e => setPrimaryLocation(e.target.value)}
              className="w-full text-xs sm:text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:border-[#6B4BC8]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
              <Globe className="h-3.5 w-3.5 text-slate-400" />
              Website Domain
            </label>
            <input
              type="text"
              disabled={!isAdmin}
              placeholder="e.g. kidsdds.com"
              value={domain}
              onChange={e => setDomain(e.target.value)}
              className="w-full text-xs sm:text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:border-[#6B4BC8]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
              <BarChart3 className="h-3.5 w-3.5 text-[#6B4BC8]" />
              Google Analytics 4 Property ID
            </label>
            <input
              type="text"
              disabled={!isAdmin}
              placeholder="e.g. 554533089"
              value={ga4PropertyId}
              onChange={e => setGa4PropertyId(e.target.value)}
              className="w-full text-xs sm:text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-800 font-mono focus:outline-none focus:border-[#6B4BC8]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Search Console Site URL
            </label>
            <input
              type="text"
              disabled={!isAdmin}
              placeholder="e.g. sc-domain:kidsdds.com"
              value={gscSiteUrl}
              onChange={e => setGscSiteUrl(e.target.value)}
              className="w-full text-xs sm:text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-800 font-mono focus:outline-none focus:border-[#6B4BC8]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Business Category / Specialty
            </label>
            <input
              type="text"
              disabled={!isAdmin}
              placeholder="e.g. Pediatric Dentistry"
              value={businessType}
              onChange={e => setBusinessType(e.target.value)}
              className="w-full text-xs sm:text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:border-[#6B4BC8]"
            />
          </div>
        </div>

        {/* Services & Audience (Used by AI Question Recommender) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Core Services &amp; Differentiators (Used by AI Question Recommender)
            </label>
            <textarea
              rows={2}
              disabled={!isAdmin}
              value={services}
              onChange={e => setServices(e.target.value)}
              placeholder="List key services, specialties, insurance accepted, etc."
              className="w-full text-xs sm:text-sm bg-white border border-slate-200 rounded-lg p-2.5 text-slate-800 focus:outline-none focus:border-[#6B4BC8]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Target Audience &amp; Target SEO Keywords (comma-separated)
            </label>
            <input
              type="text"
              disabled={!isAdmin}
              value={targetAudience}
              onChange={e => setTargetAudience(e.target.value)}
              placeholder="Target audience description..."
              className="w-full text-xs sm:text-sm bg-white border border-slate-200 rounded-lg px-3 py-1.5 mb-2 text-slate-800 focus:outline-none focus:border-[#6B4BC8]"
            />
            <input
              type="text"
              disabled={!isAdmin}
              value={targetKeywordsStr}
              onChange={e => setTargetKeywordsStr(e.target.value)}
              placeholder="Target SEO keywords (e.g. pediatric dentist grayslake, kids dentist grayslake)"
              className="w-full text-xs bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-slate-800 focus:outline-none focus:border-[#6B4BC8]"
            />
          </div>
        </div>

        {/* Advanced Brand Mention Detection Rules */}
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <button
            type="button"
            onClick={() => setShowAdvancedDetection(!showAdvancedDetection)}
            className="w-full px-4 py-3 bg-slate-50 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <span>AI Brand Mention &amp; Competitor Detection Rules</span>
            {showAdvancedDetection ? (
              <ChevronUp className="h-4 w-4 text-slate-500" />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate-500" />
            )}
          </button>

          {showAdvancedDetection && (
            <div className="p-4 space-y-4 bg-white">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Strong Mention Indicators (comma-separated: domain, doctor/owner names, phone, address)
                  </label>
                  <textarea
                    rows={2}
                    disabled={!isAdmin}
                    value={strongIndicatorsStr}
                    onChange={e => setStrongIndicatorsStr(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2.5 text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Brand Name Aliases (comma-separated) &amp; Home City
                  </label>
                  <input
                    type="text"
                    disabled={!isAdmin}
                    value={brandAliasesStr}
                    onChange={e => setBrandAliasesStr(e.target.value)}
                    placeholder="e.g. Kids Dentist, Kids DDS"
                    className="w-full text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 mb-2 text-slate-800"
                  />
                  <input
                    type="text"
                    disabled={!isAdmin}
                    value={homeCity}
                    onChange={e => setHomeCity(e.target.value)}
                    placeholder="Home city for collision disambiguation (e.g. Grayslake)"
                    className="w-full text-xs bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Known Competitors to Track (comma-separated)
                  </label>
                  <textarea
                    rows={2}
                    disabled={!isAdmin}
                    value={knownCompetitorsStr}
                    onChange={e => setKnownCompetitorsStr(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2.5 text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Conflicting Cities for Name Collision Filtering (comma-separated, optional)
                  </label>
                  <textarea
                    rows={2}
                    disabled={!isAdmin}
                    value={conflictingCitiesStr}
                    onChange={e => setConflictingCitiesStr(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2.5 text-slate-800"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Save / Delete Footer */}
        {isAdmin && (
          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <div>
              {isSuperAdmin && client.id !== DEFAULT_CLIENT_ID && (
                <button
                  type="button"
                  onClick={handleDeleteClient}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete Client
                </button>
              )}
            </div>

            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#6B4BC8] hover:bg-[#5a3da8] text-white rounded-lg text-xs sm:text-sm font-semibold shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving Client...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  Save Client Profile &amp; Integrations
                </>
              )}
            </button>
          </div>
        )}
      </form>

      {/* Create New Client Modal (Super Admin Only) */}
      {isCreateOpen && isSuperAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-100 text-[#6B4BC8] flex items-center justify-center font-bold">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800 text-base">Create New Client</h3>
                  <p className="text-xs text-slate-500">
                    Set up a new client profile with its own GA4 ID, questions, and regions
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateClient} className="p-5 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Client / Business Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. North Shore Family Dental"
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    className="w-full text-sm px-3 py-2 border border-slate-200 rounded-lg text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Website Domain
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. northshoredental.com"
                    value={newDomain}
                    onChange={e => setNewDomain(e.target.value)}
                    className="w-full text-sm px-3 py-2 border border-slate-200 rounded-lg text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Primary City, State
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Libertyville, IL"
                    value={newLocation}
                    onChange={e => setNewLocation(e.target.value)}
                    className="w-full text-sm px-3 py-2 border border-slate-200 rounded-lg text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Google Analytics 4 Property ID
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 554533089"
                    value={newGa4Id}
                    onChange={e => setNewGa4Id(e.target.value)}
                    className="w-full text-sm px-3 py-2 border border-slate-200 rounded-lg text-slate-800 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Search Console Site URL
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. sc-domain:example.com"
                    value={newGscUrl}
                    onChange={e => setNewGscUrl(e.target.value)}
                    className="w-full text-sm px-3 py-2 border border-slate-200 rounded-lg text-slate-800 font-mono"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Business Category / Specialty
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Family & Cosmetic Dentistry"
                    value={newBusinessType}
                    onChange={e => setNewBusinessType(e.target.value)}
                    className="w-full text-sm px-3 py-2 border border-slate-200 rounded-lg text-slate-800"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Core Services (for AI Question Generation)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Implants, Invisalign, emergency dental care, cleanings"
                    value={newServices}
                    onChange={e => setNewServices(e.target.value)}
                    className="w-full text-sm px-3 py-2 border border-slate-200 rounded-lg text-slate-800"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Rotating Geographic Areas (comma-separated cities)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Mundelein, Libertyville, Waukegan, Vernon Hills"
                    value={newRegionsStr}
                    onChange={e => setNewRegionsStr(e.target.value)}
                    className="w-full text-sm px-3 py-2 border border-slate-200 rounded-lg text-slate-800"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-[#6B4BC8] hover:bg-[#5a3da8] text-white rounded-lg text-xs font-semibold disabled:opacity-50 cursor-pointer"
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus className="h-3.5 w-3.5" />
                      Create &amp; Switch to Client
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
