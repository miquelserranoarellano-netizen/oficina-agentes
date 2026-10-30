#!/usr/bin/env bash
# Actualiza la oficina en el VPS: copia de seguridad, baja los cambios, instala, compila y reinicia.
# Uso (desde la carpeta de la oficina):  bash deploy/actualizar.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "== Copia de seguridad de la base de datos"
if [ -f data/oficina.db ]; then node server/copia.ts; fi

echo "== Bajando cambios"
git pull --ff-only

echo "== Instalando dependencias"
npm ci

echo "== Compilando la web"
npm run build

mkdir -p data resultados

echo "== Reiniciando el servicio"
sudo systemctl restart oficina
sleep 2
systemctl --no-pager --lines=5 status oficina
