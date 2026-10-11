// Citation and Competitor Extraction Engine

export interface CitationAnalysis {
  kidsddsCited: boolean;
  citedDomains: string[];
  citedUrls: string[];
  competitors: string[]; // List of extracted competitor practice names
}

// Extracts domain from URL (e.g. "https://www.yelp.com/biz/..." -> "yelp.com")
export function extractDomain(url: string): string | null {
  try {
    let cleanUrl = url.trim();
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = 'https://' + cleanUrl;
    }
    const hostname = new URL(cleanUrl).hostname.toLowerCase();
    return hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

// Known common directories or generic platforms to distinguish from direct clinic websites
export const DIRECTORY_DOMAINS = new Set([
  'yelp.com',
  'healthgrades.com',
  'zocdoc.com',
  'aapd.org',
  'google.com',
  'mapquest.com',
  'yellowpages.com',
  'facebook.com',
  'instagram.com',
  'usnews.com',
  'vitals.com',
  'bbb.org'
]);

// Common Lake County / regional competitors for verification and extraction
const KNOWN_COMPETITORS = [
  "Affiliated Dental Specialists",
  "Associated Dental Specialists of Long Grove",
  "Gurnee Pediatric Dentistry",
  "Growing Smiles Pediatric Dentistry",
  "Grand Smiles Pediatric Dentistry",
  "Dentistry for Kids",
  "Little Smiles Pediatric Dentistry",
  "North Suburban Pediatric Dentistry",
  "Prairie Garden Pediatric Dentistry",
  "Lake County Pediatric Dental Associates",
  "All Kids Dentistry",
  "Grand Foundation Pediatric Dentistry",
  "Dental Dog Doctors",
  "Excellence in Dentistry for Children",
  "Grayslake Orthodontics and Pediatric Dentistry",
  "Dr. Michael Scheske"
];

export function analyzeCitations(
  responseText: string,
  rawCitationUrls: string[] = []
): CitationAnalysis {
  const urlRegex = /(https?:\/\/[^\s\)"'<>\]]+)/gi;
  const inlineUrls: string[] = [];
  let match: RegExpExecArray | null;

  if (responseText) {
    while ((match = urlRegex.exec(responseText)) !== null) {
      inlineUrls.push(match[1]);
    }
  }

  // Combine raw citations (from grounding metadata) with any inline URLs
  const allUrls = Array.from(new Set([...rawCitationUrls, ...inlineUrls]));
  const domainsSet = new Set<string>();

  for (const url of allUrls) {
    const domain = extractDomain(url);
    if (domain) domainsSet.add(domain);
  }

  const citedDomains = Array.from(domainsSet);
  const kidsddsCited = citedDomains.some(d => d.includes('kidsdds.com'));

  // Competitor extraction from response text
  const extractedCompetitors: string[] = [];
  const textLower = (responseText || '').toLowerCase();

  for (const comp of KNOWN_COMPETITORS) {
    if (textLower.includes(comp.toLowerCase())) {
      extractedCompetitors.push(comp);
    }
  }

  // Also parse numbered/bulleted list titles if present
  const lines = (responseText || '').split(/\r?\n/);
  for (const line of lines) {
    const listMatch = line.match(/^(?:(?:\d+[.)])|[-*•#+])\s+\*\*([^*]+)\*\*/);
    if (listMatch) {
      const candidateName = listMatch[1].trim();
      if (
        candidateName.length > 3 &&
        candidateName.length < 50 &&
        !candidateName.toLowerCase().includes('kids dentist') &&
        !candidateName.toLowerCase().includes('kids dds') &&
        !extractedCompetitors.includes(candidateName)
      ) {
        extractedCompetitors.push(candidateName);
      }
    }
  }

  return {
    kidsddsCited,
    citedDomains,
    citedUrls: allUrls,
    competitors: Array.from(new Set(extractedCompetitors))
  };
}

// Classifier to detect AI refusals ("I don't have access to real-time information", etc.)
export function classifyRefusal(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  
  const refusalPhrases = [
    "i don't have access to real-time",
    "i do not have access to real-time",
    "i don't have access to current",
    "i do not have access to current",
    "as an ai language model",
    "i cannot provide specific clinic recommendations",
    "i'm unable to provide specific real-time",
    "i cannot browse the live web",
    "i cannot verify current local business",
    "please check google reviews or yelp"
  ];

  // If text is short and contains refusal phrase, or opens with one
  return refusalPhrases.some(phrase => lower.includes(phrase));
}
