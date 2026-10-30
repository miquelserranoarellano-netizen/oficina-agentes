import { existsSync } from 'node:fs';
import { join } from 'node:path';
import fastifyCookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import Fastify, { LogController, type FastifyReply, type FastifyRequest } from 'fastify';
import QRCode from 'qrcode';
import { AGENTS } from '../shared/data.ts';
import type { AgentId, ProjectInput, Speed } from '../shared/types.ts';
import { readResult } from './agents/results.ts';
import {
  checkPassword,
  COOKIE_NAME,
  cookieOptions,
  createTicket,
  dropTicket,
  hashToken,
  lockedFor,
  readTicket,
  startSession,
} from './auth.ts';
import { config } from './config.ts';
import type { Store, UserRow } from './db.ts';
import { ChatBusyError, type OfficeService } from './office.ts';
import { newSecret, otpauthUrl, verifyTotp } from './totp.ts';

// Servidor HTTP: API con sesión obligatoria, WebSocket de la oficina y, en producción, la web compilada.

interface Auth {
  user: UserRow;
  tokenHash: string;
}

const projectSchema = {
  type: 'object',
  required: ['name', 'description', 'color', 'progress', 'status'],
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 40 },
    description: { type: 'string', maxLength: 400 },
    color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
    progress: { type: 'number', minimum: 0, maximum: 100 },
    status: { type: 'string', enum: ['cola', 'curso', 'hecho'] },
  },
} as const;

const CSP = [
  "default-src 'self'",
  "img-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  // Vite incrusta como data: las fuentes pequeñas
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

export async function buildApp(store: Store, office: OfficeService) {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL || 'info' },
    logController: new LogController({ disableRequestLogging: true }),
    // Solo se confía en el proxy local (Caddy) para saber la IP real.
    trustProxy: 'loopback',
    bodyLimit: 64 * 1024,
  });
  // Solo JSON: un formulario de otra web no puede mandar peticiones válidas.
  app.removeContentTypeParser('text/plain');

  await app.register(fastifyCookie);
  await app.register(fastifyWebsocket, { options: { maxPayload: 4096 } });

  const auths = new WeakMap<FastifyRequest, Auth>();

  const sameOrigin = (req: FastifyRequest) => {
    const origin = req.headers.origin;
    if (!origin) return true;
    try {
      return new URL(origin).host === req.headers.host;
    } catch {
      return false;
    }
  };

  const readAuth = (req: FastifyRequest): Auth | undefined => {
    const token = req.cookies[COOKIE_NAME];
    if (!token) return undefined;
    const tokenHash = hashToken(token);
    const user = store.sessionUser(tokenHash);
    return user ? { user, tokenHash } : undefined;
  };

  // Se comprueba en onRequest: sin sesión no se llega ni a validar los datos.
  const requireAuth = async (req: FastifyRequest, reply: FastifyReply) => {
    const auth = readAuth(req);
    if (!auth) return reply.code(401).send({ error: 'sin-sesion' });
    auths.set(req, auth);
  };

  const authOf = (req: FastifyRequest) => auths.get(req)!;

  const tooMany = (reply: FastifyReply, seconds: number) =>
    reply.code(429).header('Retry-After', String(seconds)).send({ error: 'bloqueado', retryAfter: seconds });

  const failed = (ip: string) => {
    store.addFailure(ip);
    const remaining = config.loginMaxFailures - store.recentFailures(ip, Date.now() - config.loginWindowMin * 60_000, config.loginMaxFailures).length;
    return Math.max(0, remaining);
  };

  const openSession = (req: FastifyRequest, reply: FastifyReply, user: UserRow) => {
    const { token, maxAge } = startSession(store, user, req.ip, String(req.headers['user-agent'] ?? ''));
    store.clearFailures(req.ip);
    app.log.info({ ip: req.ip, user: user.username }, 'inicio de sesión');
    return reply
      .setCookie(COOKIE_NAME, token, { ...cookieOptions(), maxAge })
      .send({ username: user.username, totpEnabled: !!user.totp_secret });
  };

  app.addHook('onRequest', async (req, reply) => {
    if (req.method !== 'GET' && req.method !== 'HEAD' && !sameOrigin(req)) {
      return reply.code(403).send({ error: 'origen' });
    }
  });

  app.addHook('onSend', async (req, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('Cross-Origin-Opener-Policy', 'same-origin');
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (req.url.startsWith('/api')) {
      reply.header('Cache-Control', 'no-store');
    } else {
      // También en las respuestas 304 de la caché, que no llevan content-type.
      reply.header('Content-Security-Policy', CSP);
      const type = String(reply.getHeader('content-type') ?? '');
      if (type.startsWith('text/html')) reply.header('Cache-Control', 'no-cache');
    }
    return payload;
  });

  /* ---------- sesión ---------- */

  app.get('/api/session', async (req, reply) => {
    const auth = readAuth(req);
    if (!auth) return reply.code(401).send({ error: 'sin-sesion', needsUser: store.userCount() === 0 });
    return { username: auth.user.username, totpEnabled: !!auth.user.totp_secret };
  });

  app.post<{ Body: { username: string; password: string } }>(
    '/api/login',
    {
      schema: {
        body: {
          type: 'object',
          required: ['username', 'password'],
          additionalProperties: false,
          properties: { username: { type: 'string', maxLength: 64 }, password: { type: 'string', maxLength: 200 } },
        },
      },
    },
    async (req, reply) => {
      const locked = lockedFor(store, req.ip);
      if (locked) return tooMany(reply, locked);
      const user = store.findUser(req.body.username.trim());
      if (!(await checkPassword(user, req.body.password)) || !user) {
        const remaining = failed(req.ip);
        app.log.warn({ ip: req.ip }, 'contraseña incorrecta');
        if (remaining === 0) return tooMany(reply, lockedFor(store, req.ip));
        return reply.code(401).send({ error: 'credenciales', remaining });
      }
      if (user.totp_secret) return { needTotp: true, ticket: createTicket(user.id, req.ip) };
      return openSession(req, reply, user);
    },
  );

  app.post<{ Body: { ticket: string; code: string } }>(
    '/api/login/totp',
    {
      schema: {
        body: {
          type: 'object',
          required: ['ticket', 'code'],
          additionalProperties: false,
          properties: { ticket: { type: 'string', maxLength: 100 }, code: { type: 'string', maxLength: 10 } },
        },
      },
    },
    async (req, reply) => {
      const locked = lockedFor(store, req.ip);
      if (locked) return tooMany(reply, locked);
      const pending = readTicket(req.body.ticket, req.ip);
      const user = pending && store.userById(pending.userId);
      if (!pending || !user?.totp_secret) return reply.code(401).send({ error: 'caducado' });
      const step = verifyTotp(user.totp_secret, req.body.code, user.totp_last_step);
      if (step === null) {
        const remaining = failed(req.ip);
        app.log.warn({ ip: req.ip }, 'código 2FA incorrecto');
        if (remaining === 0) {
          dropTicket(req.body.ticket);
          return tooMany(reply, lockedFor(store, req.ip));
        }
        return reply.code(401).send({ error: 'codigo', remaining });
      }
      store.setTotpLastStep(user.id, step);
      dropTicket(req.body.ticket);
      return openSession(req, reply, user);
    },
  );

  app.post('/api/logout', async (req, reply) => {
    const auth = readAuth(req);
    if (auth) {
      store.deleteSession(auth.tokenHash);
      office.closeSessions((h) => h !== auth.tokenHash);
    }
    return reply.clearCookie(COOKIE_NAME, cookieOptions()).send({ ok: true });
  });

  /* ---------- 2FA ---------- */

  app.post('/api/2fa/setup', { onRequest: requireAuth }, async (req, reply) => {
    const { user } = authOf(req);
    if (user.totp_secret) return reply.code(409).send({ error: 'ya-activo' });
    const secret = newSecret();
    store.setTotpPending(user.id, secret);
    const url = otpauthUrl(secret, user.username, 'Oficina de Miquel');
    const qr = await QRCode.toDataURL(url, { margin: 1, width: 240 });
    return { secret, url, qr };
  });

  app.post<{ Body: { code: string } }>(
    '/api/2fa/enable',
    {
      onRequest: requireAuth,
      schema: {
        body: { type: 'object', required: ['code'], additionalProperties: false, properties: { code: { type: 'string', maxLength: 10 } } },
      },
    },
    async (req, reply) => {
      const { user } = authOf(req);
      if (!user.totp_pending) return reply.code(400).send({ error: 'sin-preparar' });
      const step = verifyTotp(user.totp_pending, req.body.code, 0);
      if (step === null) return reply.code(400).send({ error: 'codigo' });
      store.setTotp(user.id, user.totp_pending, step);
      app.log.info({ user: user.username }, '2FA activada');
      return { totpEnabled: true };
    },
  );

  app.post<{ Body: { password: string; code: string } }>(
    '/api/2fa/disable',
    {
      onRequest: requireAuth,
      schema: {
        body: {
          type: 'object',
          required: ['password', 'code'],
          additionalProperties: false,
          properties: { password: { type: 'string', maxLength: 200 }, code: { type: 'string', maxLength: 10 } },
        },
      },
    },
    async (req, reply) => {
      const locked = lockedFor(store, req.ip);
      if (locked) return tooMany(reply, locked);
      const { user } = authOf(req);
      if (!user.totp_secret) return { totpEnabled: false };
      const passwordOk = await checkPassword(user, req.body.password);
      const step = passwordOk ? verifyTotp(user.totp_secret, req.body.code, user.totp_last_step) : null;
      if (step === null) {
        failed(req.ip);
        return reply.code(400).send({ error: passwordOk ? 'codigo' : 'credenciales' });
      }
      store.setTotp(user.id, null, 0);
      app.log.info({ user: user.username }, '2FA desactivada');
      return { totpEnabled: false };
    },
  );

  /* ---------- oficina ---------- */

  app.get('/api/state', { onRequest: requireAuth }, async () => office.snapshot(true));

  app.post<{ Body: { paused?: boolean; speed?: Speed; autopilot?: boolean } }>(
    '/api/control',
    {
      onRequest: requireAuth,
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            paused: { type: 'boolean' },
            speed: { type: 'integer', enum: [1, 2, 4] },
            autopilot: { type: 'boolean' },
          },
        },
      },
    },
    async (req) => {
      office.control(req.body.paused, req.body.speed, req.body.autopilot);
      return { paused: office.world.paused, speed: office.world.speed, autopilot: office.world.autopilot };
    },
  );

  /* ---------- chat y resultados ---------- */

  const agentIds = AGENTS.map((a) => a.id);

  app.get<{ Querystring: { agent: AgentId; project?: string } }>(
    '/api/chat',
    {
      onRequest: requireAuth,
      schema: {
        querystring: {
          type: 'object',
          required: ['agent'],
          properties: { agent: { type: 'string', enum: agentIds }, project: { type: 'string', maxLength: 100 } },
        },
      },
    },
    async (req) => ({ messages: store.chatHistory(req.query.agent, req.query.project || null, 100) }),
  );

  app.post<{ Body: { agentId: AgentId; projectId?: string | null; text: string } }>(
    '/api/chat',
    {
      onRequest: requireAuth,
      schema: {
        body: {
          type: 'object',
          required: ['agentId', 'text'],
          additionalProperties: false,
          properties: {
            agentId: { type: 'string', enum: agentIds },
            projectId: { type: ['string', 'null'], maxLength: 100 },
            text: { type: 'string', minLength: 1, maxLength: 2000 },
          },
        },
      },
    },
    async (req, reply) => {
      try {
        const message = office.chat(req.body.agentId, req.body.projectId ?? null, req.body.text.trim());
        return reply.code(202).send({ message });
      } catch (err) {
        if (err instanceof ChatBusyError) return reply.code(409).send({ error: 'ocupado' });
        throw err;
      }
    },
  );

  app.get<{ Querystring: { project: string } }>(
    '/api/results',
    {
      onRequest: requireAuth,
      schema: {
        querystring: { type: 'object', required: ['project'], properties: { project: { type: 'string', maxLength: 100 } } },
      },
    },
    async (req) => ({ results: store.results(req.query.project) }),
  );

  app.get<{ Params: { taskId: string } }>('/api/results/:taskId', { onRequest: requireAuth }, async (req, reply) => {
    const task = store.taskById(req.params.taskId);
    if (!task?.resultFile) return reply.code(404).send({ error: 'no-encontrado' });
    try {
      return { title: task.title, agentId: task.agentId, projectId: task.projectId, file: task.resultFile, text: readResult(task.resultFile) };
    } catch {
      return reply.code(404).send({ error: 'no-encontrado' });
    }
  });

  app.post<{ Body: ProjectInput }>('/api/projects', { onRequest: requireAuth, schema: { body: projectSchema } }, async (req, reply) => {
    const project = office.world.addProject({ ...req.body, name: req.body.name.trim() });
    office.pushSnapshot();
    return reply.code(201).send(project);
  });

  app.put<{ Params: { id: string }; Body: ProjectInput }>(
    '/api/projects/:id',
    { onRequest: requireAuth, schema: { body: projectSchema } },
    async (req, reply) => {
      if (!office.world.updateProject(req.params.id, { ...req.body, name: req.body.name.trim() })) {
        return reply.code(404).send({ error: 'no-encontrado' });
      }
      office.pushSnapshot();
      return { ok: true };
    },
  );

  app.delete<{ Params: { id: string } }>('/api/projects/:id', { onRequest: requireAuth }, async (req, reply) => {
    if (!office.world.deleteProject(req.params.id)) return reply.code(404).send({ error: 'no-encontrado' });
    office.pushSnapshot();
    return reply.code(204).send();
  });

  app.post('/api/reset', { onRequest: requireAuth }, async () => {
    office.resetDemo();
    return { ok: true };
  });

  /* ---------- tiempo real ---------- */

  app.get(
    '/ws',
    {
      websocket: true,
      onRequest: async (req, reply) => {
        if (!sameOrigin(req)) return reply.code(403).send({ error: 'origen' });
        return requireAuth(req, reply);
      },
    },
    (socket, req) => {
      office.addClient(socket, authOf(req).tokenHash);
    },
  );

  // Cada minuto se cierran los WebSocket cuya sesión ha caducado o se ha cerrado.
  const revalidate = setInterval(() => office.closeSessions((h) => !!store.sessionUser(h)), 60_000);
  app.addHook('onClose', async () => clearInterval(revalidate));

  /* ---------- web compilada (producción) ---------- */

  if (existsSync(join(config.distDir, 'index.html'))) {
    await app.register(fastifyStatic, { root: config.distDir, wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api') && !req.url.startsWith('/ws')) {
        return reply.sendFile('index.html');
      }
      return reply.code(404).send({ error: 'no-encontrado' });
    });
  }

  return app;
}
