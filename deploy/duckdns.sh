#!/usr/bin/env bash
# Actualiza la IP de tu subdominio de DuckDNS. Lo ejecuta cron cada 5 minutos (ver DEPLOY.md).
# Lee DUCKDNS_DOMAIN (solo el nombre, sin .duckdns.org) y DUCKDNS_TOKEN de ~/duckdns/duckdns.env.
# Con «ip=» vacío, DuckDNS usa la IP desde la que llega la petición, que es la del VPS.
set -euo pipefail

source "$HOME/duckdns/duckdns.env"

# La URL va por la entrada estándar (-K -) para que el token no aparezca en la lista de procesos.
# A diferencia del ejemplo de DuckDNS, sin -k: el certificado de duckdns.org se comprueba.
echo url="https://www.duckdns.org/update?domains=${DUCKDNS_DOMAIN}&token=${DUCKDNS_TOKEN}&ip=" \
  | curl -sS -o "$HOME/duckdns/duck.log" -K -
