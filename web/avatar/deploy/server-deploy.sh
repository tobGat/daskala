#!/usr/bin/env bash
# Läuft als root (via sudo) auf dem Server. Erwartet:
#   /tmp/avatar-dist/        (der Vite-Build)
#   /tmp/avatar-nginx.conf   (die nginx-Site)
set -euo pipefail

echo "→ Dateien nach /var/www/avatar"
mkdir -p /var/www/avatar
rsync -a --delete /tmp/avatar-dist/ /var/www/avatar/
chown -R www-data:www-data /var/www/avatar

echo "→ nginx-Site aktivieren"
cp /tmp/avatar-nginx.conf /etc/nginx/sites-available/avatar.schulapps.at
ln -sf /etc/nginx/sites-available/avatar.schulapps.at /etc/nginx/sites-enabled/avatar.schulapps.at
nginx -t
systemctl reload nginx

echo "→ TLS via certbot"
certbot --nginx -d avatar.schulapps.at --non-interactive --redirect --keep-until-expiring
nginx -t
systemctl reload nginx

echo "✓ FERTIG → https://avatar.schulapps.at"
