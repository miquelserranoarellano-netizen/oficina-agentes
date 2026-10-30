import Anthropic from '@anthropic-ai/sdk';
import { LlmError, type LlmRequest, type LlmResult, type Provider } from './types.ts';

// Claude con el SDK oficial de Anthropic.

/** Modelos que admiten el respaldo automático en el servidor si rechazan una petición. */
const WITH_FALLBACK = new Set(['claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5']);

/** Los modelos antiguos no aceptan el parámetro de esfuerzo. */
function supportsEffort(model: string) {
  return !/haiku-4|sonnet-4-5|claude-3/.test(model);
}

export function anthropicProvider(apiKey: string): Provider {
  const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 180_000 });
  return {
    name: 'anthropic',
    defaultModel: 'claude-opus-5-5',
    async complete(req: LlmRequest, model: string): Promise<LlmResult> {
      try {
        const response = await client.beta.messages.create({
          model,
          max_tokens: req.maxTokens ?? 16000,
          system: req.system,
          messages: req.messages,
          output_config: {
            ...(supportsEffort(model) ? { effort: 'medium' as const } : {}),
            ...(req.schema ? { format: { type: 'json_schema' as const, schema: req.schema } } : {}),
          },
          ...(WITH_FALLBACK.has(model)
            ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
            : {}),
        });
        if (response.stop_reason === 'refusal') {
          throw new LlmError('rechazo', `anthropic: petición rechazada (${response.stop_details?.category ?? 'sin categoría'})`);
        }
        const text = response.content
          .map((block) => (block.type === 'text' ? block.text : ''))
          .join('')
          .trim();
        if (!text) throw new LlmError('error', 'anthropic: respuesta vacía');
        return {
          text,
          model: response.model,
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        };
      } catch (err) {
        if (err instanceof LlmError) throw err;
        if (err instanceof Anthropic.RateLimitError) throw new LlmError('cuota', 'anthropic: límite de peticiones (429)');
        if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
          throw new LlmError('clave', `anthropic: clave no válida (${err.status})`);
        }
        if (err instanceof Anthropic.NotFoundError) throw new LlmError('modelo', `anthropic: modelo no encontrado (${model})`);
        if (err instanceof Anthropic.InternalServerError) throw new LlmError('servicio', `anthropic: error del servicio (${err.status})`);
        if (err instanceof Anthropic.APIConnectionError) throw new LlmError('red', 'anthropic: no se pudo conectar');
        if (err instanceof Anthropic.APIError) {
          // 402 billing_error: sin saldo
          if (err.status === 402) throw new LlmError('cuota', 'anthropic: sin saldo (402)');
          throw new LlmError('error', `anthropic: error ${err.status} ${err.message}`);
        }
        throw new LlmError('error', `anthropic: ${(err as Error).message}`);
      }
    },
  };
}
