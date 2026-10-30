import { buildApp } from './app.ts';
import { sweepTickets } from './auth.ts';
import { config } from './config.ts';
import { openDb } from './db.ts';
import { OfficeService } from './office.ts';

// Punto de entrada del servidor: `npm run dev` (con la web de Vite) o `npm start` (producción).

const store = openDb(config.dataDir);
const office = new OfficeService(store);
const app = await buildApp(store, office);

office.start();
const housekeeping = setInterval(() => {
  store.cleanup(Date.now() - 24 * 3600_000);
  sweepTickets();
}, 10 * 60_000);

await app.listen({ host: config.host, port: config.port });
app.log.info(`Oficina escuchando en http://${config.host}:${config.port}`);
if (store.userCount() === 0) {
  app.log.warn('Todavía no hay usuario: créalo con «npm run crear-usuario» para poder entrar.');
}

let closing = false;
const shutdown = async () => {
  if (closing) return;
  closing = true;
  clearInterval(housekeeping);
  office.stop();
  await app.close();
  store.db.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
