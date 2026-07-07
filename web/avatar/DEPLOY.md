# Avatar-Werkstatt – `avatar.schulapps.at`

Statischer Avatar-Editor für Schüler:innen. Erzeugt einen Code (`DSK1-…`), den
die Lehrkraft in Daskala (Avatar-Editor → „Code einfügen") übernimmt.

Liegt jetzt im Daskala-Repo unter `web/avatar/`.

Wichtig: **DiceBear-Version und Paletten müssen mit Daskala identisch bleiben**
(`@dicebear/lorelei` **9.4.2**; `src/avatar.js` = Kopie des Codecs/Paletten aus
`../../renderer/utils/avatar.js`), sonst passen die Codes nicht mehr.
Alles ist lokal gebündelt – **keine externen CDNs/Fonts** (DSGVO).

## 1. Lokal bauen  (aus dem Repo-Root)
```bash
cd web/avatar
npm install
npm run build      # erzeugt dist/
```

## 2. DNS
`avatar.schulapps.at` zeigt bereits per A-Record auf den Server (46.225.168.25).

## 3. Hochladen  (aus web/avatar)
```bash
# Temp-Ordner leeren und dist + Configs hochladen (scp legt /tmp/avatar-dist an).
# Hinweis: NICHT die Form "dist/." verwenden – die erwartet ein bereits
# existierendes Zielverzeichnis und schlägt sonst mit "path canonicalization failed" fehl.
ssh claude@46.225.168.25 "rm -rf /tmp/avatar-dist"
scp -r dist claude@46.225.168.25:/tmp/avatar-dist
scp deploy/nginx.conf   claude@46.225.168.25:/tmp/avatar-nginx.conf
scp deploy/server-deploy.sh claude@46.225.168.25:/tmp/avatar-deploy.sh
```

## 4. Auf dem Server einrichten  (ein Befehl, fragt einmal das sudo-Passwort)
```bash
ssh -t claude@46.225.168.25 "sudo bash /tmp/avatar-deploy.sh"
```
`server-deploy.sh` kopiert nach `/var/www/avatar`, aktiviert die nginx-Site
`avatar.schulapps.at`, holt TLS via certbot (nicht-interaktiv) und setzt den
http→https-Redirect.

## 5. Aktualisieren (späterer Re-Deploy)
```bash
cd web/avatar && npm run build
ssh claude@46.225.168.25 "rm -rf /tmp/avatar-dist"
scp -r dist claude@46.225.168.25:/tmp/avatar-dist
ssh -t claude@46.225.168.25 "sudo rsync -a --delete /tmp/avatar-dist/ /var/www/avatar/ && sudo chown -R www-data:www-data /var/www/avatar"
```

## Test
`https://avatar.schulapps.at` öffnen → Avatar bauen → „Code kopieren" →
den Code in Daskala im Avatar-Editor einfügen → derselbe Avatar erscheint.
