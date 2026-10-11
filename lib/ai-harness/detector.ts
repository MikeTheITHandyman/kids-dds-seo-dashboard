// Deterministic Brand Mention Detector (No LLM Judge)

export type MentionClass = 'STRONG' | 'WEAK' | 'COLLISION' | 'NONE';

export interface DetectionResult {
  mentionClass: MentionClass;
  isMentioned: boolean; // true for STRONG and WEAK only
  evidenceSnippet: string | null;
  listPosition: number | null; // 1-indexed rank if in a list, null otherwise
}

const STRONG_INDICATORS = [
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

// Conflicting Lake County / surrounding towns that indicate another practice
const CONFLICTING_CITIES = [
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

export function detectBrandMention(responseText: string): DetectionResult {
  if (!responseText || typeof responseText !== 'string') {
    return {
      mentionClass: 'NONE',
      isMentioned: false,
      evidenceSnippet: null,
      listPosition: null
    };
  }

  const textLower = responseText.toLowerCase();

  // 1. Check STRONG Indicators
  for (const indicator of STRONG_INDICATORS) {
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
  // Look for paragraphs or list items containing "Kids Dentist"
  const paragraphs = responseText.split(/(?:\r?\n\s*\r?\n)|(?:\r?\n(?=[-*\d•]))/);

  for (const para of paragraphs) {
    const paraLower = para.toLowerCase();
    const hasKidsDentist = paraLower.includes("kids dentist") || paraLower.includes("kids dental");

    if (hasKidsDentist) {
      const hasGrayslake = paraLower.includes("grayslake");

      // Check if another city is explicitly linked to "Kids Dentist" (e.g. "Kids Dentist in Gurnee" or "Kids Dentist, PC - Situated in Gurnee")
      const mentionsConflictingCity = CONFLICTING_CITIES.some(city => {
        if (!paraLower.includes(city)) return false;
        // If it also mentions Grayslake, verify whether Grayslake is the home city of the practice
        if (hasGrayslake) {
          // If Grayslake is mentioned right by Kids Dentist (e.g., "Kids Dentist in Grayslake, serving Gurnee"), allow WEAK
          const kdIdx = paraLower.indexOf("kids dentist");
          const grayIdx = paraLower.indexOf("grayslake");
          const otherIdx = paraLower.indexOf(city);
          return Math.abs(kdIdx - otherIdx) < Math.abs(kdIdx - grayIdx) && city !== "grayslake";
        }
        return true;
      });

      if (hasGrayslake && !mentionsConflictingCity) {
        const kdIdx = paraLower.indexOf("kids dentist") !== -1 ? paraLower.indexOf("kids dentist") : paraLower.indexOf("kids dental");
        const start = Math.max(0, kdIdx - 30);
        const end = Math.min(para.length, kdIdx + 70);
        const snippet = para.substring(start, end).replace(/\s+/g, ' ').trim();
        const pos = extractListPosition(responseText, "kids dentist");

        return {
          mentionClass: 'WEAK',
          isMentioned: true,
          evidenceSnippet: snippet,
          listPosition: pos
        };
      }

      // If "Kids Dentist" is associated with a different city or lacks Grayslake context -> COLLISION
      const kdIdx = paraLower.indexOf("kids dentist") !== -1 ? paraLower.indexOf("kids dentist") : paraLower.indexOf("kids dental");
      const start = Math.max(0, kdIdx - 30);
      const end = Math.min(para.length, kdIdx + 70);
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
