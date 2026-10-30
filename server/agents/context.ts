import { closeSync, existsSync, openSync, readdirSync, readSync, statSync } from 'node:fs';
import { basename, join, resolve, sep } from 'node:path';
import type { Project } from '../../shared/types.ts';
import { config, ROOT } from '../config.ts';

// Contexto de la carpeta real de cada proyecto (PROYECTOS_DIR), solo lectura y con límites:
// los nombres de lo que hay dentro y el principio de su nota o README. Nunca escribe nada.

const SKIP = new Set(['node_modules', '.git', 'dist', 'out', 'build', '.next', '.expo', '.venv', '__pycache__']);
const MAX_ENTRIES = 30;
const MAX_CHARS = 2500;
const CACHE_MS = 10 * 60_000;

const cache = new Map<string, { at: number; text: string }>();

function readHead(path: string, chars: number): string {
  const fd = openSync(path, 'r');
  try {
    const buf = Buffer.alloc(chars * 2);
    const n = readSync(fd, buf, 0, buf.length, 0);
    return buf.subarray(0, n).toString('utf8').slice(0, chars);
  } finally {
    closeSync(fd);
  }
}

function describeFolder(dir: string): string {
  const entries = readdirSync(dir, { withFileTypes: true })
    .filter((e) => !e.name.startsWith('.') && !SKIP.has(e.name))
    .slice(0, MAX_ENTRIES);
  const lines = [`Contenido de la carpeta: ${entries.map((e) => (e.isDirectory() ? `${e.name}/` : e.name)).join(', ') || '(vacía)'}`];
  const note = entries.find((e) => e.isFile() && /^readme\.md$/i.test(e.name)) ?? entries.find((e) => e.isFile() && e.name.endsWith('.md'));
  if (note) lines.push(`Inicio de ${note.name}:\n${readHead(join(dir, note.name), MAX_CHARS)}`);
  const pkg = join(dir, 'package.json');
  if (existsSync(pkg)) lines.push(`package.json:\n${readHead(pkg, 800)}`);
  // Un nivel más: muchas carpetas de proyecto solo tienen dentro otra carpeta con el código.
  for (const sub of entries.filter((e) => e.isDirectory()).slice(0, 3)) {
    const subDir = join(dir, sub.name);
    const names = readdirSync(subDir, { withFileTypes: true })
      .filter((e) => !e.name.startsWith('.') && !SKIP.has(e.name))
      .slice(0, 15)
      .map((e) => (e.isDirectory() ? `${e.name}/` : e.name));
    lines.push(`Dentro de ${sub.name}/: ${names.join(', ') || '(vacía)'}`);
    const subPkg = join(subDir, 'package.json');
    if (existsSync(subPkg)) lines.push(`${sub.name}/package.json:\n${readHead(subPkg, 600)}`);
  }
  return lines.join('\n\n');
}

/** Texto con lo que hay en la carpeta del proyecto, o '' si no hay carpeta configurada o no existe. */
export function folderContext(project: Project): string {
  const base = config.projectsDir;
  if (!base) return '';
  const hit = cache.get(project.id);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.text;
  let text = '';
  try {
    const dir = resolve(base, project.name);
    // Solo dentro de PROYECTOS_DIR, y nunca la propia oficina.
    const inside = dir.startsWith(resolve(base) + sep) && dir !== resolve(ROOT);
    if (inside && existsSync(dir) && statSync(dir).isDirectory()) {
      text = describeFolder(dir);
    } else if (inside && existsSync(`${dir}.md`)) {
      text = `Nota «${basename(dir)}.md»:\n${readHead(`${dir}.md`, MAX_CHARS)}`;
    }
  } catch {
    text = '';
  }
  cache.set(project.id, { at: Date.now(), text });
  return text;
}
