import type { AgentId } from '../../shared/types.ts';
import { agentLlmEnv, config } from '../config.ts';
import type { Store } from '../db.ts';
import { anthropicProvider } from './anthropic.ts';
import { openAiCompatible } from './openai-compatible.ts';
import { simuladoProvider } from './simulado.ts';
import { LlmError, type LlmRequest, type LlmResult, type Provider } from './types.ts';

// Capa común de IA: elige el proveedor de cada agente, aplica los límites del día y apunta el gasto.

const QUOTA_PAUSE_MS = 15 * 60_000;

/** Precio en dólares por millón de tokens (entrada, salida). Los gratuitos cuentan 0. */
const PRICES: Array<[RegExp, number, number]> = [
  [/^claude-(fable|mythos)-5/, 10, 50],
  [/^claude-opus-5-5/, 4, 20],
  [/^claude-opus-(5|4-[5-8])/, 5, 25],
  [/^claude-sonnet-5/, 2, 10],
  [/^claude-sonnet-4/, 3, 15],
  [/^claude-haiku-5/, 0.1, 0.5],
  [/^claude-haiku-4/, 1, 5],
];

function makeProvider(name: string): Provider | string {
  const env = process.env;
  switch (name) {
    case 'gemini':
      if (!env.GEMINI_API_KEY) return 'Falta GEMINI_API_KEY en .env';
      return openAiCompatible({
        name,
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
        apiKey: env.GEMINI_API_KEY,
        defaultModel: 'gemini-3.5-flash-lite',
      });
    case 'groq':
      if (!env.GROQ_API_KEY) return 'Falta GROQ_API_KEY en .env';
      return openAiCompatible({
        name,
        baseUrl: 'https://api.groq.com/openai/v1',
        apiKey: env.GROQ_API_KEY,
        defaultModel: 'openai/gpt-oss-120b',
      });
    case 'openrouter':
      if (!env.OPENROUTER_API_KEY) return 'Falta OPENROUTER_API_KEY en .env';
      return openAiCompatible({
        name,
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKey: env.OPENROUTER_API_KEY,
        defaultModel: 'openrouter/free',
        headers: { 'X-Title': 'Oficina de Miquel' },
        // Pide que la respuesta incluya el coste real de la llamada.
        extraBody: { usage: { include: true } },
      });
    case 'ollama':
      return openAiCompatible({
        name,
        baseUrl: `${(env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, '')}/v1`,
        defaultModel: 'llama3.2',
      });
    case 'anthropic':
      if (!env.ANTHROPIC_API_KEY) return 'Falta ANTHROPIC_API_KEY en .env';
      return anthropicProvider(env.ANTHROPIC_API_KEY);
    case 'simulado':
      return simuladoProvider();
    default:
      return `Proveedor desconocido: «${name}». Usa gemini, groq, openrouter, ollama, anthropic o simulado`;
  }
}

export function dayKey(at = Date.now()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: config.llm.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(at));
}

export class LlmService {
  private store: Store;
  private providers = new Map<string, Provider | string>();
  /** Tras un error de cuota, ese proveedor descansa un rato para no insistir. */
  private quotaUntil = new Map<string, number>();

  constructor(store: Store) {
    this.store = store;
  }

  private provider(name: string): Provider | string {
    if (!this.providers.has(name)) this.providers.set(name, makeProvider(name));
    return this.providers.get(name)!;
  }

  /** Proveedor y modelo generales; si no está listo, la oficina sigue en modo simulado. */
  main(): { provider: string; model: string; ready: boolean; reason?: string } {
    const p = this.provider(config.llm.provider);
    if (typeof p === 'string') return { provider: config.llm.provider, model: config.llm.model, ready: false, reason: p };
    return { provider: p.name, model: config.llm.model || p.defaultModel, ready: true };
  }

  modelFor(agentId: AgentId): { provider: Provider; model: string } | LlmError {
    const env = agentLlmEnv(agentId);
    const p = this.provider(env.provider);
    if (typeof p === 'string') return new LlmError('clave', p);
    const sameAsMain = env.provider === config.llm.provider;
    return { provider: p, model: env.model || (sameAsMain && config.llm.model) || p.defaultModel };
  }

  today() {
    return this.store.llmDay(dayKey());
  }

  /** Motivo por el que ahora no se puede llamar a la IA, o undefined. */
  blocked(): string | undefined {
    const { calls, spent } = this.today();
    if (calls >= config.llm.callLimit) return `Límite de ${config.llm.callLimit} llamadas por día alcanzado`;
    if (spent >= config.llm.spendLimit) return `Límite de gasto diario (${config.llm.spendLimit} $) alcanzado`;
    const until = this.quotaUntil.get(this.main().provider) ?? 0;
    if (until > Date.now()) return `${this.main().provider} sin cuota: se reintenta en ${Math.ceil((until - Date.now()) / 60_000)} min`;
    return undefined;
  }

  async complete(req: LlmRequest): Promise<LlmResult> {
    const { calls, spent } = this.today();
    if (calls >= config.llm.callLimit) throw new LlmError('limite', `límite de ${config.llm.callLimit} llamadas hoy`);
    if (spent >= config.llm.spendLimit) throw new LlmError('limite', `límite de gasto de ${config.llm.spendLimit} $ hoy`);
    const choice = this.modelFor(req.agentId);
    if (choice instanceof LlmError) throw choice;
    const { provider, model } = choice;
    if ((this.quotaUntil.get(provider.name) ?? 0) > Date.now()) {
      throw new LlmError('cuota', `${provider.name}: en pausa tras quedarse sin cuota`);
    }
    const base = { at: Date.now(), day: dayKey(), agentId: req.agentId, provider: provider.name, purpose: req.purpose };
    try {
      const result = await provider.complete(req, model);
      const cost = result.costUsd ?? this.price(result.model, result.inputTokens, result.outputTokens);
      this.store.addLlmCall({ ...base, model: result.model, tokensIn: result.inputTokens, tokensOut: result.outputTokens, cost, ok: true });
      return result;
    } catch (err) {
      const e = err instanceof LlmError ? err : new LlmError('error', (err as Error).message);
      if (e.kind === 'cuota') this.quotaUntil.set(provider.name, Date.now() + QUOTA_PAUSE_MS);
      this.store.addLlmCall({ ...base, model, tokensIn: 0, tokensOut: 0, cost: 0, ok: false, error: e.kind });
      throw e;
    }
  }

  private price(model: string, tokensIn: number, tokensOut: number): number {
    let pin = config.llm.priceIn;
    let pout = config.llm.priceOut;
    if (pin === undefined || pout === undefined) {
      const row = PRICES.find(([re]) => re.test(model));
      pin ??= row?.[1] ?? 0;
      pout ??= row?.[2] ?? 0;
    }
    return (tokensIn * pin + tokensOut * pout) / 1_000_000;
  }
}
