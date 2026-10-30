import { join, resolve } from 'node:path';

// Configuración desde el entorno (.env). Ver .env.example.

export const ROOT = join(import.meta.dirname, '..');

export const config = {
  /** Solo localhost por defecto: en el VPS, Caddy es lo único expuesto. */
  host: process.env.API_HOST || '127.0.0.1',
  // API_PORT y no PORT: muchas herramientas ponen PORT para la web de desarrollo.
  port: Number(process.env.API_PORT || 3001),
  /** Cookie solo por HTTPS. localhost cuenta como seguro en los navegadores. */
  cookieSecure: process.env.COOKIE_SECURE !== 'false',
  dataDir: process.env.DATA_DIR || join(ROOT, 'data'),
  distDir: join(ROOT, 'dist'),
  sessionDays: 7,
  loginWindowMin: 15,
  loginMaxFailures: 5,
  /** Donde los agentes guardan su trabajo. Es lo único que escriben. */
  resultsDir: process.env.RESULTADOS_DIR || join(ROOT, 'resultados'),
  /** Carpeta con los proyectos de verdad (solo lectura), para dar contexto a los agentes. */
  projectsDir: process.env.PROYECTOS_DIR ? resolve(ROOT, process.env.PROYECTOS_DIR) : undefined,
  llm: {
    provider: (process.env.LLM_PROVIDER || 'gemini').toLowerCase(),
    model: process.env.LLM_MODEL || '',
    callLimit: Number(process.env.LIMITE_LLAMADAS_DIA || 50),
    spendLimit: Number(process.env.LIMITE_GASTO_DIA_USD || 1),
    /** Minutos mínimos entre dos rondas de planificación del piloto automático. */
    rhythmMin: Number(process.env.RITMO_CEO_MIN || 20),
    /** Zona horaria con la que se cuenta «hoy» para los límites. */
    timeZone: process.env.ZONA_HORARIA || 'Europe/Madrid',
    priceIn: process.env.LLM_PRECIO_ENTRADA ? Number(process.env.LLM_PRECIO_ENTRADA) : undefined,
    priceOut: process.env.LLM_PRECIO_SALIDA ? Number(process.env.LLM_PRECIO_SALIDA) : undefined,
  },
};

/** Proveedor y modelo de un agente: LLM_PROVIDER_LEO / LLM_MODEL_LEO, o los generales. */
export function agentLlmEnv(agentId: string) {
  const id = agentId.toUpperCase();
  return {
    provider: (process.env[`LLM_PROVIDER_${id}`] || config.llm.provider).toLowerCase(),
    model: process.env[`LLM_MODEL_${id}`] || '',
  };
}
