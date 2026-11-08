import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { adminDb } from '@/lib/firebase-admin';
import { getActiveClientId, getClientConfig } from '@/lib/clients';
import { buildWhyNotMentionedPrompt } from '@/lib/ai-harness/settings';
import { openaiEngine } from '@/lib/ai-harness/engines/openai';
import { claudeEngine } from '@/lib/ai-harness/engines/claude';
import { geminiEngine } from '@/lib/ai-harness/engines/gemini';

export const maxDuration = 60;

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized: Please log in' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const {
      runId,
      logIndex,
      prompt,
      originalResponse,
      engine: engineKey,
      clientId: rawClientId,
    } = body;

    if (!prompt || !originalResponse || !engineKey) {
      return NextResponse.json(
        { error: 'prompt, originalResponse, and engine are required' },
        { status: 400 }
      );
    }

    const clientId = await getActiveClientId(rawClientId);
    const client = await getClientConfig(clientId);

    const engineMap: Record<string, typeof openaiEngine> = {
      chatgpt: openaiEngine,
      openai: openaiEngine,
      claude: claudeEngine,
      gemini: geminiEngine,
    };

    const selectedEngine = engineMap[String(engineKey).toLowerCase()];
    if (!selectedEngine) {
      return NextResponse.json({ error: `Unsupported engine: ${engineKey}` }, { status: 400 });
    }

    if (!selectedEngine.isConfigured()) {
      return NextResponse.json(
        { error: `${selectedEngine.name} API key is not configured in environment` },
        { status: 400 }
      );
    }

    const followUpPrompt = buildWhyNotMentionedPrompt(prompt, originalResponse, client);
    const result = await selectedEngine.query(followUpPrompt, 25000);

    if (!result.responseText || result.status === 'api_error' || result.status === 'timeout') {
      return NextResponse.json(
        {
          error:
            result.errorMessage ||
            `${selectedEngine.name} failed to generate a follow-up response (${result.status})`,
        },
        { status: 502 }
      );
    }

    const followUpText = result.responseText.trim();

    // Persist follow-up response into Firestore cron_logs if runId is provided
    if (runId && adminDb && adminDb.collection) {
      try {
        const runRef = adminDb.collection('cron_logs').doc(runId);
        const runSnap = await runRef.get();
        if (runSnap.exists) {
          const data = runSnap.data() || {};
          const logs = Array.isArray(data.logs) ? [...data.logs] : [];
          const targetIdx =
            typeof logIndex === 'number' && logs[logIndex]?.prompt === prompt
              ? logIndex
              : logs.findIndex((l: any) => l.prompt === prompt);

          if (targetIdx !== -1 && logs[targetIdx]) {
            const fieldMap: Record<string, string> = {
              OpenAI: 'chatgptFollowUp',
              Claude: 'claudeFollowUp',
              Gemini: 'geminiFollowUp',
            };
            const fieldName = fieldMap[selectedEngine.name] || 'followUp';
            logs[targetIdx] = {
              ...logs[targetIdx],
              [fieldName]: followUpText,
              engines: {
                ...(logs[targetIdx].engines || {}),
                [selectedEngine.name]: {
                  ...(logs[targetIdx].engines?.[selectedEngine.name] || {}),
                  followUp: followUpText,
                },
              },
            };
            await runRef.update({ logs });
          }
        }
      } catch (persistErr) {
        console.error('Failed to persist follow-up to cron_logs:', persistErr);
      }
    }

    return NextResponse.json({
      success: true,
      engine: selectedEngine.name,
      followUpPrompt,
      followUpResponse: followUpText,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || 'Failed to execute follow-up query' },
      { status: 500 }
    );
  }
}
