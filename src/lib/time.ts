// Conversion d'une heure HH:MM Paris-locale (saisie sur le formulaire de
// création de partie) en ISO 8601 UTC à stocker dans `rounds.started_at`.
//
// Le calcul est server-side (Cloudflare Worker en UTC) pour contourner un
// bug iOS Safari où `select.value` peut être stale au moment du submit
// quand le wheel picker reste ouvert. Le browser envoie quand même le bon
// `name=value` dans la form data via la mécanique de submit native, donc
// on lit `start_hour` et `start_minute` côté serveur et on calcule.

// Returns the current Europe/Paris UTC offset as an ISO-format string
// like "+02:00" (CEST in summer) or "+01:00" (CET in winter).
function parisOffsetString(date: Date): string {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Paris',
    timeZoneName: 'longOffset',
  });
  const parts = fmt.formatToParts(date);
  const tzName = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+01:00';
  // Examples: "GMT+02:00", "GMT+2", "GMT+02"
  const match = tzName.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
  if (!match) return '+01:00';
  const sign = match[1];
  const h = match[2].padStart(2, '0');
  const m = (match[3] ?? '00').padStart(2, '0');
  return `${sign}${h}:${m}`;
}

// Aujourd'hui à HH:MM Europe/Paris → ISO UTC string.
// Exemple : à 14:30 Paris CEST → "2026-05-14T12:30:00.000Z".
export function parisTimeToISO(hour: number, minute: number): string {
  const now = new Date();
  const dateFmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const today = dateFmt.format(now); // "YYYY-MM-DD"
  const offset = parisOffsetString(now); // "+02:00"
  const localIso = `${today}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00${offset}`;
  return new Date(localIso).toISOString();
}
