# Landing-Page – `daskala.schulapps.at`

Statische Website (eine `index.html` + zwei Icons). Wird unter
`daskala.schulapps.at` ausgeliefert (nginx-Root `/var/www/daskala`).

Kein Build nötig – die Dateien werden direkt hochgeladen.

## Deploy  (aus web/landing)
```bash
ssh claude@46.225.168.25 "rm -rf /tmp/daskala-landing"
scp -r . claude@46.225.168.25:/tmp/daskala-landing
ssh -t claude@46.225.168.25 "sudo rsync -a --delete --exclude DEPLOY.md /tmp/daskala-landing/ /var/www/daskala/ && sudo chown -R www-data:www-data /var/www/daskala && sudo nginx -t && sudo systemctl reload nginx"
```
(TLS/nginx-Site `daskala.schulapps.at` sind bereits eingerichtet – hier reicht
das Ersetzen der Dateien.)

## Hinweis
Die Seite lädt Google Fonts, das Ko-fi-Widget und das Logo von GitHub – bewusst
externe Ressourcen (Landing-Page, nicht die App). Die App selbst und der
Avatar-Editor sind demgegenüber vollständig offline/CDN-frei.
