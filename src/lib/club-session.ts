// Session du Portail Club — cookie signé HMAC, stateless. Remplace la session
// magic-link Supabase pour /club/* : le membre se connecte avec un email
// autorisé + le mot de passe partagé du club, et on lui émet ce cookie.
//
// Format du token : `<body>.<sig>` où
//   body = base64url(JSON({ clubId, role, email, iat }))
//   sig  = base64url(HMAC-SHA256(body, key))
// La clé HMAC dérive de SUPABASE_SERVICE_ROLE_KEY (secret serveur déjà présent
// en prod — pas de nouveau secret Cloudflare à gérer), domain-séparée par un
// préfixe pour ne pas collisionner avec d'autres usages éventuels.
//
// Web Crypto uniquement (crypto.subtle) → marche identiquement sur le runtime
// Cloudflare Workers et en SSR/Node 18+.

import type { ClubRole } from './club-auth';

export const CLUB_SESSION_COOKIE = 'club_sess';
export const CLUB_SESSION_MAX_AGE_S = 60 * 60 * 24 * 30; // 30 jours

export interface ClubSessionPayload {
  clubId: string;
  role: ClubRole;
  email: string;
  // Empreinte du mot de passe du club au moment du login (cf.
  // portalCodeFingerprint). Le middleware la recompare au code courant : si /ops
  // régénère le code, l'empreinte ne matche plus → la session est révoquée.
  pc: string;
  iat: number; // epoch seconds (émission)
}

// --- base64url <-> bytes (sans dépendre de Buffer, absent sur Workers) ---
function bytesToB64url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// TextEncoder().encode() / nos Uint8Array sont typés Uint8Array<ArrayBufferLike>
// alors que Web Crypto attend BufferSource. Le cast est sûr (un Uint8Array EST
// un BufferSource au runtime) — friction de types TS 5.7, pas un souci runtime.
function buf(data: Uint8Array): BufferSource {
  return data as BufferSource;
}
function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

// Clé HMAC mise en cache par valeur de secret (re-dérive si le secret change —
// utile en test où l'on stub l'env).
let cachedKey: { secret: string; key: Promise<CryptoKey> } | null = null;
function getKey(): Promise<CryptoKey> {
  const secret = import.meta.env.SUPABASE_SERVICE_ROLE_KEY as string | undefined;
  if (!secret) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY for club session signing');
  if (cachedKey && cachedKey.secret === secret) return cachedKey.key;
  const key = crypto.subtle.importKey(
    'raw',
    buf(utf8('club-session-v1:' + secret)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
  cachedKey = { secret, key };
  return key;
}

/** Émet un token signé pour la session. `nowMs` injectable pour les tests. */
export async function signClubSession(
  payload: Omit<ClubSessionPayload, 'iat'>,
  nowMs: number = Date.now(),
): Promise<string> {
  const full: ClubSessionPayload = { ...payload, iat: Math.floor(nowMs / 1000) };
  const body = bytesToB64url(utf8(JSON.stringify(full)));
  const key = await getKey();
  const sig = await crypto.subtle.sign('HMAC', key, buf(utf8(body)));
  return `${body}.${bytesToB64url(new Uint8Array(sig))}`;
}

/**
 * Vérifie un token : signature HMAC valide ET non expiré. Retourne le payload
 * ou null (jamais d'exception sur token malformé/falsifié). `nowMs` injectable.
 */
export async function verifyClubSession(
  token: string | undefined | null,
  nowMs: number = Date.now(),
): Promise<ClubSessionPayload | null> {
  if (!token) return null;
  const dot = token.indexOf('.');
  if (dot <= 0 || dot === token.length - 1) return null;
  const body = token.slice(0, dot);
  const sigPart = token.slice(dot + 1);
  try {
    const key = await getKey();
    const ok = await crypto.subtle.verify(
      'HMAC',
      key,
      buf(b64urlToBytes(sigPart)),
      buf(utf8(body)),
    );
    if (!ok) return null;
    const json = new TextDecoder().decode(b64urlToBytes(body));
    const payload = JSON.parse(json) as ClubSessionPayload;
    if (
      !payload ||
      typeof payload.clubId !== 'string' ||
      (payload.role !== 'admin' && payload.role !== 'greenkeeper') ||
      typeof payload.email !== 'string' ||
      typeof payload.pc !== 'string' ||
      typeof payload.iat !== 'number'
    ) {
      return null;
    }
    // Expiration : iat + MAX_AGE dans le futur ?
    const ageS = Math.floor(nowMs / 1000) - payload.iat;
    if (ageS < 0 || ageS > CLUB_SESSION_MAX_AGE_S) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Empreinte courte et stable du mot de passe d'un club, scellée dans la session.
 * SHA-256(clubId:code) tronqué — sert UNIQUEMENT à détecter une régénération du
 * code (révocation), pas à protéger le code (ce n'est pas un hash de stockage).
 */
export async function portalCodeFingerprint(clubId: string, code: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buf(utf8(`${clubId}:${code}`)));
  return bytesToB64url(new Uint8Array(digest).slice(0, 12));
}

/** Comparaison à temps constant de deux chaînes (anti timing-attack). */
export function constantTimeEqual(a: string, b: string): boolean {
  const ab = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  // Longueurs différentes → on compare quand même contre `ab` pour ne pas
  // court-circuiter, puis on renvoie false.
  let diff = ab.length ^ bb.length;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ (bb[i] ?? 0);
  return diff === 0;
}
