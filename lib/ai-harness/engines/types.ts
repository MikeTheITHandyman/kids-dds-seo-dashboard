// Engine Query Types and Interface

export type ExecutionStatus = 'ok' | 'refusal' | 'timeout' | 'api_error' | 'empty';

export interface EngineQueryResult {
  engine: 'OpenAI' | 'Claude' | 'Gemini' | 'Perplexity';
  model: string;
  status: ExecutionStatus;
  responseText: string;
  rawCitations: string[];
  latencyMs: number;
  errorMessage?: string;
}

export interface EngineClient {
  name: 'OpenAI' | 'Claude' | 'Gemini' | 'Perplexity';
  isConfigured(): boolean;
  preflight(): Promise<{ ok: boolean; model: string; error?: string }>;
  query(prompt: string, timeoutMs?: number): Promise<EngineQueryResult>;
}
