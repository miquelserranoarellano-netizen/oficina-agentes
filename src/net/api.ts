import type { AgentId, ChatMessage, ProjectInput, ResultInfo, Speed } from '../../shared/types.ts';

// Llamadas a la API del servidor (misma web, cookie de sesión automática).

export class ApiError extends Error {
  status: number;
  data: Record<string, unknown>;

  constructor(status: number, data: Record<string, unknown>) {
    super(String(data.error ?? status));
    this.status = status;
    this.data = data;
  }
}

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}

export interface SessionInfo {
  username: string;
  totpEnabled: boolean;
}

export const api = {
  session: () => call<SessionInfo>('GET', '/api/session'),
  login: (username: string, password: string) =>
    call<SessionInfo | { needTotp: true; ticket: string }>('POST', '/api/login', { username, password }),
  loginTotp: (ticket: string, code: string) => call<SessionInfo>('POST', '/api/login/totp', { ticket, code }),
  logout: () => call<{ ok: true }>('POST', '/api/logout'),

  setup2fa: () => call<{ secret: string; url: string; qr: string }>('POST', '/api/2fa/setup'),
  enable2fa: (code: string) => call<{ totpEnabled: boolean }>('POST', '/api/2fa/enable', { code }),
  disable2fa: (password: string, code: string) =>
    call<{ totpEnabled: boolean }>('POST', '/api/2fa/disable', { password, code }),

  control: (body: { paused?: boolean; speed?: Speed; autopilot?: boolean }) => call('POST', '/api/control', body),
  chatHistory: (agent: AgentId, project: string | null) =>
    call<{ messages: ChatMessage[] }>(
      'GET',
      `/api/chat?agent=${encodeURIComponent(agent)}${project ? `&project=${encodeURIComponent(project)}` : ''}`,
    ),
  sendChat: (agentId: AgentId, projectId: string | null, text: string) =>
    call<{ message: ChatMessage }>('POST', '/api/chat', { agentId, projectId, text }),
  results: (project: string) => call<{ results: ResultInfo[] }>('GET', `/api/results?project=${encodeURIComponent(project)}`),
  result: (taskId: string) =>
    call<{ title: string; agentId: AgentId; projectId: string; file: string; text: string }>(
      'GET',
      `/api/results/${encodeURIComponent(taskId)}`,
    ),
  addProject: (input: ProjectInput) => call('POST', '/api/projects', input),
  updateProject: (id: string, input: ProjectInput) => call('PUT', `/api/projects/${encodeURIComponent(id)}`, input),
  deleteProject: (id: string) => call('DELETE', `/api/projects/${encodeURIComponent(id)}`),
  reset: () => call('POST', '/api/reset'),
};

/** Mensaje en español para mostrar al usuario. */
export function errorText(err: unknown): string {
  if (err instanceof ApiError) {
    const { status, data } = err;
    if (status === 429) {
      const min = Math.ceil(Number(data.retryAfter ?? 900) / 60);
      return `Demasiados intentos fallidos. Espera ${min} min y vuelve a probar.`;
    }
    if (data.error === 'credenciales') {
      const left = data.remaining as number | undefined;
      return left !== undefined ? `Usuario o contraseña incorrectos. Te quedan ${left} intentos.` : 'Contraseña incorrecta.';
    }
    if (data.error === 'codigo') {
      const left = data.remaining as number | undefined;
      return left !== undefined ? `Código incorrecto. Te quedan ${left} intentos.` : 'Código incorrecto.';
    }
    if (data.error === 'caducado') return 'El paso de verificación ha caducado. Vuelve a escribir la contraseña.';
    if (data.error === 'ocupado') return 'Todavía está respondiendo al mensaje anterior.';
    if (status === 401) return 'La sesión ha caducado. Vuelve a entrar.';
    if (status === 404) return 'Ese proyecto ya no existe.';
    if (status === 400) return 'Datos no válidos.';
    return `Error del servidor (${status}).`;
  }
  return 'No se puede conectar con el servidor.';
}
