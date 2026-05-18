/**
 * Detection pure des "joyful events" pendant une partie de golf.
 *
 * Aucun state, aucune dépendance, aucun side-effect — tout est dérivé du
 * snapshot scores + pars + le trou qu'on vient de saisir. Ça rend la
 * fonction trivialement testable avec des scénarios fictifs (cf.
 * round-events.test.ts) et utilisable côté client immédiatement après
 * un save local, avant même que le fetch Supabase ait répondu.
 *
 * Branchement : play.astro appelle `detectEvent(scoresMap, parsByHole,
 * savedHole)` juste après avoir posé le nouveau strokes dans son state
 * local. Si un event tombe, on déclenche l'anim correspondante + l'éventuelle
 * ligne éditoriale (cf. templates.ts pour les textes + l'anti-spam).
 *
 * Les médailles recap (premier_birdie, regularite, comeback, boucle_propre)
 * arriveront en PR #2 via `detectMedals()` — pour l'instant on n'expose
 * que la détection live.
 */

/** Strokes saisis pour un trou. `null` = trou abandonné (pickup, compté par+2). */
export type ScoreValue = number | null;

/** Snapshot des scores d'un joueur : map hole → strokes (ou null pour pickup). */
export type ScoresMap = Readonly<Record<number, ScoreValue>>;

/** Map hole → par (extrait du parcours). */
export type ParsMap = Readonly<Record<number, number>>;

/**
 * Type discriminé des events détectables pendant la partie (live).
 *
 *  - `hole` : numéro du trou qui a déclenché l'event (utile pour les templates
 *    qui interpolent "Trou {n}").
 *  - `count` (streak_pars uniquement) : taille du streak au moment du fire.
 *
 * On ne renvoie qu'UN event à la fois. Si plusieurs candidatures sont possibles
 * (ex : Eagle qui est aussi le premier sub-par de la partie), on prend le plus
 * rare/marquant (priorité hio > eagle > first_birdie > declic > streak_pars).
 */
export type RoundEvent =
  | { type: 'first_birdie'; hole: number }
  | { type: 'eagle'; hole: number }
  | { type: 'hio'; hole: number }
  | { type: 'streak_pars'; hole: number; count: number }
  | { type: 'declic'; hole: number };

/** Helper : strokes effectifs d'un trou (pickup → par + 2). null = non saisi. */
function effective(strokes: ScoreValue | undefined, par: number): number | null {
  if (strokes === undefined) return null;
  if (strokes === null) return par + 2; // pickup
  return strokes;
}

/** Liste des numéros de trou saisis, dans l'ordre croissant. */
function playedHolesAsc(scores: ScoresMap): number[] {
  return Object.keys(scores)
    .map(Number)
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
}

/**
 * Détecte l'event le plus marquant déclenché par le score qu'on vient de
 * saisir au trou `savedHole`. Renvoie `null` si rien de spécial.
 *
 * Priorité (du plus narratif au plus factuel) :
 *   1. hio          — score = 1 sur par 3+
 *   2. eagle        — par - 2
 *   3. declic       — sub-par après ≥5 holes consécutifs over-par
 *                     (passe avant first_birdie : si c'est aussi le 1er
 *                     birdie de la partie, le récit "déclic" est plus
 *                     fort que le constat "premier birdie")
 *   4. first_birdie — premier sub-par hole de la partie
 *   5. streak_pars  — ≥3 pars d'affilée, re-fire uniquement à 3 et à 5
 */
export function detectEvent(
  scores: ScoresMap,
  pars: ParsMap,
  savedHole: number,
): RoundEvent | null {
  const par = pars[savedHole];
  const raw = scores[savedHole];
  if (par === undefined || raw === undefined) return null;
  // Pickup (null) ne déclenche aucun event de célébration — c'est l'inverse.
  if (raw === null) return null;
  const strokes = raw;
  const diff = strokes - par;

  // 1. Hole-in-one : score = 1, seulement intéressant si par >= 3 (sinon
  //    c'est un putt sur un par 3 inexistant, on garde simple = HIO si
  //    strokes === 1).
  if (strokes === 1 && par >= 3) {
    return { type: 'hio', hole: savedHole };
  }

  // 2. Eagle : 2 sous le par (mais pas un HIO, déjà capté au-dessus).
  if (diff === -2) {
    return { type: 'eagle', hole: savedHole };
  }

  // 3. Declic : sub-par au trou courant ET les 5 trous joués juste avant
  //    étaient tous over-par. Récit "redressement" plus fort qu'un simple
  //    constat "premier birdie" — d'où la priorité au-dessus.
  if (diff < 0) {
    const playedBefore = playedHolesAsc(scores).filter((h) => h !== savedHole);
    if (playedBefore.length >= 5) {
      const last5 = playedBefore.slice(-5);
      const allOver = last5.every((h) => {
        const p = pars[h];
        const eff = effective(scores[h], p);
        if (eff === null || p === undefined) return false;
        return eff - p > 0;
      });
      if (allOver) return { type: 'declic', hole: savedHole };
    }
  }

  // 4. First birdie : ce trou est sub-par ET c'est le premier sub-par
  //    saisi de la partie.
  if (diff <= -1) {
    const isFirst = playedHolesAsc(scores).every((h) => {
      if (h === savedHole) return true;
      const p = pars[h];
      const eff = effective(scores[h], p);
      if (eff === null || p === undefined) return true; // ignore
      return eff - p >= 0; // pas sub-par
    });
    if (isFirst) return { type: 'first_birdie', hole: savedHole };
  }

  // 5. Streak pars : ce trou est un par, ET il forme un streak ≥ 3 avec
  //    les trous précédents JOUÉS (dans l'ordre croissant des numéros).
  //    Re-fire uniquement aux paliers 3 et 5 — au-delà on laisse vivre.
  if (diff === 0) {
    const ordered = playedHolesAsc(scores);
    // On compte la run terminée par savedHole.
    let count = 0;
    for (let i = ordered.length - 1; i >= 0; i--) {
      const h = ordered[i];
      const p = pars[h];
      const eff = effective(scores[h], p);
      if (eff === null || p === undefined) break;
      if (eff - p === 0) count++;
      else break;
    }
    if (count === 3 || count === 5) {
      return { type: 'streak_pars', hole: savedHole, count };
    }
  }

  return null;
}
