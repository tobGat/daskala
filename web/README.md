# web/ – Websites rund um Daskala

Neben der Desktop-App (Repo-Root) gehören zwei Web-Bausteine zu Daskala:

- **`landing/`** – die Website unter **daskala.schulapps.at** (statische `index.html`).
- **`avatar/`** – der **Avatar-Editor für Schüler:innen** unter **avatar.schulapps.at**.
  Schüler:innen bauen dort ihren Avatar und schicken der Lehrkraft einen Code
  (`DSK1-…`), der in der App (Avatar-Editor → „Code einfügen") übernommen wird.
  Nutzt dieselbe DiceBear-Version/Paletten/Codec wie die App
  (`../renderer/utils/avatar.js`), damit die Codes 1:1 passen.

Jeweils eine `DEPLOY.md` im Unterordner beschreibt die Auslieferung.
