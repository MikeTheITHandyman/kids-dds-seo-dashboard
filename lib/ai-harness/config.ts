// AI Visibility Test Harness Configuration

export interface LocationConfig {
  name: string;
  state: string; // 'IL' | 'WI' | 'Regional'
  tier: 'primary' | 'secondary' | 'regional';
}

export const LOCATIONS: LocationConfig[] = [
  // Primary cities (Lake County, IL)
  { name: "Grayslake", state: "IL", tier: "primary" },
  { name: "Round Lake Beach", state: "IL", tier: "primary" },
  { name: "Lake Villa", state: "IL", tier: "primary" },
  { name: "Waukegan", state: "IL", tier: "primary" },
  { name: "Gurnee", state: "IL", tier: "primary" },
  { name: "Mundelein", state: "IL", tier: "primary" },
  { name: "Antioch", state: "IL", tier: "primary" },
  { name: "Libertyville", state: "IL", tier: "primary" },
  { name: "Round Lake", state: "IL", tier: "primary" },
  { name: "Lindenhurst", state: "IL", tier: "primary" },
  { name: "McHenry", state: "IL", tier: "primary" },

  // Secondary market (Southern Wisconsin & Border)
  { name: "Kenosha", state: "WI", tier: "secondary" },
  { name: "Trevor", state: "WI", tier: "secondary" },
  { name: "Twin Lakes", state: "WI", tier: "secondary" },

  // Regional markets
  { name: "Lake County, IL", state: "IL", tier: "regional" },
  { name: "Southern Wisconsin", state: "WI", tier: "regional" }
];

export interface TopicTemplate {
  id: string;
  topic: string;
  language: 'en' | 'es';
  naturalTemplate: string;
  explicitTemplate: string;
}

export const TOPIC_TEMPLATES: TopicTemplate[] = [
  {
    id: "local_general",
    topic: "Local General",
    language: "en",
    naturalTemplate: "Who is the best pediatric dentist in {location}?",
    explicitTemplate: "What are some reputable, highly recommended pediatric dental practices serving families in {location}? Please list specific clinics and dentists."
  },
  {
    id: "emergency",
    topic: "Emergency",
    language: "en",
    naturalTemplate: "Where should I take my child for emergency dental care near {location} if they chipped or knocked out a tooth?",
    explicitTemplate: "If a child has a dental emergency in or near {location}, what pediatric dental offices should parents contact? Please name specific clinics."
  },
  {
    id: "sedation",
    topic: "Sedation",
    language: "en",
    naturalTemplate: "What dentists offer safe sedation or laughing gas for kids in {location}?",
    explicitTemplate: "What pediatric dental practices in or near {location} offer safe sedation, general anesthesia, or nitrous oxide for anxious children? Please list specific clinics."
  },
  {
    id: "special_needs",
    topic: "Special Needs",
    language: "en",
    naturalTemplate: "Can you recommend an autism-friendly or special needs pediatric dentist near {location}?",
    explicitTemplate: "Which pediatric dental offices near {location} specialize in treating children with special healthcare needs, sensory sensitivities, or autism? Please provide practice names."
  },
  {
    id: "toddler_care",
    topic: "Anxious / Toddler Care",
    language: "en",
    naturalTemplate: "Which pediatric dentists near {location} are known for gentle, patient, and non-judgmental care for toddlers?",
    explicitTemplate: "Which pediatric dental clinics in or near {location} specialize in low-stress visits for toddlers and anxious kids? Please name specific practices."
  },
  {
    id: "first_visit",
    topic: "First Visit / Age 1",
    language: "en",
    naturalTemplate: "Who are the top rated pediatric dentists for a baby's first dental visit near {location}?",
    explicitTemplate: "What pediatric dental offices in {location} are best suited for an infant or 1-year-old first dental checkup? Please name clinics."
  },
  {
    id: "insurance",
    topic: "Insurance / Delta Dental",
    language: "en",
    naturalTemplate: "Which pediatric dentist near {location} accepts Delta Dental insurance?",
    explicitTemplate: "Can you list reputable pediatric dental clinics near {location} that accept major dental insurance like Delta Dental? Please name specific practices."
  },
  {
    id: "spanish_general",
    topic: "Spanish Local General",
    language: "es",
    naturalTemplate: "¿Cuál es el mejor dentista pediátrico en {location} para niños?",
    explicitTemplate: "¿Cuáles son algunas clínicas dentales para niños altamente recomendadas en {location}? Por favor mencione nombres específicos de dentistas y clínicas."
  }
];

// Resolves proper location query text, preventing bugs like "Lake County, IL, IL"
export function formatLocationString(loc: LocationConfig): string {
  const name = loc.name.trim();
  if (name.includes(", IL") || name.includes(", WI") || name.toLowerCase().includes("wisconsin")) {
    return name;
  }
  return `${name}, ${loc.state}`;
}

// Business Entity Ground Truth Matchers
export const PRACTICE_INFO = {
  name: "Kids Dentist - Sonia Gutierrez & Associates",
  brandAliases: ["Kids Dentist", "Kids Dental Specialists", "Kids DDS"],
  address: "160 Commerce Dr #100, Grayslake, IL 60030",
  addressSnippet: "160 Commerce",
  phoneNumbers: ["(847) 223-1400", "847-223-1400", "8472231400"],
  domain: "kidsdds.com",
  doctors: [
    { firstName: "Sonia", lastName: "Gutierrez", title: "DDS" },
    { firstName: "Dave", lastName: "Rutcosky", title: "DDS" },
    { firstName: "Sahar", lastName: "Alrayyes", title: "DDS" },
    { firstName: "Anne-Ashley", lastName: "Compton", title: "DDS" }
  ]
};
