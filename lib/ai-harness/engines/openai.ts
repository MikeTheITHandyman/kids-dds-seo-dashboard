import { EngineClient, EngineQueryResult, ExecutionStatus } from './types';
import { classifyRefusal } from '../citations';

const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-4o';

export const openaiEngine: EngineClient = {
  name: 'OpenAI',

  isConfigured(): boolean {
    return Boolean(process.env.OPENAI_API_KEY);
  },

  async preflight(): Promise<{ ok: boolean; model: string; error?: string }> {
    if (!this.isConfigured()) {
      return { ok: false, model: DEFAULT_MODEL, error: 'Missing OPENAI_API_KEY in environment' };
    }

    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: DEFAULT_MODEL,
          max_tokens: 10,
          messages: [{ role: "user", content: "Ping" }]
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
        engine: 'OpenAI',
        model,
        status: 'api_error',
        responseText: '',
        rawCitations: [],
        latencyMs: 0,
        errorMessage: 'OPENAI_API_KEY not configured'
      };
    }

    try {
      // 1. First attempt: OpenAI Responses API with native web_search tool (low context size to minimize credit burn)
      const responsesApiPayload = {
        model,
        input: prompt,
        tools: [{ type: "web_search", search_context_size: "low" }]
      };

      let text = '';
      const rawCitations: string[] = [];
      let lastError = '';

      const respRes = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify(responsesApiPayload),
        signal: AbortSignal.timeout(timeoutMs)
      });

      if (respRes.ok) {
        const respData = await respRes.json();
        // Parse Responses API output structure
        if (respData.output_text) {
          text = respData.output_text;
        } else if (Array.isArray(respData.output)) {
          for (const item of respData.output) {
            if (item.type === 'message' && Array.isArray(item.content)) {
              for (const c of item.content) {
                if (c.type === 'output_text') {
                  text += (c.text || '');
                  if (Array.isArray(c.annotations)) {
                    for (const ann of c.annotations) {
                      if (ann.url) rawCitations.push(ann.url);
                    }
                  }
                }
              }
            } else if (typeof item.content === 'string') {
              text += item.content + '\n';
            }
          }
        }
      } else {
        const errData = await respRes.json().catch(() => ({}));
        lastError = errData.error?.message || `HTTP ${respRes.status}`;
      }

      // 2. Fallback: If Responses API is unavailable or returns an error, use Chat Completions with web search
      if (!text.trim()) {
        const chatRes = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
          },
          body: JSON.stringify({
            model,
            max_tokens: 1000,
            messages: [
              {
                role: "system",
                content: "You are a helpful local search assistant. Use real-time local search grounding to recommend actual, verified practices and provide their specific website or directory URLs when possible."
              },
              { role: "user", content: prompt }
            ]
          }),
          signal: AbortSignal.timeout(timeoutMs)
        });

        const chatData = await chatRes.json();
        if (chatData.choices?.[0]?.message?.content) {
          text = chatData.choices[0].message.content;
        } else if (chatData.error) {
          lastError = chatData.error.message || JSON.stringify(chatData.error);
        }
      }

      const latencyMs = Date.now() - startTime;

      if (!text.trim()) {
        return {
          engine: 'OpenAI',
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
        engine: 'OpenAI',
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
        engine: 'OpenAI',
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
