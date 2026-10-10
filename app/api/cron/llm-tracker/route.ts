import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

// The communities we want to test LLM visibility for
const COMMUNITIES = [
  "Lake County, IL",
  "Grayslake",
  "Waukegan",
  "Lake Villa",
  "Libertyville",
  "Vernon Hills",
  "Lake Forest",
  "Highwood",
  "Highland Park",
  "Mundelein"
];

// The core topics from the "Questions Every Parent Is Afraid to Ask" framework
const TOPICS = [
  { type: "Local", prompt: "Who is the best pediatric dentist in {location}?" },
  { type: "Emergency", prompt: "My 5-year-old just knocked out a tooth, where should I take them in {location}?" },
  { type: "QA_Guilt", prompt: "My toddler won't let me brush their teeth and I feel guilty. What should I do? Can you recommend a non-judgmental pediatric dentist near {location}?" },
  { type: "QA_Treatment", prompt: "Why treat cavities in baby teeth if they just fall out anyway? Are there any dentists in {location} who specialize in explaining this to parents?" },
  { type: "QA_Sedation", prompt: "Is general anesthesia safe for a child's dental work? Who is the best pediatric dentist in {location} that handles sedation safely?" }
];

// Helper to query OpenAI
async function queryOpenAI(prompt: string) {
  if (!process.env.OPENAI_API_KEY) return "";
  
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }]
      })
    });
    const data = await res.json();
    return data.choices?.[0]?.message?.content || "";
  } catch (e) {
    console.error("OpenAI Error:", e);
    return "";
  }
}

// Helper to query Claude
async function queryClaude(prompt: string) {
  if (!process.env.ANTHROPIC_API_KEY) return "";
  
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20240620",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }]
      })
    });
    const data = await res.json();
    return data.content?.[0]?.text || "";
  } catch (e) {
    console.error("Claude Error:", e);
    return "";
  }
}

// Helper to query Gemini
async function queryGemini(prompt: string) {
  if (!process.env.GEMINI_API_KEY) return "";
  
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  } catch (e) {
    console.error("Gemini Error:", e);
    return "";
  }
}

// Simple keyword matching for the brand
function checkBrandMention(response: string) {
  const brandKeywords = [
    "kids dds", 
    "kidsdds", 
    "kids dentist", 
    "kidsdentist.com",
    // Add specific doctor names here if desired (e.g. "dr. mike", "dr. smith")
  ];
  
  const lowerResp = response.toLowerCase();
  return brandKeywords.some(kw => lowerResp.includes(kw));
}

export async function GET(request: Request) {
  // Validate authorization (cron secret) to prevent public triggering
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // To save on API costs, we will randomly select 2 communities to test each night
  const shuffledCommunities = [...COMMUNITIES].sort(() => 0.5 - Math.random());
  const selectedCommunities = shuffledCommunities.slice(0, 2);

  const startTime = new Date();
  const runLog: any[] = [];

  let chatgptSuccesses = 0;
  let claudeSuccesses = 0;
  let geminiSuccesses = 0;
  const totalPrompts = selectedCommunities.length * TOPICS.length;

  for (const location of selectedCommunities) {
    for (const topic of TOPICS) {
      const prompt = topic.prompt.replace("{location}", location);
      
      const [gptResponse, claudeResponse, geminiResponse] = await Promise.all([
        queryOpenAI(prompt),
        queryClaude(prompt),
        queryGemini(prompt)
      ]);

      const gptMention = checkBrandMention(gptResponse);
      const claudeMention = checkBrandMention(claudeResponse);
      const geminiMention = checkBrandMention(geminiResponse);

      if (gptMention) chatgptSuccesses++;
      if (claudeMention) claudeSuccesses++;
      if (geminiMention) geminiSuccesses++;

      runLog.push({
        location,
        topic: topic.type,
        prompt,
        chatgptResponse: gptResponse,
        chatgptMentioned: gptMention,
        claudeResponse: claudeResponse,
        claudeMentioned: claudeMention,
        geminiResponse: geminiResponse,
        geminiMentioned: geminiMention
      });
    }
  }

  const endTime = new Date();
  const durationMs = endTime.getTime() - startTime.getTime();

  const chatgptScore = Math.round((chatgptSuccesses / totalPrompts) * 100);
  const claudeScore = Math.round((claudeSuccesses / totalPrompts) * 100);
  const geminiScore = Math.round((geminiSuccesses / totalPrompts) * 100);

  const dateStr = new Date().toISOString().split('T')[0];

  // Save to Firebase
  if (adminDb && adminDb.collection) {
    try {
      // 1. Save detailed log of exactly what was asked and answered
      await adminDb.collection('cron_logs').add({
        date: dateStr,
        startTime: startTime,
        endTime: endTime,
        durationMs,
        communities_tested: selectedCommunities,
        chatgpt_score: chatgptScore,
        claude_score: claudeScore,
        gemini_score: geminiScore,
        logs: runLog
      });

      // 2. Save high-level daily score snapshot for the charts
      await adminDb.collection('llm_visibility').doc(dateStr).set({
        date: dateStr,
        chatgpt_score: chatgptScore,
        claude_score: claudeScore,
        gemini_score: geminiScore,
        communities_tested: selectedCommunities,
        timestamp: new Date()
      });
    } catch (e) {
      console.error("Firebase write error:", e);
    }
  }

  return NextResponse.json({ 
    success: true, 
    date: dateStr,
    chatgptScore, 
    claudeScore,
    geminiScore,
    tested: selectedCommunities
  });
}
