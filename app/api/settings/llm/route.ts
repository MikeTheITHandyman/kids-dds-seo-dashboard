import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import {
  getLLMBudgetConfig,
  saveLLMBudgetConfig,
  loadQuestionStateMap,
  LLMPreset,
  LLMFrequency,
  PRESET_CONFIGS
} from '@/lib/ai-harness/settings';

export const dynamic = 'force-dynamic';

async function checkAdminAuth() {
  const session = await auth();
  if (!session?.user?.email) {
    return {
      authorized: false,
      response: NextResponse.json({ error: 'Unauthorized: Please log in' }, { status: 401 })
    };
  }
  const email = session.user.email.toLowerCase().trim();
  const role = (session.user as any).role;
  const isAdmin = role === 'ADMIN' || email === 'mike@kidsdds.com' || email === 'mike@miketheithandyman.com';

  if (!isAdmin) {
    return {
      authorized: false,
      response: NextResponse.json({ error: 'Forbidden: Administrator role required to modify LLM settings' }, { status: 403 })
    };
  }
  return { authorized: true, session, email };
}

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const [config, stateMap] = await Promise.all([
      getLLMBudgetConfig(),
      loadQuestionStateMap()
    ]);

    const entries = Object.values(stateMap);
    const masteredList = entries
      .filter(q => q.mastered)
      .map(q => ({
        key: q.key,
        location: q.location,
        topicName: q.topicName,
        lastTestedDate: q.lastTestedDate
      }));

    return NextResponse.json({
      config,
      stats: {
        totalTracked: entries.length,
        masteredCount: masteredList.length,
        masteredList
      }
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed to load settings' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const authCheck = await checkAdminAuth();
  if (!authCheck.authorized) return authCheck.response!;

  try {
    const body = await request.json();
    const preset = body.preset as LLMPreset | undefined;

    let nextConfig: any = {};

    if (preset && preset !== 'custom' && PRESET_CONFIGS[preset]) {
      nextConfig = { ...PRESET_CONFIGS[preset] };
    } else {
      const validFrequencies: LLMFrequency[] = ['daily', 'every_other_day', 'weekly', 'monthly'];
      const frequency: LLMFrequency = validFrequencies.includes(body.frequency)
        ? body.frequency
        : 'every_other_day';
      const questionsPerRun = Math.max(1, Math.min(25, Number(body.questionsPerRun) || 6));
      const smartSkipMastered = Boolean(body.smartSkipMastered);
      const recheckDays = Math.max(7, Math.min(90, Number(body.recheckDays) || 30));

      // Detect if custom selections match one of the 3 presets
      let matchedPreset: LLMPreset = 'custom';
      for (const [key, val] of Object.entries(PRESET_CONFIGS)) {
        if (
          val.frequency === frequency &&
          val.questionsPerRun === questionsPerRun &&
          val.smartSkipMastered === smartSkipMastered
        ) {
          matchedPreset = key as LLMPreset;
          break;
        }
      }

      nextConfig = {
        preset: matchedPreset,
        frequency,
        questionsPerRun,
        smartSkipMastered,
        recheckDays
      };
    }

    const saved = await saveLLMBudgetConfig(nextConfig, authCheck.email);
    return NextResponse.json({ success: true, config: saved });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed to save LLM settings' }, { status: 500 });
  }
}
