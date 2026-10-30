# Desplegar la Oficina en el VPS gratuito de Oracle

Guía paso a paso para poner la Oficina de Miquel en internet, con HTTPS y gratis, en una máquina **Oracle Cloud Always Free** (Ampere A1 ARM64, Ubuntu 24.04). No hace falta saber de servidores: copia los comandos en orden.

## Qué vas a montar

```
Internet ──► puertos 80 y 443 ──► Caddy (HTTPS automático) ──► 127.0.0.1:3001 ──► la Oficina (servicio systemd)
                                                                                  └─ data/oficina.db (SQLite)
```

- **Caddy** consigue y renueva solo el certificado HTTPS de tu subdominio gratuito de **DuckDNS**.
- **La app** solo escucha en `127.0.0.1`: desde fuera no se puede llegar a ella si no es a través de Caddy.
- Hacia fuera solo quedan abiertos los puertos **22** (SSH), **80** y **443**.

Tiempo estimado: unos 45 minutos.

## Antes de empezar

- Una **instancia de Oracle** creada con la imagen **Canonical Ubuntu 24.04** y forma **VM.Standard.A1.Flex** (por ejemplo, 2 OCPU y 12 GB).
- Su **IP pública** (en la página de la instancia, «Public IP address»).
- La **clave SSH** que descargaste al crearla (por ejemplo, `oracle.key`).
- Una cuenta en **GitHub** (para descargar el código en el VPS) y otra en **DuckDNS** (entras con GitHub o Google).
- La clave de la IA que vayas a usar (por ejemplo, `GEMINI_API_KEY`). Opcional: sin clave, la oficina funciona en modo simulado.

En los comandos, cambia lo que va en MAYÚSCULAS (`IP_DEL_VPS`, `TU_USUARIO`, `TU-SUBDOMINIO`…) por tus datos.

---

## 1. Subir el código a GitHub (desde tu ordenador)

El VPS se descargará el código de un repositorio **privado** de GitHub. Desde la terminal de Ubuntu (WSL) en tu PC:

```bash
cd "/mnt/c/Users/mique/Documents/Obsidian Vault/Proyectos/oficina-agentes"
git init -b main
git config user.name "TU NOMBRE"
git config user.email "TU_CORREO"
git add .
git status
```

Revisa la lista de `git status`: **no** deben aparecer `.env`, `data/`, `resultados/` ni `node_modules/` (están en `.gitignore`). Si aparece alguno, para y revísalo antes de seguir.

```bash
git commit -m "Oficina de Miquel"
~/.local/bin/gh repo create oficina-agentes --private --source . --push
```

> **Sin GitHub**: puedes copiar la carpeta directamente al VPS (salta el paso 4 y usa esto desde la misma carpeta):
> ```bash
> tar --exclude=node_modules --exclude=data --exclude=resultados --exclude=dist --exclude=.env -czf - . | ssh -i RUTA/oracle.key ubuntu@IP_DEL_VPS "mkdir -p ~/oficina-agentes && tar -xzf - -C ~/oficina-agentes"
> ```
> Para actualizar, repites la copia y los pasos 5 y 8. El script `deploy/actualizar.sh` solo sirve con GitHub.

## 2. Entrar en el VPS

```bash
ssh -i RUTA/oracle.key ubuntu@IP_DEL_VPS
```

Todo lo que sigue se escribe **dentro del VPS**. Primero, pon el sistema al día:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl
```

## 3. Instalar Node.js 24

Con el repositorio oficial de NodeSource (tiene versión para ARM64):

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x -o nodesource_setup.sh
sudo -E bash nodesource_setup.sh
sudo apt install -y nodejs
node -v
```

Debe salir `v24.…`. Si el primer comando falla porque ese script ya no existe, usa `setup_lts.x` en su lugar (la app necesita Node 22.18 o superior).

## 4. Descargar la oficina

Crea una **clave de despliegue**: solo sirve para leer este repositorio y no da acceso a nada más de tu GitHub.

```bash
ssh-keygen -t ed25519 -C "oficina-vps" -f ~/.ssh/oficina_deploy -N ""
cat ~/.ssh/oficina_deploy.pub
```

Copia la línea que empieza por `ssh-ed25519`. En GitHub, ve al repositorio **oficina-agentes → Settings → Deploy keys → Add deploy key**, pégala con el título «VPS Oracle» y **no** marques «Allow write access».

Dile a SSH que use esa clave con GitHub y descarga el código:

```bash
cat >> ~/.ssh/config <<'EOF'
Host github.com
  IdentityFile ~/.ssh/oficina_deploy
  IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config
git clone git@github.com:TU_USUARIO/oficina-agentes.git ~/oficina-agentes
```

La primera vez pregunta si te fías de github.com: escribe `yes`.

## 5. Instalar y compilar

```bash
cd ~/oficina-agentes
npm ci
npm run build
mkdir -p data resultados
```

Si `npm ci` falla con un error de paquetes para `linux-arm64`, prueba `npm install` (regenera las dependencias para ARM).

## 6. Configurar el `.env`

```bash
cp .env.example .env
chmod 600 .env
nano .env
```

Lo importante:

- `API_HOST=127.0.0.1` y `API_PORT=3001`: déjalos así.
- `COOKIE_SECURE=true`: déjalo así (en el VPS todo va por HTTPS).
- La clave de la IA, por ejemplo `GEMINI_API_KEY=…`, y si quieres `LLM_PROVIDER`.
- Revisa `LIMITE_LLAMADAS_DIA` y `LIMITE_GASTO_DIA_USD`.
- `PROYECTOS_DIR`: déjalo vacío (tus carpetas de proyectos no están en el VPS).

Guarda con `Ctrl+O`, `Intro` y sal con `Ctrl+X`. El `.env` tiene permisos 600: solo tu usuario puede leerlo.

## 7. Crear tu usuario

```bash
npm run crear-usuario
```

Pide un usuario y una contraseña (mínimo 10 caracteres; mejor una larga y única). Mientras la escribes no se ve nada en pantalla: es normal.

## 8. Arrancar la oficina como servicio

El archivo `deploy/oficina.service` da por hecho que tu usuario es `ubuntu` y que la oficina está en `/home/ubuntu/oficina-agentes`. Si es así, no hay que tocar nada:

```bash
sudo cp deploy/oficina.service /etc/systemd/system/oficina.service
sudo systemctl daemon-reload
sudo systemctl enable --now oficina
systemctl status oficina
```

Debe decir **active (running)** (sal con `q`). El servicio arranca solo cada vez que se reinicia el VPS y, si la app se cae, se vuelve a levantar a los 5 segundos.

Comprueba que responde y que **solo** escucha en `127.0.0.1`:

```bash
curl -s http://127.0.0.1:3001/api/session
ss -tlnp | grep 3001
```

El primero devuelve `{"error":"sin-sesion",…}` (sin sesión no se ve nada: bien). El segundo debe mostrar `127.0.0.1:3001`, nunca `0.0.0.0:3001`.

## 9. Tu subdominio gratuito en DuckDNS

1. Entra en [duckdns.org](https://www.duckdns.org) e inicia sesión.
2. En «sub domain» escribe un nombre (por ejemplo, `oficina-miquel`) y pulsa **add domain**.
3. En la línea del dominio, escribe la IP pública del VPS en «current ip» y pulsa **update ip**.
4. Copia tu **token** (arriba, en la misma página). Es una contraseña: no lo compartas.

En el VPS, instala el script que mantiene la IP al día:

```bash
mkdir -p ~/duckdns
install -m 700 ~/oficina-agentes/deploy/duckdns.sh ~/duckdns/duck.sh
nano ~/duckdns/duckdns.env
```

Escribe estas dos líneas con tus datos (el dominio **sin** `.duckdns.org`) y guarda:

```
DUCKDNS_DOMAIN=TU-SUBDOMINIO
DUCKDNS_TOKEN=TU_TOKEN
```

```bash
chmod 600 ~/duckdns/duckdns.env
~/duckdns/duck.sh
cat ~/duckdns/duck.log
```

Debe salir `OK` (si sale `KO`, revisa el dominio y el token). Para que se repita cada 5 minutos:

```bash
crontab -e
```

Si pregunta qué editor usar, elige `nano` (1). Añade esta línea al final y guarda:

```
*/5 * * * * ~/duckdns/duck.sh >/dev/null 2>&1
```

## 10. Abrir los puertos 80 y 443

Hay **dos** cortafuegos y hay que abrir los dos.

### 10.1 En Oracle Cloud (Security List)

1. En la consola de Oracle: menú ☰ → **Networking → Virtual cloud networks**.
2. Entra en tu VCN → **Security** (o **Security Lists**) → **Default Security List for …**.
3. **Add Ingress Rules** y rellena:
   - Source Type: **CIDR**
   - Source CIDR: `0.0.0.0/0`
   - IP Protocol: **TCP**
   - Destination Port Range: `80`
4. Pulsa **Add Ingress Rules** y repite lo mismo con el puerto `443`.

No abras el 3001: la app no debe verse desde fuera. Si tu instancia usa un **Network Security Group**, añade las mismas dos reglas también allí.

### 10.2 En Ubuntu (iptables)

Las imágenes de Ubuntu de Oracle traen reglas de `iptables` que solo dejan pasar SSH. Oracle avisa de que **no** se use `ufw` en sus imágenes (puede impedir que la máquina arranque), así que se usa `iptables`, como en su propia guía:

```bash
sudo iptables -L INPUT --line-numbers
```

Busca la línea con `REJECT` (suele ser la 5 o la 6). Las reglas nuevas tienen que ir **antes** que ella. Si `REJECT` está en la 6:

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
sudo iptables -L INPUT --line-numbers
```

En el último listado, las dos reglas `ACCEPT` de `http` y `https` deben aparecer por encima de `REJECT`. Si `REJECT` estaba en otra posición, cambia el `6` por ese número.

## 11. Caddy con HTTPS automático

Instalación con el repositorio oficial de Caddy:

```bash
sudo apt install --yes debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg
sudo chmod o+r /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy
```

Pon la configuración de la oficina, cambiando `oficina-miquel` por tu subdominio:

```bash
sudo cp ~/oficina-agentes/deploy/Caddyfile /etc/caddy/Caddyfile
sudo sed -i 's/TU-SUBDOMINIO/oficina-miquel/' /etc/caddy/Caddyfile
cat /etc/caddy/Caddyfile
sudo systemctl reload caddy
journalctl -u caddy -n 30 --no-pager
```

En el registro de Caddy debe aparecer que ha obtenido el certificado («certificate obtained successfully»). Puede tardar un minuto. Si sale un error de «challenge», revisa los pasos 9 y 10: el subdominio tiene que apuntar a la IP del VPS y los puertos 80 y 443 tienen que estar abiertos.

## 12. Comprobar que todo funciona

1. En el navegador, abre `https://TU-SUBDOMINIO.duckdns.org`. Debe salir el login con el candado de conexión segura.
2. Entra con tu usuario. Arriba debe poner «En directo».
3. Pruébalo también desde el móvil **con los datos móviles** (sin wifi): así compruebas que se ve desde internet.
4. Muy recomendable: activa la **verificación en dos pasos** en Ajustes (⚙).
5. Desde tu PC, comprueba que el puerto de la app está cerrado. Este comando debe fallar o quedarse esperando hasta agotar el tiempo:

   ```bash
   curl -m 5 http://IP_DEL_VPS:3001/api/session
   ```

---

## El día a día

| Para… | Comando (en el VPS) |
|---|---|
| Actualizar a la última versión de GitHub | `cd ~/oficina-agentes && bash deploy/actualizar.sh` |
| Ver qué está haciendo la app | `journalctl -u oficina -f` (sal con `Ctrl+C`) |
| Reiniciar la app | `sudo systemctl restart oficina` |
| Ver el registro de Caddy | `journalctl -u caddy -n 50 --no-pager` |
| Cambiar el `.env` | `nano ~/oficina-agentes/.env` y después reiniciar la app |
| Cambiar usuario o contraseña | `cd ~/oficina-agentes && npm run crear-usuario` (cierra las sesiones y quita la 2FA) |
| Copia de seguridad ahora | `cd ~/oficina-agentes && npm run copia` |

`deploy/actualizar.sh` hace una copia de seguridad, descarga los cambios, instala, compila y reinicia.

### Copias de seguridad

`npm run copia` guarda una copia coherente de la base de datos en `data/copias/` (aunque la app esté en marcha) y conserva las 14 últimas. Para hacerla cada noche a las 4:00, añade esta línea con `crontab -e`:

```
0 4 * * * cd ~/oficina-agentes && /usr/bin/node server/copia.ts >> data/copias/copia.log 2>&1
```

Para llevarte las copias y los resultados a tu PC (desde tu PC):

```bash
scp -i RUTA/oracle.key -r ubuntu@IP_DEL_VPS:oficina-agentes/data/copias ubuntu@IP_DEL_VPS:oficina-agentes/resultados .
```

Para **restaurar** una copia:

```bash
sudo systemctl stop oficina
cd ~/oficina-agentes
cp data/copias/oficina-FECHA.db data/oficina.db
rm -f data/oficina.db-wal data/oficina.db-shm
sudo systemctl start oficina
```

## Si algo falla

| Síntoma | Qué mirar |
|---|---|
| La web no carga (tiempo de espera agotado) | Paso 10: Security List de Oracle **y** iptables, puertos 80 y 443. |
| Error de certificado o «connection refused» | `journalctl -u caddy`. ¿El subdominio apunta a la IP del VPS? (`cat ~/duckdns/duck.log` debe decir `OK`). |
| «502 Bad Gateway» | La app no está en marcha: `systemctl status oficina` y `journalctl -u oficina -n 50`. |
| La app no arranca: «Failed to set up mount namespacing» | Faltan carpetas: `mkdir -p ~/oficina-agentes/data ~/oficina-agentes/resultados`. |
| El login no se mantiene (vuelve a pedirlo) | Entra siempre por `https://`, nunca por la IP. Comprueba que `COOKIE_SECURE=true`. |
| «Demasiados intentos fallidos» | Son 5 fallos en 15 minutos desde la misma IP. Espera a que pasen (reiniciar no lo borra: está guardado en la base de datos). |
| Los agentes dicen «sin cuota» o «límite de hoy» | Es el plan gratuito o el límite del `.env`. Se reanuda solo (al día siguiente, en el caso del límite). |
| `npm ci` falla en ARM64 | Usa `npm install`. |

## Seguridad, en resumen

- Solo están abiertos el 22 (SSH con clave), el 80 (que Caddy redirige a HTTPS) y el 443.
- La app escucha en `127.0.0.1` y corre como servicio con permisos recortados: solo puede escribir en `data/` y `resultados/`.
- Sin sesión, la API y el WebSocket no responden. Hay límite de intentos de login y 2FA opcional.
- Los secretos están en `.env` y en `~/duckdns/duckdns.env`, ambos con permisos 600 y fuera de Git.
- Ubuntu suele traer activadas las actualizaciones de seguridad automáticas (`unattended-upgrades`). Aun así, de vez en cuando haz `sudo apt update && sudo apt upgrade -y`.
