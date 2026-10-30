# Plan de la Oficina de Miquel

Cada fase se enseña y espera el visto bueno antes de empezar la siguiente.

## Reglas que valen para todas las fases

- La app vive solo en `oficina-agentes/`. Nunca modifica, borra ni sobrescribe nada de las carpetas de los proyectos: los agentes solo escriben en `resultados/<proyecto>/`.
- Antes de cualquier acción que cueste dinero o que toque algo fuera de `oficina-agentes/`, se pregunta.
- Los secretos van en `.env`, que está en `.gitignore`. `.env.example` documenta las variables.
- Todo tiene que funcionar en ARM64 (Oracle Ampere A1). Se evitan dependencias nativas o se eligen las que tienen binario para ARM64.

## Fase 1: simulación visual ✅

Oficina en pixel art en un `<canvas>`, con agentes simulados y progreso de ejemplo, panel lateral, pausa y velocidad, alta, edición y borrado de proyectos, y versión para el móvil.

## Fase 2: servidor, datos y acceso ✅

- **Servidor** en Node.js y TypeScript (Fastify) con WebSocket. El motor de la simulación (`shared/world.ts`) corre en el servidor y el navegador solo dibuja lo que recibe, interpolando 10 fotogramas por segundo. Node ejecuta el TypeScript directamente, sin paso de compilación.
- **SQLite** con `node:sqlite`, que viene con Node y no necesita compilar nada en ARM64. Guarda proyectos, tareas, historial de actividad, ajustes, usuario, sesiones e intentos fallidos.
- **Login obligatorio**:
  - Un único usuario, creado con `npm run crear-usuario`, que pide el usuario y la contraseña y guarda el hash con bcrypt (`bcryptjs`, sin compilación nativa).
  - Sesión con cookie `httpOnly`, `secure` y `sameSite=strict`, y botón para cerrar sesión.
  - Como máximo 5 intentos fallidos por IP cada 15 minutos.
  - 2FA opcional con TOTP (Google Authenticator), que se activa desde una pantalla de ajustes con su código QR.
  - Ninguna ruta de la API ni el WebSocket responden sin una sesión válida.
- El servidor escucha en `127.0.0.1` por defecto (`API_HOST` y `API_PORT`).
- Extras: comprobación de origen, solo JSON, cabeceras de seguridad (CSP…), reconexión automática del WebSocket y los agentes que estaban a medias retoman su tarea al reiniciar.

## Fase 3: agentes con IA y chat ✅

Hecho tal como se describe abajo. Además: proveedor «simulado» para probar sin gastar, piloto automático apagado por defecto (interruptor en el panel), cola de tareas (lo que el CEO decide en el chat o con IA espera a su agente), contexto de solo lectura de las carpetas reales (`PROYECTOS_DIR`) y visor de resultados en la app. Probado con el proveedor simulado; los proveedores reales están escritos según su documentación pero falta probarlos con una clave.

- **Capa `llm/`** con una interfaz común y adaptadores para Gemini (el de por defecto, con plan gratuito), Groq, OpenRouter, Ollama local y Anthropic (Claude).
  - Se elige con `LLM_PROVIDER` y `LLM_MODEL` en `.env`, y cada agente puede usar un modelo distinto.
  - Si el proveedor devuelve un error de cuota, el agente lo dice en su bocadillo («me he quedado sin cuota hoy») en vez de romper la app.
- **El CEO** usa la IA para leer el estado de los proyectos, decidir prioridades y repartir tareas. Cada agente ejecuta su tarea con su prompt de rol y guarda el resultado (texto, guion, ideas, código propuesto) en `resultados/<proyecto>/`.
- **Chat**: una pantalla para hablar con el CEO (que reparte el trabajo) o directamente con un agente. Mientras se genera la respuesta, el personaje muestra «escribiendo…» en la oficina. El historial se guarda por agente y por proyecto.
- **Límites diarios** configurables de llamadas y de gasto, y en la app se ve cuánto se lleva hoy.

## Fase 4: despliegue gratis en Oracle (Ubuntu 24.04 ARM64) ✅ (preparado; falta hacerlo en el VPS)

En `deploy/` están el servicio systemd (con permisos recortados), el `Caddyfile`, el script de DuckDNS y el de actualización. `npm run copia` hace copias de seguridad de SQLite y [DEPLOY.md](DEPLOY.md) es la guía completa. Comprobado en local: la sintaxis de los scripts, la unidad systemd, la copia de seguridad y que el lockfile trae los binarios de linux-arm64. El despliegue real en el VPS no se ha hecho todavía.

- **Caddy** como proxy inverso, con HTTPS automático para un subdominio de DuckDNS. Se incluirán el `Caddyfile` y un cron que actualice la IP en DuckDNS.
- La app corre como **servicio systemd** (o pm2), arranca sola al reiniciar y escucha solo en `127.0.0.1`. Hacia fuera solo quedan abiertos los puertos 80 y 443 de Caddy.
- `DEPLOY.md` explicará paso a paso, para principiantes, cómo instalar Node, clonar el repositorio, configurar `.env`, crear el usuario, configurar DuckDNS y Caddy, abrir los puertos en la Security List de Oracle y en el firewall de Ubuntu, y comprobar que todo funciona.
