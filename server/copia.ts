import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.ts';

// `npm run copia`: copia de seguridad coherente de la base de datos (aunque el servidor esté en marcha)
// en data/copias/. Guarda las 14 más recientes y borra solo copias suyas más antiguas.

const KEEP = 14;
const source = join(config.dataDir, 'oficina.db');
if (!existsSync(source)) {
  console.error(`No existe ${source}: todavía no hay nada que copiar.`);
  process.exit(1);
}

const dir = join(config.dataDir, 'copias');
mkdirSync(dir, { recursive: true });
const now = new Date();
const pad = (n: number) => String(n).padStart(2, '0');
const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}-${pad(now.getMinutes())}`;
const target = join(dir, `oficina-${stamp}.db`);

const db = new DatabaseSync(source, { readOnly: true });
db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
db.close();

const copies = readdirSync(dir)
  .filter((f) => /^oficina-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}\.db$/.test(f))
  .sort();
for (const old of copies.slice(0, Math.max(0, copies.length - KEEP))) rmSync(join(dir, old));

console.log(`Copia guardada en ${target}`);
