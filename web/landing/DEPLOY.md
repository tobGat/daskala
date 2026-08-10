# Landing-Page – `daskala.schulapps.at`

Statische Website (`index.html`, Logo/Icons, `daskala-og.png`, `robots.txt`,
`sitemap.xml`). Wird unter `daskala.schulapps.at` ausgeliefert
(nginx-Root `/var/www/daskala`).

Kein Build nötig – die Dateien werden direkt hochgeladen.

## Deploy (einfacher Weg – Server-Skript)

Im Alltag ändert sich nur `index.html`. Auf dem Server liegt das Skript
`/home/claude/deploy-daskala.sh`, das `~/daskala-deploy/index.html` nach
`/var/www/daskala/` kopiert, den nginx-Block schreibt, TLS via certbot sichert
und nginx neu lädt. Ablauf (aus `web/landing`):

```bash
# 1) neue index.html in den Quell-Ordner auf dem Server legen (kein sudo)
scp index.html claude@46.225.168.25:/home/claude/daskala-deploy/index.html

# 2) Deploy-Skript ausführen – fragt einmal das sudo-Passwort
ssh -t claude@46.225.168.25 "sudo bash /home/claude/deploy-daskala.sh"
```

Danach `daskala.schulapps.at` mit Strg+F5 neu laden.

> Wichtig: `deploy-daskala.sh` spielt **nur `index.html`** ein. Ändern sich auch
> Bilder/Icons/`robots.txt`/`sitemap.xml`, diese einmalig zusätzlich in den
> Webroot spiegeln:
> ```bash
> scp -r . claude@46.225.168.25:/tmp/daskala-landing
> ssh -t claude@46.225.168.25 "sudo rsync -a --delete --exclude DEPLOY.md /tmp/daskala-landing/ /var/www/daskala/ && sudo chown -R root:root /var/www/daskala && sudo nginx -t && sudo systemctl reload nginx"
> ```

(TLS/nginx-Site `daskala.schulapps.at` sind bereits eingerichtet.)

## Hinweis
Die Seite lädt Google Fonts und das Ko-fi-Widget extern – bewusst (Landing-Page,
nicht die App). Logo, Icons und OG-Bild werden dagegen selbst gehostet (kein
GitHub-Hotlink mehr, wichtig für Ladezeit/SEO). Die App selbst und der
Avatar-Editor sind vollständig offline/CDN-frei.
