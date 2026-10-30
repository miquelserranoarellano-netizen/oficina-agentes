import { createInterface } from 'node:readline/promises';
import { hashPassword } from './auth.ts';
import { config } from './config.ts';
import { openDb } from './db.ts';

// `npm run crear-usuario`: crea (o sustituye) el único usuario de la app.
// La contraseña se guarda con bcrypt; nunca en claro.

const MIN_LENGTH = 10;

/** Lee una línea sin mostrar lo que se escribe (si la entrada es una terminal). */
function askHidden(prompt: string): Promise<string> {
  const stdin = process.stdin;
  if (!stdin.isTTY) return askLine(prompt);
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    let value = '';
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          process.stdout.write('\n');
          resolve(value);
          return;
        }
        if (ch === '\u0003') {
          process.stdout.write('\n');
          process.exit(130);
        }
        if (ch === '\u007f' || ch === '\b') {
          value = value.slice(0, -1);
        } else if (ch >= ' ') {
          value += ch;
        }
      }
    };
    stdin.on('data', onData);
  });
}

// Con la entrada redirigida (sin terminal) se leen las líneas en orden.
let lines: AsyncIterator<string> | undefined;
async function askLine(prompt: string): Promise<string> {
  process.stdout.write(prompt);
  if (process.stdin.isTTY) {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: false });
    const answer = await rl.question('');
    rl.close();
    return answer;
  }
  lines ??= createInterface({ input: process.stdin, terminal: false })[Symbol.asyncIterator]();
  const next = await lines.next();
  process.stdout.write('\n');
  return next.done ? '' : next.value;
}

const store = openDb(config.dataDir);
console.log('\nCrear el usuario de la Oficina de Miquel\n');

const existing = store.db.prepare('SELECT username FROM users LIMIT 1').get() as { username: string } | undefined;
if (existing) {
  const answer = (await askLine(`Ya existe el usuario «${existing.username}». ¿Sustituirlo? Se cerrarán sus sesiones y se quitará su 2FA (s/N): `))
    .trim()
    .toLowerCase();
  if (answer !== 's' && answer !== 'si' && answer !== 'sí') {
    console.log('No se ha cambiado nada.');
    process.exit(0);
  }
}

let username = '';
while (!/^[\w.@-]{3,64}$/.test(username)) {
  username = (await askLine('Usuario (letras, números, . _ - @; mínimo 3): ')).trim();
}

let password = '';
for (;;) {
  password = await askHidden(`Contraseña (mínimo ${MIN_LENGTH} caracteres): `);
  if (password.length < MIN_LENGTH) {
    console.log(`Demasiado corta: usa al menos ${MIN_LENGTH} caracteres.`);
    continue;
  }
  const repeat = await askHidden('Repite la contraseña: ');
  if (repeat !== password) {
    console.log('No coinciden. Prueba otra vez.');
    continue;
  }
  break;
}

store.replaceUser(username, await hashPassword(password));
store.db.close();
console.log(`\nListo: ya puedes entrar como «${username}». La 2FA se activa desde Ajustes, dentro de la app.`);
process.exit(0);
