// Typ der IPC-Brücke `window.api` – automatisch aus preload.js abgeleitet.
// Keine Signaturen von Hand: `typeof` liest die echte Struktur aus dem
// exportierten `api`-Objekt, dadurch bleibt der Typ immer in Sync mit der Brücke.
// Zweck ist reine Editor-Autovervollständigung (kein Build-Schritt, kein TS-Umbau).

type DaskalaApi = (typeof import('../preload'))['api']

declare global {
  interface Window {
    api: DaskalaApi
  }
}

export {}
