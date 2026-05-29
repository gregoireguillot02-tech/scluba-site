// Génère le mot de passe partagé d'un club pour le Portail Club.
// Forme : PREFIXE + 6 chiffres + 1 symbole, ex. TEOULA204815@, CAENLAMER739204!
// — le préfixe dérive du nom du club (accents retirés, alphanumérique majuscule)
// pour rester mémorisable. ATTENTION : le nom du club est PUBLIC donc devinable,
// l'entropie secrète vient uniquement des 6 chiffres + symbole (10^6 × 5 = 5M) ;
// combinée au rate-limit de /club/login, le brute-force en ligne est impraticable.
// Le hasard vient de crypto.getRandomValues (dispo Workers + Node 18+).

const SYMBOLS = '@!#$%';
const MAX_PREFIX = 12;

/** Dérive un préfixe alphanumérique majuscule à partir du nom du club. */
export function clubCodePrefix(clubName: string): string {
  const cleaned = clubName
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '') // retire les accents (combining marks)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, MAX_PREFIX);
  return cleaned || 'CLUB';
}

// Entier uniforme dans [0, max) via rejection sampling sur un octet aléatoire
// (évite le biais modulo). max doit valoir ≤ 256.
function randomInt(max: number): number {
  const limit = Math.floor(256 / max) * max;
  const buf = new Uint8Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % max;
  }
}

/** Génère un mot de passe club complet à partir de son nom. */
export function generateClubCode(clubName: string): string {
  const prefix = clubCodePrefix(clubName);
  let digits = '';
  for (let i = 0; i < 6; i++) digits += String(randomInt(10));
  const symbol = SYMBOLS[randomInt(SYMBOLS.length)];
  return `${prefix}${digits}${symbol}`;
}

/** Regex de validation de forme (utilisé en test et dispo si besoin ailleurs). */
export const CLUB_CODE_RE = /^[A-Z0-9]{1,12}\d{6}[@!#$%]$/;
