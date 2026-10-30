import type { AgentId } from '../../shared/types.ts';

// Interfaz común de todos los proveedores de IA.

export interface LlmMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LlmRequest {
  agentId: AgentId;
  purpose: 'plan' | 'tarea' | 'chat';
  system: string;
  messages: LlmMessage[];
  /** Si se indica, la respuesta tiene que ser un objeto JSON con esta forma (JSON Schema). */
  schema?: Record<string, unknown>;
  maxTokens?: number;
  /** Respuesta de prueba: solo la usa el proveedor «simulado». */
  fake?: () => string;
}

export interface LlmResult {
  text: string;
  /** Modelo que respondió de verdad (puede cambiar si hay respaldo). */
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** Coste que informa el propio proveedor (OpenRouter), si lo hay. */
  costUsd?: number;
}

export type LlmErrorKind = 'cuota' | 'limite' | 'clave' | 'modelo' | 'servicio' | 'red' | 'rechazo' | 'error';

/** Lo que dice el agente en su bocadillo cuando falla la IA. */
export const BUBBLE_FOR: Record<LlmErrorKind, string> = {
  cuota: 'Me he quedado sin cuota hoy',
  limite: 'Hemos llegado al límite de hoy',
  clave: 'No tengo una clave de IA válida',
  modelo: 'No encuentro ese modelo de IA',
  servicio: 'La IA no responde ahora mismo',
  red: 'No llego al servidor de la IA',
  rechazo: 'Prefiero no hacer eso',
  error: 'Algo ha fallado con la IA',
};

export class LlmError extends Error {
  kind: LlmErrorKind;

  constructor(kind: LlmErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

export interface Provider {
  name: string;
  defaultModel: string;
  complete(req: LlmRequest, model: string): Promise<LlmResult>;
}

/** Clasifica una respuesta HTTP fallida de cualquier proveedor. */
export function errorFromStatus(provider: string, status: number, body: string): LlmError {
  const detail = body.slice(0, 300);
  if (status === 429 || status === 402) return new LlmError('cuota', `${provider}: sin cuota o sin saldo (${status}) ${detail}`);
  if (status === 401 || status === 403) return new LlmError('clave', `${provider}: clave no válida (${status})`);
  if (status === 404) return new LlmError('modelo', `${provider}: modelo no encontrado (${status}) ${detail}`);
  if (status >= 500) return new LlmError('servicio', `${provider}: error del servicio (${status})`);
  return new LlmError('error', `${provider}: error ${status} ${detail}`);
}
