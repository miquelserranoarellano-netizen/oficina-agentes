# Oficina de Miquel

Una oficina en pixel art (estilo videojuego de 16 bits) donde un equipo de agentes de IA, dirigido por un CEO, trabaja en mis proyectos.

> **Estado: fase 3 (agentes con IA y chat).** La oficina vive en el servidor, se guarda en SQLite y se ve en tiempo real, con login obligatorio. Con una clave de IA, Álex reparte trabajo y cada agente entrega su resultado en `resultados/`. También puedes chatear con cualquiera del equipo. Sin clave, los agentes simulan el trabajo. El plan completo está en [PLAN.md](PLAN.md).

## Arrancarla en local

Hace falta Node.js 22.18 o superior (probado con Node 24). No hay que compilar nada nativo.

```bash
npm install
npm run crear-usuario
npm run dev
```

1. `npm run crear-usuario` pide un usuario y una contraseña (mínimo 10 caracteres) y los guarda con bcrypt en `data/oficina.db`. Solo hay un usuario: volver a ejecutarlo lo sustituye y cierra sus sesiones.
2. `npm run dev` arranca dos cosas a la vez: la web (Vite) en <http://localhost:5180> y el servidor en el puerto 3001. Abre la web e inicia sesión.

No hace falta `.env` para probar en local. Las opciones están en [.env.example](.env.example).

## La IA

Copia `.env.example` como `.env` y pon la clave del proveedor que quieras usar:

| `LLM_PROVIDER` | Clave | Modelo por defecto | Coste |
|---|---|---|---|
| `gemini` (por defecto) | `GEMINI_API_KEY` ([Google AI Studio](https://aistudio.google.com/apikey)) | `gemini-3.5-flash-lite` | Plan gratuito con límites diarios |
| `groq` | `GROQ_API_KEY` ([console.groq.com](https://console.groq.com/keys)) | `openai/gpt-oss-120b` | Plan gratuito con límites diarios |
| `openrouter` | `OPENROUTER_API_KEY` ([openrouter.ai](https://openrouter.ai/keys)) | `openrouter/free` | Modelos gratuitos (unas 50 peticiones al día) |
| `ollama` | — (Ollama instalado en el mismo equipo) | `llama3.2` | Gratis, pero usa tu CPU y tu RAM |
| `anthropic` | `ANTHROPIC_API_KEY` ([console.anthropic.com](https://console.anthropic.com)) | `claude-opus-5-5` | **De pago**: 4 $ / 20 $ por millón de tokens (con `claude-haiku-5-5`, 0,10 $ / 0,50 $) |
| `simulado` | — | — | Gratis: respuestas de prueba para comprobar que todo funciona |

- **Otro modelo**: `LLM_MODEL`, o uno por agente con `LLM_MODEL_LEO`, `LLM_PROVIDER_NORA`, etc.
- **Límites del día**: `LIMITE_LLAMADAS_DIA` (50) y `LIMITE_GASTO_DIA_USD` (1 $). Al llegar a uno, la IA se para hasta el día siguiente y las tareas esperan en cola. En el panel se ve lo que se lleva hoy.
- **Sin cuota**: si el proveedor dice que no queda cuota, el agente lo dice en su bocadillo («Me he quedado sin cuota hoy»). La tarea vuelve a la cola y ese proveedor descansa 15 minutos antes de volver a intentarlo.
- **Con Claude** se activa el respaldo automático de Anthropic (`fallbacks: "default"`): si el modelo rechaza una petición por seguridad, otro modelo la responde dentro de la misma llamada.

### Cómo trabaja el equipo

- **Piloto automático** (interruptor del panel, apagado por defecto): cada `RITMO_CEO_MIN` minutos (20), si hay gente libre, Álex mira el estado de los proyectos y pide a la IA un reparto. Luego camina hasta cada agente y le da su tarea.
- **Chat**: elige con quién hablar y, si quieres, sobre qué proyecto. Si le pides algo a **Álex**, crea las tareas y las reparte en la oficina. Con los demás hablas directamente. Mientras responden, su personaje muestra «escribiendo…». El historial se guarda por agente y por proyecto.
- **Resultados**: cada tarea terminada se guarda en `resultados/<proyecto>/<fecha>_<agente>_<tarea>.md` y se lee desde el botón «Resultados» de cada proyecto. Nunca se sobrescribe un archivo.
- **Contexto**: con `PROYECTOS_DIR=..` en el `.env`, los agentes ven qué hay en la carpeta real de cada proyecto (nombres de archivos y el principio de su nota o README). **Solo lectura**: la app no escribe nada fuera de `resultados/` y `data/`.

### Desde el móvil por la wifi

La cookie de sesión solo viaja por HTTPS (`localhost` cuenta como seguro). Para entrar desde el móvil con `http://192.168.x.x:5180`, crea un `.env` con `COOKIE_SECURE=false` solo mientras pruebas. En el VPS siempre irá por HTTPS.

## Versión de producción

```bash
npm run build
npm start
```

`npm start` sirve la web compilada y la API en <http://127.0.0.1:3001>. Solo escucha en `127.0.0.1`: en el VPS, Caddy pone el HTTPS delante.

**Para publicarla en internet** en el VPS gratuito de Oracle (Caddy, DuckDNS y systemd), sigue [DEPLOY.md](DEPLOY.md). Los archivos de configuración están en [deploy/](deploy/).

## Seguridad

- **Sin sesión no hay nada**: ninguna ruta de `/api` ni el WebSocket responden sin una sesión válida.
- **Contraseña** guardada con bcrypt (coste 12). Si el usuario no existe, se tarda lo mismo en responder.
- **Sesión** con un token aleatorio en una cookie `httpOnly`, `secure` y `sameSite=strict`, que caduca a los 7 días. En la base de datos solo se guarda su hash. «Cerrar sesión» la borra y corta el WebSocket.
- **Límite de intentos**: 5 fallos por IP en 15 minutos bloquean esa IP hasta que pasen (cuentan la contraseña y el código 2FA). Detrás de Caddy se usa la IP real.
- **2FA opcional** con TOTP (Google Authenticator, Authy…). Se activa en Ajustes (botón ⚙) escaneando un QR. Cada código sirve una sola vez. Para desactivarla se pide la contraseña y un código actual.
- **Peticiones de otras webs**: solo se acepta JSON y se comprueba el origen en las peticiones que cambian algo y en el WebSocket.
- **Cabeceras**: CSP, `X-Frame-Options: DENY`, `nosniff`, `no-referrer`.

## Qué se ve

- **Despacho de Álex (CEO)**: Álex decide qué toca, camina hasta un agente, le dice la tarea en un bocadillo y vuelve.
- **Una mesa por proyecto** con su nombre y barra de progreso. Quien trabaja teclea y su monitor brilla con el color del proyecto.
- **Café** con cafetera, sofá, nevera y máquina de snacks, donde los agentes van al terminar.
- **Panel** con el estado del equipo, los proyectos (añadir, editar, eliminar) y el registro de actividad. Arriba: estado de la conexión, pausa, velocidad x1/x2/x4 y ajustes.

| Agente | Rol | Etiqueta | Rasgo |
|---|---|---|---|
| Álex | CEO | CEO | Traje y corbata |
| Leo | Programador | DEV | Cascos |
| Nora | Diseñadora | DIS | Boina |
| Iván | Guionista | GUI | Gafas |
| Sara | Marketing | MKT | Coleta |
| Hugo | Investigador | INV | Barba y bata |

La oficina sigue avanzando aunque nadie la mire. Si se reinicia el servidor, cada agente que estaba a medias vuelve a su mesa con su tarea. Eliminar un proyecto solo lo quita de la app: **nunca toca las carpetas de los proyectos**.

## Datos

Todo está en `data/oficina.db` (SQLite, fuera del repositorio): usuario, sesiones, intentos fallidos, proyectos, tareas, historial de actividad, chat y registro de llamadas a la IA (con tokens y coste). Los resultados de los agentes están en `resultados/`, también fuera del repositorio. «Reiniciar demo» vuelve a los proyectos de ejemplo. Para empezar de cero del todo, para el servidor y borra la carpeta `data/`.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Web en el 5180 y servidor en el 3001, recargando al guardar |
| `npm run crear-usuario` | Crea o sustituye el usuario |
| `npm run build` | Comprueba los tipos y compila la web en `dist/` |
| `npm start` | Servidor de producción (web compilada y API) |
| `npm run copia` | Copia de seguridad de la base de datos en `data/copias/` (guarda las 14 últimas) |
| `npm run check` | Solo comprueba los tipos |

## Estructura

```
shared/       código común del servidor y del navegador
  world.ts       el mundo de la oficina: agentes, coreografía y decisiones del CEO
  layout.ts      plano en casillas y búsqueda de caminos
  data.ts        equipo, proyectos de ejemplo y plantillas de tareas
  types.ts       tipos y mensajes del WebSocket
server/       Node + Fastify (TypeScript sin compilar: Node lo ejecuta directamente)
  index.ts       arranque
  app.ts         rutas de la API, WebSocket, cabeceras y web compilada
  auth.ts        contraseñas, sesiones y límite de intentos
  totp.ts        códigos 2FA (RFC 6238)
  db.ts          SQLite (módulo node:sqlite)
  office.ts      bucle del mundo, guardado, chat y emisión en tiempo real
  crear-usuario.ts
  copia.ts       copia de seguridad de SQLite
  llm/           capa común de IA: Gemini, Groq, OpenRouter y Ollama (formato OpenAI),
                 Claude (SDK oficial), simulado; límites del día y gasto
  agents/        prompts de cada rol, contexto de carpetas, reparto del CEO, chat y resultados
deploy/       servicio systemd, Caddyfile, script de DuckDNS y de actualización (ver DEPLOY.md)
src/          web en React
  net/           API y conexión en tiempo real (con reconexión)
  office/        dibujo en canvas: personajes, muebles, fondo, luces e interpolación
  components/    login, ajustes, controles, panel, IA, chat y resultados
```

Todo el arte está dibujado con código, sin imágenes externas. Las fuentes pixeladas vienen de npm, así que funciona sin conexión a internet. No hay dependencias nativas, así que funciona igual en ARM64.
