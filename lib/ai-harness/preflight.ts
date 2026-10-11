import { EngineClient } from './engines/types';
import { openaiEngine } from './engines/openai';
import { geminiEngine } from './engines/gemini';
import { claudeEngine } from './engines/claude';
import { perplexityEngine } from './engines/perplexity';

export interface PreflightReport {
  timestamp: string;
  activeEngines: EngineClient[];
  abortedEngines: { name: string; model: string; reason: string }[];
  isDegraded: boolean;
  alertNeeded: boolean;
  alertMessage?: string;
}

export async function runPreflightChecks(): Promise<PreflightReport> {
  const allEngines: EngineClient[] = [
    openaiEngine,
    claudeEngine,
    geminiEngine,
    perplexityEngine
  ];

  const activeEngines: EngineClient[] = [];
  const abortedEngines: { name: string; model: string; reason: string }[] = [];

  for (const engine of allEngines) {
    if (!engine.isConfigured()) {
      abortedEngines.push({
        name: engine.name,
        model: 'N/A',
        reason: 'API key not configured in environment'
      });
      continue;
    }

    const check = await engine.preflight();
    if (check.ok) {
      activeEngines.push(engine);
    } else {
      abortedEngines.push({
        name: engine.name,
        model: check.model,
        reason: check.error || 'Preflight test failed'
      });
    }
  }

  // A run is degraded if any configured engine failed its preflight check
  const configuredFailed = abortedEngines.filter(e => e.reason !== 'API key not configured in environment');
  const isDegraded = configuredFailed.length > 0;
  const alertNeeded = isDegraded || activeEngines.length < 2;

  let alertMessage: string | undefined;
  if (alertNeeded) {
    alertMessage = `AI Visibility Preflight Warning: ${configuredFailed.map(e => `${e.name} (${e.model}: ${e.reason})`).join(', ')}`;
  }

  return {
    timestamp: new Date().toISOString(),
    activeEngines,
    abortedEngines,
    isDegraded,
    alertNeeded,
    alertMessage
  };
}
