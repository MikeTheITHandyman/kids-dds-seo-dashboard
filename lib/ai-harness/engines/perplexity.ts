import { EngineClient, EngineQueryResult, ExecutionStatus } from './types';
import { classifyRefusal } from '../citations';

const DEFAULT_MODEL = process.env.PERPLEXITY_MODEL || 'sonar';

export const perplexityEngine: EngineClient = {
  name: 'Perplexity',

  isConfigured(): boolean {
    return Boolean(process.env.PERPLEXITY_API_KEY);
  },

  async preflight(): Promise<{ ok: boolean; model: string; error?: string }> {
    if (!this.isConfigured()) {
      return { ok: false, model: DEFAULT_MODEL, error: 'PERPLEXITY_API_KEY not configured in environment' };
    }

    try {
      const res = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`
        },
        body: JSON.stringify({
          model: DEFAULT_MODEL,
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Ping' }]
        }),
        signal: AbortSignal.timeout(15000)
      });

      const data = await res.json();
      if (data.choices?.[0]?.message?.content) {
        return { ok: true, model: DEFAULT_MODEL };
      }
      return { ok: false, model: DEFAULT_MODEL, error: data.error?.message || 'Invalid response' };
    } catch (e: any) {
      return { ok: false, model: DEFAULT_MODEL, error: e.message };
    }
  },

  async query(prompt: string, timeoutMs: number = 90000): Promise<EngineQueryResult> {
    const startTime = Date.now();
    const model = DEFAULT_MODEL;

    if (!this.isConfigured()) {
      return {
        engine: 'Perplexity',
        model,
        status: 'api_error',
        responseText: '',
        rawCitations: [],
        latencyMs: 0,
        errorMessage: 'PERPLEXITY_API_KEY not configured'
      };
    }

    try {
      const res = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`
        },
        body: JSON.stringify({
          model,
          max_tokens: 1000,
          messages: [{ role: 'user', content: prompt }]
        }),
        signal: AbortSignal.timeout(timeoutMs)
      });

      const latencyMs = Date.now() - startTime;
      const data = await res.json();

      if (data.error) {
        const errorMsg = data.error.message || JSON.stringify(data.error);
        return {
          engine: 'Perplexity',
          model,
          status: 'api_error',
          responseText: '',
          rawCitations: [],
          latencyMs,
          errorMessage: errorMsg
        };
      }

      const text = data.choices?.[0]?.message?.content || '';
      const rawCitations = Array.isArray(data.citations) ? data.citations : [];

      if (!text.trim()) {
        return {
          engine: 'Perplexity',
          model,
          status: 'empty',
          responseText: '',
          rawCitations,
          latencyMs
        };
      }

      const isRefusal = classifyRefusal(text);
      const status: ExecutionStatus = isRefusal ? 'refusal' : 'ok';

      return {
        engine: 'Perplexity',
        model,
        status,
        responseText: text.trim(),
        rawCitations,
        latencyMs
      };
    } catch (e: any) {
      const latencyMs = Date.now() - startTime;
      const isTimeout = e.name === 'TimeoutError' || e.message?.toLowerCase().includes('timeout') || e.message?.toLowerCase().includes('aborted');
      return {
        engine: 'Perplexity',
        model,
        status: isTimeout ? 'timeout' : 'api_error',
        responseText: '',
        rawCitations: [],
        latencyMs,
        errorMessage: e.message
      };
    }
  }
};
