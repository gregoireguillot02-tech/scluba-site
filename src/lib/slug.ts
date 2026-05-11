// URL-safe alphabet without confusable chars (no 0/O, no 1/l/I).
const SLUG_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const SHORT_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function randomString(alphabet: string, length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

export function generateClubSlug(): string {
  return randomString(SLUG_ALPHABET, 10);
}

export function generateRoundShortCode(): string {
  return randomString(SHORT_CODE_ALPHABET, 6);
}
