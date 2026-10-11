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

// The core topics engineered to bypass AI refusal guardrails and elicit specific local practice names
const TOPICS = [
  { 
    type: "Local", 
    prompt: "What are some reputable, highly recommended pediatric dental practices serving families in or near {location}, IL? Please list specific clinics and pediatric dentists in Lake County." 
  },
  { 
    type: "Emergency", 
    prompt: "If a child in or near {location}, IL has a dental emergency (like a knocked out tooth), what pediatric dental offices in the area should parents contact? Please name specific clinics." 
  },
  { 
    type: "QA_Guilt", 
    prompt: "Which pediatric dental offices near {location}, IL are known for gentle, non-judgmental, and compassionate care for toddlers? Please provide specific practice names." 
  },
  { 
    type: "QA_Treatment", 
    prompt: "Can you recommend pediatric dentists near {location}, IL that specialize in children's preventative care and cavity treatments? Please name specific practices." 
  },
  { 
    type: "QA_Sedation", 
    prompt: "What pediatric dental practices in or near {location}, IL offer safe sedation or gentle dental care for anxious kids? Please list specific clinics." 
  }
];

// Model fallback lists
const OPENAI_MODELS = [
  process.env.OPENAI_MODEL,
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4-turbo"
].filter(Boolean) as string[];

const CLAUDE_MODELS = [
  process.env.ANTHROPIC_MODEL,
  "claude-3-5-sonnet-20241022",
  "claude-3-5-sonnet-latest",
  "claude-3-5-haiku-20241022",
  "claude-3-5-haiku-latest",
  "claude-3-haiku-20240307"
].filter(Boolean) as string[];

const GEMINI_MODELS = [
  process.env.GEMINI_MODEL,
  "gemini-3.8-flash",
  "gemini-flash-latest",
  "gemini-2.5-flash",
  "gemini-2.0-flash"
].filter(Boolean) as string[];

// Helper to query OpenAI with automatic model fallbacks
async function queryOpenAI(prompt: string) {
  if (!process.env.OPENAI_API_KEY) return "[ERROR: Missing OPENAI_API_KEY in Netlify]";
  
  let lastError = "";
  for (const model of OPENAI_MODELS) {
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model,
          max_tokens: 350,
          messages: [{ role: "user", content: prompt }]
        }),
        signal: AbortSignal.timeout(9000)
      });
      const data = await res.json();
      if (data.choices?.[0]?.message?.content) {
        return data.choices[0].message.content;
      }
      if (data.error) {
        lastError = `[API ERROR (${model}): ${data.error.message || JSON.stringify(data.error)}]`;
        if (data.error.code === 'insufficient_quota' || data.error.type === 'insufficient_quota') {
          return lastError;
        }
      }
    } catch (e: any) {
      lastError = `[FETCH ERROR (${model}): ${e.message}]`;
    }
  }
  return lastError || "[ERROR: All OpenAI models failed]";
}

// Helper to query Claude with automatic model fallbacks
async function queryClaude(prompt: string) {
  if (!process.env.ANTHROPIC_API_KEY) return "[ERROR: Missing ANTHROPIC_API_KEY in Netlify]";
  
  let primaryError = "";
  for (let i = 0; i < CLAUDE_MODELS.length; i++) {
    const model = CLAUDE_MODELS[i];
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model,
          max_tokens: 350,
          messages: [{ role: "user", content: prompt }]
        }),
        signal: AbortSignal.timeout(9000)
      });
      const data = await res.json();
      if (data.content?.[0]?.text) {
        return data.content[0].text;
      }
      if (data.error) {
        const msg = data.error.message || JSON.stringify(data.error);
        const errStr = `[API ERROR (${model}): ${msg}]`;
        if (i === 0) primaryError = errStr;
        
        // If it's a balance, credit, billing, or permission issue, fallbacks will also fail
        const lower = msg.toLowerCase();
        if (
          lower.includes('credit') ||
          lower.includes('balance') ||
          lower.includes('billing') ||
          data.error.type === 'authentication_error' ||
          data.error.type === 'permission_error'
        ) {
          return errStr;
        }
      }
    } catch (e: any) {
      if (i === 0) primaryError = `[FETCH ERROR (${model}): ${e.message}]`;
    }
  }
  return primaryError || "[ERROR: All Claude models failed]";
}

// Helper to query Gemini with automatic model fallbacks and optional rate-limit delay
async function queryGemini(prompt: string, delayMs: number = 0) {
  if (!process.env.GEMINI_API_KEY) return "[ERROR: Missing GEMINI_API_KEY in Netlify]";
  if (delayMs > 0) await new Promise(r => setTimeout(r, delayMs));

  let primaryError = "";
  for (let i = 0; i < GEMINI_MODELS.length; i++) {
    const model = GEMINI_MODELS[i];
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 350 }
        }),
        signal: AbortSignal.timeout(9000)
      });
      const data = await res.json();
      if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
        return data.candidates[0].content.parts[0].text;
      }
      if (data.error) {
        const msg = data.error.message || JSON.stringify(data.error);
        const errStr = `[API ERROR (${model}): ${msg}]`;
        if (i === 0) primaryError = errStr;

        // If it's a rate limit 429, fallbacks won't help
        if (data.error.code === 429 || msg.toLowerCase().includes('quota')) {
          return errStr;
        }
      }
    } catch (e: any) {
      if (i === 0) primaryError = `[FETCH ERROR (${model}): ${e.message}]`;
    }
  }
  return primaryError || "[ERROR: All Gemini models failed]";
}

// Simple keyword matching for the brand, practice, and doctors
function checkBrandMention(response: string) {
  const brandKeywords = [
    "kids dds", 
    "kidsdds", 
    "kids dentist", 
    "kidsdentist.com",
    "kidsdds.com",
    "dr. sonia",
    "dr. gutierrez",
    "dr. dave",
    "dr. rutcosky",
    "dr. sahar",
    "dr. alrayyes",
    "dr. compton",
    "dr. kim",
    "160 commerce",
    "commerce dr"
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

  // To save on API costs and stay strictly within Gemini's free tier (5 RPM), test 1 community each night
  const shuffledCommunities = [...COMMUNITIES].sort(() => 0.5 - Math.random());
  const selectedCommunities = shuffledCommunities.slice(0, 1);

  const startTime = new Date();
  const runLog: any[] = [];

  let chatgptSuccesses = 0;
  let claudeSuccesses = 0;
  let geminiSuccesses = 0;
  const totalPrompts = selectedCommunities.length * TOPICS.length;

  // Create tasks for all community + topic combinations
  const tasks: { location: string; topic: string; prompt: string }[] = [];
  for (const location of selectedCommunities) {
    for (const topic of TOPICS) {
      tasks.push({
        location,
        topic: topic.type,
        prompt: topic.prompt.replace("{location}", location)
      });
    }
  }

  // Execute all prompts concurrently (Gemini calls are staggered by 1s to prevent free-tier 429 limits)
  const results = await Promise.all(
    tasks.map(async (task, idx) => {
      const [gptResponse, claudeResponse, geminiResponse] = await Promise.all([
        queryOpenAI(task.prompt),
        queryClaude(task.prompt),
        queryGemini(task.prompt, idx * 1000)
      ]);

      const gptMention = checkBrandMention(gptResponse);
      const claudeMention = checkBrandMention(claudeResponse);
      const geminiMention = checkBrandMention(geminiResponse);

      return {
        location: task.location,
        topic: task.topic,
        prompt: task.prompt,
        chatgptResponse: gptResponse,
        chatgptMentioned: gptMention,
        claudeResponse: claudeResponse,
        claudeMentioned: claudeMention,
        geminiResponse: geminiResponse,
        geminiMentioned: geminiMention
      };
    })
  );

  for (const r of results) {
    if (r.chatgptMentioned) chatgptSuccesses++;
    if (r.claudeMentioned) claudeSuccesses++;
    if (r.geminiMentioned) geminiSuccesses++;
    runLog.push(r);
  }

  const endTime = new Date();
  const durationMs = endTime.getTime() - startTime.getTime();

  const chatgptScore = Math.round((chatgptSuccesses / totalPrompts) * 100);
  const claudeScore = Math.round((claudeSuccesses / totalPrompts) * 100);
  const geminiScore = Math.round((geminiSuccesses / totalPrompts) * 100);

  const dateStr = new Date().toISOString().split('T')[0];

  // Detect critical issues across all responses
  const criticalErrors: string[] = [];
  for (const r of runLog) {
    [
      { name: 'ChatGPT', resp: r.chatgptResponse },
      { name: 'Claude', resp: r.claudeResponse },
      { name: 'Gemini', resp: r.geminiResponse }
    ].forEach(({ name, resp }) => {
      if (typeof resp === 'string' && resp.startsWith('[')) {
        const lower = resp.toLowerCase();
        if (
          lower.includes('quota') ||
          lower.includes('credit') ||
          lower.includes('balance') ||
          lower.includes('billing') ||
          lower.includes('not found') ||
          lower.includes('no longer available') ||
          lower.includes('deprecated') ||
          lower.includes('unauthorized') ||
          lower.includes('authentication') ||
          lower.includes('permission') ||
          lower.includes('missing')
        ) {
          let cleanMsg = resp.replace(/^\[(API|FETCH|ERROR)[^:]*:\s*/i, '').replace(/\]$/, '');
          // Strip out dynamic timestamps and verbose URLs so all 5 prompts collapse into a single clean message
          if (cleanMsg.includes('For more information')) {
            cleanMsg = cleanMsg.split('. For more information')[0];
          }
          if (cleanMsg.toLowerCase().includes('quota exceeded')) {
            cleanMsg = 'Daily rate limit / quota exceeded on current plan.';
          }
          const clean = `${name}: ${cleanMsg.trim()}`;
          if (!criticalErrors.includes(clean)) {
            criticalErrors.push(clean);
          }
        }
      }
    });
  }

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
        criticalErrors,
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

      // 3. Update system_alerts document for prominent UI warning banner
      if (criticalErrors.length > 0) {
        await adminDb.collection('system_alerts').doc('latest_cron_alert').set({
          date: dateStr,
          timestamp: new Date(),
          resolved: false,
          issues: criticalErrors
        });
      } else {
        await adminDb.collection('system_alerts').doc('latest_cron_alert').set({
          date: dateStr,
          timestamp: new Date(),
          resolved: true,
          issues: []
        });
      }
    } catch (e) {
      console.error("Firebase write error:", e);
    }
  }

  // If there are critical provider issues, return 502 Bad Gateway so GitHub Actions triggers an email notification!
  if (criticalErrors.length > 0) {
    return NextResponse.json({ 
      success: false, 
      date: dateStr,
      criticalErrors,
      chatgptScore, 
      claudeScore,
      geminiScore,
      tested: selectedCommunities
    }, { status: 502 });
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
