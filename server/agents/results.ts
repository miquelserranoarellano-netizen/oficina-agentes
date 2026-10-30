import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { AGENTS } from '../../shared/data.ts';
import type { Project, Task } from '../../shared/types.ts';
import { config } from '../config.ts';

// Los agentes solo escriben aquí: resultados/<proyecto>/<fecha>_<agente>_<tarea>.md.
// Nunca sobrescriben: si el nombre ya existe, se añade un número.

function slug(text: string, max = 50): string {
  return (
    text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, max) || 'tarea'
  );
}

function stamp(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

/** Guarda el resultado y devuelve su ruta relativa (con / como separador). */
export function saveResult(project: Project, task: Task, text: string, model: string): string {
  const root = resolve(config.resultsDir);
  const dir = resolve(root, slug(project.id, 60));
  if (!dir.startsWith(root + sep)) throw new Error('Ruta de resultados no válida');
  mkdirSync(dir, { recursive: true });
  const agent = AGENTS.find((a) => a.id === task.agentId);
  const header = [
    '---',
    `proyecto: "${project.name.replace(/"/g, "'")}"`,
    `tarea: "${task.title.replace(/"/g, "'")}"`,
    `agente: ${agent?.name ?? task.agentId} (${agent?.roleName ?? ''})`,
    `fecha: ${new Date().toISOString()}`,
    `modelo: ${model}`,
    '---',
    '',
  ].join('\n');
  const base = `${stamp(new Date())}_${task.agentId}_${slug(task.title)}`;
  for (let n = 0; n < 100; n++) {
    const name = n === 0 ? `${base}.md` : `${base}-${n + 1}.md`;
    try {
      // 'wx': falla si ya existe, así nunca se pisa nada.
      writeFileSync(join(dir, name), header + text.trim() + '\n', { flag: 'wx', encoding: 'utf8' });
      return relative(resolve(config.resultsDir, '..'), join(dir, name)).split(sep).join('/');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    }
  }
  throw new Error('No se pudo elegir un nombre libre para el resultado');
}

/** Lee un resultado guardado (solo dentro de la carpeta de resultados). */
export function readResult(file: string): string {
  const root = resolve(config.resultsDir);
  const path = resolve(config.resultsDir, '..', file);
  if (!path.startsWith(root + sep)) throw new Error('Ruta de resultados no válida');
  return readFileSync(path, 'utf8');
}

/** Primeras líneas útiles (sin cabecera ni títulos) para dar contexto. */
export function summarize(text: string, max = 280): string {
  const plain = text
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('#') && !l.startsWith('---'))
    .join(' ')
    .replace(/[*_`>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > max ? `${plain.slice(0, max - 1)}…` : plain;
}
