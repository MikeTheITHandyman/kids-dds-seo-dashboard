import { EngineClient, EngineQueryResult, ExecutionStatus } from './types';
import { classifyRefusal } from '../citations';

const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';

export const claudeEngine: EngineClient = {
  name: 'Claude',

  isConfigured(): boolean {
    return Boolean(process.env.ANTHROPIC_API_KEY);
  },

  async preflight(): Promise<{ ok: boolean; model: string; error?: string }> {
    if (!this.isConfigured()) {
      return { ok: false, model: DEFAULT_MODEL, error: 'Missing ANTHROPIC_API_KEY in environment' };
    }

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01'
      };
      if (process.env.ANTHROPIC_WORKSPACE_ID) {
        headers['anthropic-workspace-id'] = process.env.ANTHROPIC_WORKSPACE_ID;
      }

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: DEFAULT_MODEL,
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Ping' }]
        }),
        signal: AbortSignal.timeout(15000)
      });

      const data = await res.json();
      if (data.content?.[0]?.text) {
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
        engine: 'Claude',
        model,
        status: 'api_error',
        responseText: '',
        rawCitations: [],
        latencyMs: 0,
        errorMessage: 'ANTHROPIC_API_KEY not configured'
      };
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01'
    };
    if (process.env.ANTHROPIC_WORKSPACE_ID) {
      headers['anthropic-workspace-id'] = process.env.ANTHROPIC_WORKSPACE_ID;
    }

    try {
      // 1. Try with Anthropic native server web_search tool
      let text = '';
      const rawCitations: string[] = [];
      let lastError = '';

      const searchPayload = {
        model,
        max_tokens: 1000,
        tools: [
          {
            type: "web_search_20250305",
            name: "web_search",
            max_uses: 5
          }
        ],
        messages: [{ role: "user", content: prompt }]
      };

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers,
        body: JSON.stringify(searchPayload),
        signal: AbortSignal.timeout(timeoutMs)
      });

      const data = await res.json();

      if (data.content) {
        for (const block of data.content) {
          if (block.type === 'text') {
            text += block.text + '\n';
          } else if (block.type === 'citation' && block.url) {
            rawCitations.push(block.url);
          }
        }
      } else if (data.error) {
        lastError = data.error.message || JSON.stringify(data.error);

        // 2. If web search tool is disabled or unsupported in console, fallback to standard grounded prompt
        if (lastError.toLowerCase().includes('tool') || lastError.toLowerCase().includes('type')) {
          const fallbackRes = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              model,
              max_tokens: 1000,
              messages: [
                {
                  role: "user",
                  content: `${prompt}\n\nPlease search for verified local clinics and include their exact clinic names, doctor names, and website addresses.`
                }
              ]
            }),
            signal: AbortSignal.timeout(timeoutMs)
          });
          const fbData = await fallbackRes.json();
          if (fbData.content?.[0]?.text) {
            text = fbData.content[0].text;
            lastError = '';
          }
        }
      }

      const latencyMs = Date.now() - startTime;

      if (!text.trim()) {
        return {
          engine: 'Claude',
          model,
          status: lastError ? 'api_error' : 'empty',
          responseText: '',
          rawCitations: [],
          latencyMs,
          errorMessage: lastError
        };
      }

      const isRefusal = classifyRefusal(text);
      const status: ExecutionStatus = isRefusal ? 'refusal' : 'ok';

      return {
        engine: 'Claude',
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
        engine: 'Claude',
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
