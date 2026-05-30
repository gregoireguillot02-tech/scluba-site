// Renifle les premiers octets d'un upload pour rejeter un polyglot/.html
// renommé `.png` avant qu'on lui fasse confiance (le Content-Type déclaré par
// le navigateur est contrôlé par l'attaquant). Partagé par l'endpoint d'upload
// d'assets et l'endpoint de détection IA du carnet.
export type SniffedImageMime = 'image/png' | 'image/jpeg' | 'image/webp';

export function detectImageMime(bytes: Uint8Array): SniffedImageMime | null {
  if (bytes.length >= 8 &&
      bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47 &&
      bytes[4] === 0x0D && bytes[5] === 0x0A && bytes[6] === 0x1A && bytes[7] === 0x0A) {
    return 'image/png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
    return 'image/jpeg';
  }
  if (bytes.length >= 12 &&
      bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return 'image/webp';
  }
  return null;
}
