import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getActiveClientId, getClientConfig } from '@/lib/clients';
import { geminiEngine } from '@/lib/ai-harness/engines/gemini';
import { openaiEngine } from '@/lib/ai-harness/engines/openai';
import { claudeEngine } from '@/lib/ai-harness/engines/claude';

export const maxDuration = 60;

export interface RecommendedQuestionItem {
  id: string;
  topic: string;
  promptTemplate: string;
  isRegional: boolean;
  rationale: string;
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized: Please log in' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const clientId = await getActiveClientId(body.clientId);
    const client = await getClientConfig(clientId);
    const customHint = (body.customHint || '').trim();

    const existingQuestionsList = (client.questions || [])
      .map(q => `- [${q.topic}] ${q.promptTemplate}`)
      .join('\n');

    const systemPrompt = [
      `You are an AI Search Visibility (AEO / GEO) strategist.`,
      `Generate 6 high-intent questions that prospective customers ask AI assistants (ChatGPT, Claude, Gemini) when looking to hire or choose a business like this client.`,
      ``,
      `CLIENT PROFILE:`,
      `- Business Name: ${client.name}`,
      `- Website Domain: ${client.domain || 'N/A'}`,
      `- Business Category / Specialty: ${client.businessType || 'Local Service Business'}`,
      `- Primary Location: ${client.primaryLocation || 'Local Market'}`,
      `- Core Services / Differentiators: ${client.services || 'General services'}`,
      `- Target Audience: ${client.targetAudience || 'Local customers and families'}`,
      customHint ? `- Special Focus Requested by User: ${customHint}` : '',
      ``,
      `EXISTING CONFIGURED QUESTIONS (do NOT duplicate these; find new high-value angles):`,
      existingQuestionsList || '(None yet)',
      ``,
      `REQUIREMENTS:`,
      `1. For regional/local-intent questions (recommended for most local businesses), include the literal placeholder "{location}" where the town/city name goes (e.g., "What are the most reputable pediatric dental clinics in or near {location} that offer...? Please name specific practices.") and set "isRegional": true.`,
      `2. Phrase questions so the AI naturally lists specific businesses/clinics by name.`,
      `3. Return ONLY a valid JSON array of 6 objects with keys: "topic" (2-4 word label), "promptTemplate" (the question string), "isRegional" (boolean), and "rationale" (1 short sentence explaining why this question matters). No markdown code fences or extra commentary.`,
    ]
      .filter(Boolean)
      .join('\n');

    // Choose first configured engine (Gemini -> OpenAI -> Claude)
    const engines = [geminiEngine, openaiEngine, claudeEngine].filter(e => e.isConfigured());
    if (engines.length === 0) {
      return NextResponse.json(
        { error: 'No AI engine API keys (GEMINI_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY) are configured.' },
        { status: 400 }
      );
    }

    let rawText = '';
    let usedEngine = '';
    for (const eng of engines) {
      const res = await eng.query(systemPrompt, 25000);
      if (res.responseText && res.status === 'ok') {
        rawText = res.responseText;
        usedEngine = eng.name;
        break;
      }
    }

    if (!rawText) {
      return NextResponse.json(
        { error: 'AI engine did not return recommendations. Please try again.' },
        { status: 502 }
      );
    }

    // Extract JSON array from response
    const jsonMatch = rawText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return NextResponse.json(
        { error: 'Could not parse AI recommendations JSON', raw: rawText },
        { status: 502 }
      );
    }

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) {
      return NextResponse.json({ error: 'Invalid recommendations format' }, { status: 502 });
    }

    const recommendations: RecommendedQuestionItem[] = parsed.slice(0, 8).map((item: any, i: number) => {
      const topic = String(item.topic || `Recommended Topic ${i + 1}`).trim();
      const slug = topic
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '');
      return {
        id: `${slug}_${Date.now().toString(36).slice(-4)}_${i}`,
        topic,
        promptTemplate: String(item.promptTemplate || item.question || '').trim(),
        isRegional: typeof item.isRegional === 'boolean' ? item.isRegional : true,
        rationale: String(item.rationale || '').trim(),
      };
    });

    return NextResponse.json({
      success: true,
      engine: usedEngine,
      recommendations,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || 'Failed to generate question recommendations' },
      { status: 500 }
    );
  }
}
