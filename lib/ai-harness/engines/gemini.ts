import { EngineClient, EngineQueryResult, ExecutionStatus } from './types';
import { classifyRefusal } from '../citations';

const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';

export const geminiEngine: EngineClient = {
  name: 'Gemini',

  isConfigured(): boolean {
    return Boolean(process.env.GEMINI_API_KEY);
  },

  async preflight(): Promise<{ ok: boolean; model: string; error?: string }> {
    if (!this.isConfigured()) {
      return { ok: false, model: DEFAULT_MODEL, error: 'Missing GEMINI_API_KEY in environment' };
    }

    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`, {
        signal: AbortSignal.timeout(6000)
      });

      const data = await res.json();
      if (data.models && Array.isArray(data.models)) {
        return { ok: true, model: DEFAULT_MODEL };
      }
      return { ok: false, model: DEFAULT_MODEL, error: data.error?.message || 'Invalid API key or model response' };
    } catch (e: any) {
      return { ok: false, model: DEFAULT_MODEL, error: e.message };
    }
  },

  async query(prompt: string, timeoutMs: number = 90000): Promise<EngineQueryResult> {
    const startTime = Date.now();
    const model = DEFAULT_MODEL;

    if (!this.isConfigured()) {
      return {
        engine: 'Gemini',
        model,
        status: 'api_error',
        responseText: '',
        rawCitations: [],
        latencyMs: 0,
        errorMessage: 'GEMINI_API_KEY not configured'
      };
    }

    try {
      // Execute with Google Search grounding tool
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          tools: [{ google_search: {} }],
          generationConfig: {
            maxOutputTokens: 1000,
            thinkingConfig: {
              thinkingBudget: 0
            }
          }
        }),
        signal: AbortSignal.timeout(timeoutMs)
      });

      const latencyMs = Date.now() - startTime;
      const data = await res.json();

      if (data.error) {
        const errorMsg = data.error.message || JSON.stringify(data.error);
        return {
          engine: 'Gemini',
          model,
          status: 'api_error',
          responseText: '',
          rawCitations: [],
          latencyMs,
          errorMessage: errorMsg
        };
      }

      const candidate = data.candidates?.[0];
      const text = candidate?.content?.parts?.[0]?.text || '';

      if (!text.trim()) {
        return {
          engine: 'Gemini',
          model,
          status: 'empty',
          responseText: '',
          rawCitations: [],
          latencyMs
        };
      }

      // Extract citation URLs from Google grounding metadata
      const rawCitations: string[] = [];
      const groundingChunks = candidate?.groundingMetadata?.groundingChunks || [];
      for (const chunk of groundingChunks) {
        if (chunk.web?.uri) {
          rawCitations.push(chunk.web.uri);
        }
      }

      // Check for AI refusal
      const isRefusal = classifyRefusal(text);
      const status: ExecutionStatus = isRefusal ? 'refusal' : 'ok';

      return {
        engine: 'Gemini',
        model,
        status,
        responseText: text,
        rawCitations,
        latencyMs
      };
    } catch (e: any) {
      const latencyMs = Date.now() - startTime;
      const isTimeout = e.name === 'TimeoutError' || e.message?.toLowerCase().includes('timeout') || e.message?.toLowerCase().includes('aborted');
      return {
        engine: 'Gemini',
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
