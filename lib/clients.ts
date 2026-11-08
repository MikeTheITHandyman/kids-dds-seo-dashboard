import { cookies } from 'next/headers';
import { adminDb } from './firebase-admin';
import { LOCATIONS, TOPIC_TEMPLATES, PRACTICE_INFO, LocationConfig } from './ai-harness/config';

export const ACTIVE_CLIENT_COOKIE = 'seo_active_client';
export const DEFAULT_CLIENT_ID = 'kids-dentist';

export const SUPER_ADMIN_EMAILS = [
  'mike@kidsdds.com',
  'mike@miketheithandyman.com',
];

export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'ANALYST' | 'VIEWER';

export interface CustomQuestion {
  id: string;
  topic: string;
  promptTemplate: string;
  isRegional: boolean;
  enabled: boolean;
  language?: 'en' | 'es';
}

export interface ClientLeadsConfig {
  source: 'ga4_events' | 'sanity';
  selectedGa4Events: string[];
  sanityProjectId?: string;
  sanityDataset?: string;
}

export interface ClientConfig {
  id: string;
  name: string;
  shortName: string;
  subtitle: string;
  brandColor: string;
  domain: string;
  businessType: string;
  services: string;
  targetAudience: string;
  primaryLocation: string;
  homeCity: string;
  address: string;
  phoneNumbers: string[];
  strongIndicators: string[];
  brandAliases: string[];
  conflictingCities: string[];
  knownCompetitors: string[];
  ga4PropertyId: string;
  gscSiteUrl: string;
  targetKeywords: string[];
  leadsConfig: ClientLeadsConfig;
  regions: LocationConfig[];
  regionalRotationEnabled: boolean;
  currentRegionIndex: number;
  questions: CustomQuestion[];
  createdAt?: string;
  updatedAt?: string;
}

export const DEFAULT_KIDS_DENTIST_QUESTIONS: CustomQuestion[] = TOPIC_TEMPLATES.map((t, idx) => ({
  id: t.id,
  topic: t.topic,
  promptTemplate: t.explicitTemplate,
  isRegional: true,
  enabled: idx < 6, // Enable core topics by default, user can toggle any
  language: t.language || 'en',
}));

export const DEFAULT_KIDS_DENTIST_CLIENT: ClientConfig = {
  id: DEFAULT_CLIENT_ID,
  name: 'Kids Dentist',
  shortName: 'KD',
  subtitle: 'Kids Dentist • Grayslake, IL',
  brandColor: '#6B4BC8',
  domain: PRACTICE_INFO.domain,
  businessType: 'Pediatric Dentistry',
  services:
    'Preventive pediatric dentistry, dental exams & cleanings, fluoride & sealants, restorative dentistry, emergency dental care, safe sedation & nitrous oxide (laughing gas), special needs & autism-friendly dentistry, infant & toddler first dental visits, orthodontic evaluations',
  targetAudience:
    'Parents of infants, toddlers, children, and teens in Grayslake, Lake County IL, and Southern Wisconsin',
  primaryLocation: 'Grayslake, IL',
  homeCity: 'Grayslake',
  address: PRACTICE_INFO.address,
  phoneNumbers: PRACTICE_INFO.phoneNumbers,
  strongIndicators: [
    'kidsdds.com',
    '160 commerce',
    'sonia gutierrez',
    'rutcosky',
    'alrayyes',
    'anne-ashley compton',
    'gutierrez & associates',
    'gutierrez and associates',
    '(847) 223-1400',
    '847-223-1400',
    '8472231400',
  ],
  brandAliases: ['Kids Dentist', 'Kids Dental Specialists', 'Kids DDS'],
  conflictingCities: [
    'gurnee',
    'lake zurich',
    'libertyville',
    'vernon hills',
    'mundelein',
    'waukegan',
    'antioch',
    'round lake',
    'round lake beach',
    'lake villa',
    'lindenhurst',
    'mchenry',
    'buffalo grove',
    'chicago',
  ],
  knownCompetitors: [
    'Affiliated Dental Specialists',
    'Associated Dental Specialists of Long Grove',
    'Gurnee Pediatric Dentistry',
    'Growing Smiles Pediatric Dentistry',
    'Grand Smiles Pediatric Dentistry',
    'Dentistry for Kids',
    'Little Smiles Pediatric Dentistry',
    'North Suburban Pediatric Dentistry',
    'Prairie Garden Pediatric Dentistry',
    'Lake County Pediatric Dental Associates',
    'All Kids Dentistry',
    'Grand Foundation Pediatric Dentistry',
    'Dental Dog Doctors',
    'Excellence in Dentistry for Children',
    'Grayslake Orthodontics and Pediatric Dentistry',
    'Dr. Michael Scheske',
  ],
  ga4PropertyId: '554533089',
  gscSiteUrl: 'sc-domain:kidsdds.com',
  targetKeywords: ['pediatric dentist grayslake', 'kids dentist grayslake'],
  leadsConfig: {
    source: 'sanity',
    selectedGa4Events: [
      'appointment_request_submitted',
      'ask_doctor_submitted',
      'contact_form_submitted',
      'call_click',
    ],
    sanityProjectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || 'c7522jcx',
    sanityDataset: process.env.NEXT_PUBLIC_SANITY_DATASET || 'production',
  },
  regions: LOCATIONS,
  regionalRotationEnabled: true,
  currentRegionIndex: 0,
  questions: DEFAULT_KIDS_DENTIST_QUESTIONS,
};

export function isSuperAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return SUPER_ADMIN_EMAILS.includes(email.toLowerCase().trim());
}

/**
 * Recursively strips any `undefined` values so Firestore never throws on document writes.
 */
function stripUndefined<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export function normalizeClientConfig(raw: Partial<ClientConfig>, idFallback?: string): ClientConfig {
  const isKidsDentist = (raw.id || idFallback) === DEFAULT_CLIENT_ID;
  const base: ClientConfig = isKidsDentist ? DEFAULT_KIDS_DENTIST_CLIENT : {
    id: raw.id || idFallback || 'client',
    name: raw.name || 'New Client',
    shortName: raw.shortName || (raw.name ? raw.name.slice(0, 2).toUpperCase() : 'CL'),
    subtitle: raw.subtitle || `${raw.name || 'Client'} • ${raw.primaryLocation || ''}`.replace(/ • $/, ''),
    brandColor: raw.brandColor || '#6B4BC8',
    domain: raw.domain || '',
    businessType: raw.businessType || '',
    services: raw.services || '',
    targetAudience: raw.targetAudience || '',
    primaryLocation: raw.primaryLocation || '',
    homeCity: raw.homeCity || (raw.primaryLocation ? raw.primaryLocation.split(',')[0].trim() : ''),
    address: raw.address || '',
    phoneNumbers: [],
    strongIndicators: [],
    brandAliases: raw.name ? [raw.name] : [],
    conflictingCities: [],
    knownCompetitors: [],
    ga4PropertyId: '',
    gscSiteUrl: '',
    targetKeywords: [],
    leadsConfig: {
      source: 'ga4_events',
      selectedGa4Events: [],
      sanityProjectId: '',
      sanityDataset: '',
    },
    regions: [],
    regionalRotationEnabled: true,
    currentRegionIndex: 0,
    questions: [],
  };

  const normalized: ClientConfig = {
    ...base,
    ...raw,
    id: raw.id || idFallback || base.id,
    shortName:
      raw.shortName ||
      base.shortName ||
      (raw.name ? raw.name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() : 'CL'),
    subtitle:
      raw.subtitle ||
      (raw.name && raw.primaryLocation ? `${raw.name} • ${raw.primaryLocation}` : base.subtitle),
    homeCity:
      raw.homeCity ||
      (raw.primaryLocation ? raw.primaryLocation.split(',')[0].trim() : base.homeCity),
    phoneNumbers: Array.isArray(raw.phoneNumbers) ? raw.phoneNumbers : base.phoneNumbers,
    strongIndicators: Array.isArray(raw.strongIndicators) ? raw.strongIndicators : base.strongIndicators,
    brandAliases: Array.isArray(raw.brandAliases) ? raw.brandAliases : base.brandAliases,
    conflictingCities: Array.isArray(raw.conflictingCities) ? raw.conflictingCities : base.conflictingCities,
    knownCompetitors: Array.isArray(raw.knownCompetitors) ? raw.knownCompetitors : base.knownCompetitors,
    targetKeywords: Array.isArray(raw.targetKeywords) ? raw.targetKeywords : base.targetKeywords,
    leadsConfig: {
      source: raw.leadsConfig?.source || base.leadsConfig.source,
      selectedGa4Events: Array.isArray(raw.leadsConfig?.selectedGa4Events)
        ? raw.leadsConfig!.selectedGa4Events
        : base.leadsConfig.selectedGa4Events,
      sanityProjectId: raw.leadsConfig?.sanityProjectId ?? base.leadsConfig.sanityProjectId ?? '',
      sanityDataset: raw.leadsConfig?.sanityDataset ?? base.leadsConfig.sanityDataset ?? '',
    },
    regions: Array.isArray(raw.regions) && (raw.regions.length > 0 || !isKidsDentist) ? raw.regions : base.regions,
    regionalRotationEnabled:
      typeof raw.regionalRotationEnabled === 'boolean'
        ? raw.regionalRotationEnabled
        : base.regionalRotationEnabled,
    currentRegionIndex:
      typeof raw.currentRegionIndex === 'number' ? raw.currentRegionIndex : base.currentRegionIndex,
    questions:
      Array.isArray(raw.questions) && (raw.questions.length > 0 || !isKidsDentist)
        ? raw.questions.map(q => ({ ...q, language: q.language || 'en' }))
        : base.questions,
  };

  return stripUndefined(normalized);
}

/**
 * Fetches all clients from Firestore `clients` collection, ensuring `kids-dentist` always exists.
 */
export async function getAllClients(): Promise<ClientConfig[]> {
  if (!adminDb || !adminDb.collection) {
    return [DEFAULT_KIDS_DENTIST_CLIENT];
  }

  try {
    const snap = await adminDb.collection('clients').get();
    const clientsMap = new Map<string, ClientConfig>();

    snap.docs.forEach((doc: any) => {
      const data = doc.data() as Partial<ClientConfig>;
      const normalized = normalizeClientConfig(data, doc.id);
      clientsMap.set(normalized.id, normalized);
    });

    if (!clientsMap.has(DEFAULT_CLIENT_ID)) {
      const seeded = stripUndefined({
        ...DEFAULT_KIDS_DENTIST_CLIENT,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await adminDb.collection('clients').doc(DEFAULT_CLIENT_ID).set(seeded, { merge: true }).catch(() => {});
      clientsMap.set(DEFAULT_CLIENT_ID, seeded);
    }

    return Array.from(clientsMap.values()).sort((a, b) => {
      if (a.id === DEFAULT_CLIENT_ID) return -1;
      if (b.id === DEFAULT_CLIENT_ID) return 1;
      return a.name.localeCompare(b.name);
    });
  } catch (e) {
    console.error('Error loading clients from Firestore:', e);
    return [DEFAULT_KIDS_DENTIST_CLIENT];
  }
}

export async function getClientConfig(clientId?: string | null): Promise<ClientConfig> {
  const targetId = clientId || DEFAULT_CLIENT_ID;
  if (!adminDb || !adminDb.collection) {
    return DEFAULT_KIDS_DENTIST_CLIENT;
  }

  try {
    const doc = await adminDb.collection('clients').doc(targetId).get();
    if (doc.exists) {
      return normalizeClientConfig(doc.data() as Partial<ClientConfig>, doc.id);
    }
    if (targetId === DEFAULT_CLIENT_ID) {
      const seeded = stripUndefined({
        ...DEFAULT_KIDS_DENTIST_CLIENT,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await adminDb
        .collection('clients')
        .doc(DEFAULT_CLIENT_ID)
        .set(seeded, { merge: true })
        .catch(() => {});
      return DEFAULT_KIDS_DENTIST_CLIENT;
    }
  } catch (e) {
    console.error(`Error fetching client ${targetId}:`, e);
  }

  return DEFAULT_KIDS_DENTIST_CLIENT;
}

export async function saveClientConfig(
  clientId: string,
  updates: Partial<ClientConfig>
): Promise<ClientConfig> {
  let existing: Partial<ClientConfig> = { id: clientId };
  if (adminDb && adminDb.collection) {
    const doc = await adminDb.collection('clients').doc(clientId).get();
    if (doc.exists) {
      existing = doc.data() as Partial<ClientConfig>;
    } else if (clientId === DEFAULT_CLIENT_ID) {
      existing = DEFAULT_KIDS_DENTIST_CLIENT;
    }
  }

  const merged = normalizeClientConfig(
    {
      ...existing,
      ...updates,
      id: clientId,
      updatedAt: new Date().toISOString(),
    },
    clientId
  );

  if (adminDb && adminDb.collection) {
    await adminDb.collection('clients').doc(clientId).set(merged, { merge: true });
  }
  return merged;
}

/**
 * Resolves the currently active client for a server component or API route based on cookie / query param.
 */
export async function getActiveClientId(explicitClientId?: string | null): Promise<string> {
  if (explicitClientId && explicitClientId.trim()) {
    return explicitClientId.trim();
  }
  try {
    const cookieStore = await cookies();
    const fromCookie = cookieStore.get(ACTIVE_CLIENT_COOKIE)?.value;
    if (fromCookie && fromCookie.trim()) {
      return fromCookie.trim();
    }
  } catch {
    // cookies() may throw outside request context
  }
  return DEFAULT_CLIENT_ID;
}

export async function getActiveClientConfig(explicitClientId?: string | null): Promise<ClientConfig> {
  const clientId = await getActiveClientId(explicitClientId);
  return getClientConfig(clientId);
}

/**
 * Helper to return client-scoped Firestore document IDs while keeping `kids-dentist`
 * 100% backwards-compatible with existing Firestore document names.
 */
export function getScopedDocId(baseDocId: string, clientId: string): string {
  if (!clientId || clientId === DEFAULT_CLIENT_ID) {
    return baseDocId;
  }
  return `${clientId}__${baseDocId}`;
}
