// Deterministic Brand Mention Detector (No LLM Judge)
import type { ClientConfig } from '@/lib/clients';

export type MentionClass = 'STRONG' | 'WEAK' | 'COLLISION' | 'NONE';

export interface DetectionResult {
  mentionClass: MentionClass;
  isMentioned: boolean; // true for STRONG and WEAK only
  evidenceSnippet: string | null;
  listPosition: number | null; // 1-indexed rank if in a list, null otherwise
}

export interface DetectorOptions {
  strongIndicators?: string[];
  brandAliases?: string[];
  homeCity?: string;
  conflictingCities?: string[];
}

const DEFAULT_STRONG_INDICATORS = [
  "kidsdds.com",
  "160 commerce",
  "sonia gutierrez",
  "rutcosky",
  "alrayyes",
  "anne-ashley compton",
  "gutierrez & associates",
  "gutierrez and associates",
  "(847) 223-1400",
  "847-223-1400",
  "8472231400"
];

const DEFAULT_BRAND_ALIASES = [
  "kids dentist",
  "kids dental"
];

// Conflicting Lake County / surrounding towns that indicate another practice
const DEFAULT_CONFLICTING_CITIES = [
  "gurnee",
  "lake zurich",
  "libertyville",
  "vernon hills",
  "mundelein",
  "waukegan",
  "antioch",
  "round lake",
  "round lake beach",
  "lake villa",
  "lindenhurst",
  "mchenry",
  "buffalo grove",
  "chicago"
];

// Helper to determine which item index in a list contains the practice
export function extractListPosition(fullText: string, targetSnippet: string): number | null {
  if (!fullText || !targetSnippet) return null;

  // Split into lines or bullet points
  const lines = fullText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  let itemCounter = 0;
  const targetLower = targetSnippet.toLowerCase();

  for (const line of lines) {
    // Check if line looks like a list item (e.g. "1.", "1)", "*", "-", "•")
    const isListItem = /^(?:(?:\d+[.)])|[-*•#+])\s+/.test(line);
    if (isListItem) {
      itemCounter++;
      if (line.toLowerCase().includes(targetLower)) {
        return itemCounter;
      }
    } else if (itemCounter > 0 && line.toLowerCase().includes(targetLower)) {
      // Sub-bullet or continuation of the current item
      return itemCounter;
    }
  }

  return itemCounter > 0 ? null : null;
}

export function detectBrandMention(
  responseText: string,
  client?: Partial<ClientConfig> | DetectorOptions
): DetectionResult {
  if (!responseText || typeof responseText !== 'string') {
    return {
      mentionClass: 'NONE',
      isMentioned: false,
      evidenceSnippet: null,
      listPosition: null
    };
  }

  const textLower = responseText.toLowerCase();

  const strongIndicators = (
    client?.strongIndicators && client.strongIndicators.length > 0
      ? client.strongIndicators
      : DEFAULT_STRONG_INDICATORS
  ).map(s => s.toLowerCase().trim()).filter(Boolean);

  const brandAliases = (
    client?.brandAliases && client.brandAliases.length > 0
      ? client.brandAliases
      : DEFAULT_BRAND_ALIASES
  ).map(s => s.toLowerCase().trim()).filter(Boolean);

  // Also ensure "kids dental" is checked if "kids dentist" is in aliases
  if (brandAliases.includes('kids dentist') && !brandAliases.includes('kids dental')) {
    brandAliases.push('kids dental');
  }

  const homeCity = (client?.homeCity || 'grayslake').toLowerCase().trim();

  const conflictingCities = (
    client?.conflictingCities && client.conflictingCities.length > 0
      ? client.conflictingCities
      : (homeCity === 'grayslake' ? DEFAULT_CONFLICTING_CITIES : [])
  ).map(c => c.toLowerCase().trim()).filter(Boolean);

  // 1. Check STRONG Indicators
  for (const indicator of strongIndicators) {
    const idx = textLower.indexOf(indicator);
    if (idx !== -1) {
      // Extract surrounding evidence snippet (~100 chars)
      const start = Math.max(0, idx - 40);
      const end = Math.min(responseText.length, idx + indicator.length + 50);
      const snippet = responseText.substring(start, end).replace(/\s+/g, ' ').trim();
      const pos = extractListPosition(responseText, indicator);

      return {
        mentionClass: 'STRONG',
        isMentioned: true,
        evidenceSnippet: snippet,
        listPosition: pos
      };
    }
  }

  // 2. Check WEAK vs NAME_COLLISION
  const paragraphs = responseText.split(/(?:\r?\n\s*\r?\n)|(?:\r?\n(?=[-*\d•]))/);

  for (const para of paragraphs) {
    const paraLower = para.toLowerCase();
    const matchedAlias = brandAliases.find(alias => paraLower.includes(alias));

    if (matchedAlias) {
      const hasHomeCity = homeCity ? paraLower.includes(homeCity) : true;

      // Check if another city is explicitly linked to the brand alias
      const mentionsConflictingCity = conflictingCities.some(city => {
        if (!paraLower.includes(city)) return false;
        if (hasHomeCity && homeCity) {
          const aliasIdx = paraLower.indexOf(matchedAlias);
          const homeIdx = paraLower.indexOf(homeCity);
          const otherIdx = paraLower.indexOf(city);
          return Math.abs(aliasIdx - otherIdx) < Math.abs(aliasIdx - homeIdx) && city !== homeCity;
        }
        return true;
      });

      if (hasHomeCity && !mentionsConflictingCity) {
        const aliasIdx = paraLower.indexOf(matchedAlias);
        const start = Math.max(0, aliasIdx - 30);
        const end = Math.min(para.length, aliasIdx + 70);
        const snippet = para.substring(start, end).replace(/\s+/g, ' ').trim();
        const pos = extractListPosition(responseText, matchedAlias);

        return {
          mentionClass: 'WEAK',
          isMentioned: true,
          evidenceSnippet: snippet,
          listPosition: pos
        };
      }

      // If brand alias is associated with a different city or lacks home city context -> COLLISION
      const aliasIdx = paraLower.indexOf(matchedAlias);
      const start = Math.max(0, aliasIdx - 30);
      const end = Math.min(para.length, aliasIdx + 70);
      const snippet = para.substring(start, end).replace(/\s+/g, ' ').trim();

      return {
        mentionClass: 'COLLISION',
        isMentioned: false,
        evidenceSnippet: snippet,
        listPosition: null
      };
    }
  }

  // 3. Neither STRONG nor WEAK found
  return {
    mentionClass: 'NONE',
    isMentioned: false,
    evidenceSnippet: null,
    listPosition: null
  };
}
