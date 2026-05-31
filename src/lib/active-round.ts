/**
 * Pointeur « partie en cours » côté device (localStorage).
 *
 * Problème résolu : le cookie `scluba_player_{code}` garde le joueur connecté
 * 7 jours, MAIS le joueur n'a aucun moyen À LUI de RETROUVER l'URL `/r/{code}`
 * une fois la PWA / l'onglet fermé — le code à 6 chars n'est pas mémorisable et
 * l'URL ne vit que dans le QR du comptoir. Dès qu'il ferme tout, il est perdu
 * alors que son cookie l'attend. Ce module mémorise localement la dernière
 * partie active → la page club peut proposer un bandeau « Reprendre ma partie »
 * en 1 tap, sans re-scan ni re-saisie.
 *
 * Volontairement minimal : une seule partie mémorisée (la plus récente), AUCUNE
 * donnée sensible (pas de token — juste de quoi reconstruire un lien public et
 * pré-remplir un prénom), et un garde-fou de fraîcheur pour ne jamais proposer
 * une partie d'hier. Dégrade proprement en navigation privée : toutes les
 * opérations sont en try/catch, comme `score-sync`.
 */

const KEY = 'scluba:active-round';
/** Au-delà de 12 h, on considère la partie finie/abandonnée → pas de bandeau. */
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

export interface ActiveRound {
  shortCode: string;
  clubSlug: string;
  clubName: string;
  playerName: string;
  /** Timestamp (ms) de la dernière fois où le joueur était dans la partie. */
  ts: number;
}

/** Accès localStorage tolérant (peut throw en mode privé strict / SSR). */
function store(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/** Mémorise la partie courante (appelé au lobby et en cours de partie). */
export function saveActiveRound(r: Omit<ActiveRound, 'ts'>): void {
  const s = store();
  if (!s) return;
  if (!r.shortCode || !r.clubSlug) return;
  try {
    const value: ActiveRound = { ...r, ts: Date.now() };
    s.setItem(KEY, JSON.stringify(value));
  } catch {
    /* quota plein / mode privé restrictif : non bloquant */
  }
}

/** La partie active mémorisée, ou null si absente / périmée / corrompue. */
export function getActiveRound(): ActiveRound | null {
  const s = store();
  if (!s) return null;
  try {
    const raw = s.getItem(KEY);
    if (!raw) return null;
    const r = JSON.parse(raw) as Partial<ActiveRound>;
    if (
      typeof r.shortCode !== 'string' ||
      typeof r.clubSlug !== 'string' ||
      typeof r.clubName !== 'string' ||
      typeof r.playerName !== 'string' ||
      typeof r.ts !== 'number'
    ) {
      return null;
    }
    if (Date.now() - r.ts > MAX_AGE_MS) {
      // Périmée → on nettoie pour ne pas reproposer un bandeau fantôme.
      try {
        s.removeItem(KEY);
      } catch {
        /* noop */
      }
      return null;
    }
    return r as ActiveRound;
  } catch {
    return null;
  }
}

/**
 * Efface le pointeur (appelé en fin de partie). Si `shortCode` est fourni, on
 * n'efface QUE si c'est bien la partie mémorisée — évite qu'un vieil onglet
 * recap d'une autre partie supprime une partie active plus récente.
 */
export function clearActiveRound(shortCode?: string): void {
  const s = store();
  if (!s) return;
  try {
    if (shortCode) {
      const raw = s.getItem(KEY);
      if (raw) {
        const r = JSON.parse(raw) as Partial<ActiveRound>;
        if (typeof r.shortCode === 'string' && r.shortCode !== shortCode) return;
      }
    }
    s.removeItem(KEY);
  } catch {
    /* noop */
  }
}
