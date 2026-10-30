import { errorFromStatus, LlmError, type LlmRequest, type LlmResult, type Provider } from './types.ts';

// Gemini, Groq, OpenRouter y Ollama hablan el mismo formato de «chat completions».

interface Options {
  name: string;
  baseUrl: string;
  apiKey?: string;
  defaultModel: string;
  headers?: Record<string, string>;
  extraBody?: Record<string, unknown>;
}

const TIMEOUT_MS = 120_000;

/** Sin modo JSON común a todos: se pide en las instrucciones y luego se valida al leerlo. */
export function jsonInstruction(schema: Record<string, unknown>): string {
  return `\n\nResponde SOLO con un objeto JSON válido (sin texto alrededor ni bloques de código) que siga este esquema:\n${JSON.stringify(schema)}`;
}

export function openAiCompatible(opts: Options): Provider {
  return {
    name: opts.name,
    defaultModel: opts.defaultModel,
    async complete(req: LlmRequest, model: string): Promise<LlmResult> {
      const system = req.system + (req.schema ? jsonInstruction(req.schema) : '');
      let res: Response;
      try {
        res = await fetch(`${opts.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(opts.apiKey ? { Authorization: `Bearer ${opts.apiKey}` } : {}),
            ...opts.headers,
          },
          body: JSON.stringify({
            model,
            messages: [{ role: 'system', content: system }, ...req.messages],
            max_tokens: req.maxTokens ?? 8192,
            ...opts.extraBody,
          }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (err) {
        throw new LlmError('red', `${opts.name}: no se pudo conectar (${(err as Error).message})`);
      }
      if (!res.ok) throw errorFromStatus(opts.name, res.status, await res.text().catch(() => ''));
      const data = (await res.json()) as {
        model?: string;
        choices?: Array<{ message?: { content?: unknown } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
      };
      const content = data.choices?.[0]?.message?.content;
      const text = typeof content === 'string' ? content.trim() : '';
      if (!text) throw new LlmError('error', `${opts.name}: respuesta vacía`);
      return {
        text,
        model: data.model ?? model,
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
        costUsd: typeof data.usage?.cost === 'number' ? data.usage.cost : undefined,
      };
    },
  };
}
