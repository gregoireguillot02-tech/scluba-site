/**
 * Partage d'une URL via la feuille de partage native (Web Share API), avec
 * repli clipboard puis prompt.
 *
 * Utilisé par le bouton « M'envoyer le lien » du lobby et de la partie : le
 * joueur s'envoie l'URL de sa partie là où il veut (Messages, WhatsApp,
 * Notes…) → un lien durable CHEZ LUI pour revenir s'il se déconnecte, sans
 * qu'on ait à collecter de numéro ni à payer une ligne SMS.
 *
 * Renvoie le mode réellement utilisé, pour adapter le feedback UI.
 */
export type ShareResult = 'shared' | 'copied' | 'prompted' | 'cancelled';

export async function shareRoundUrl(url: string, title: string): Promise<ShareResult> {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ url, title });
      return 'shared';
    } catch (err) {
      // L'utilisateur a fermé la feuille de partage → ne PAS retomber sur un
      // copier qui afficherait un faux « Lien copié ✓ ».
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
      // Autre échec (rare) → on tente le repli clipboard ci-dessous.
    }
  }
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(url);
      return 'copied';
    }
  } catch {
    /* clipboard indisponible (permission, http) → prompt */
  }
  try {
    window.prompt('Copie ce lien :', url);
  } catch {
    /* noop */
  }
  return 'prompted';
}
