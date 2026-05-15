/**
 * Helpers de génération d'avatars joueurs — partagés entre play.astro,
 * recap.astro, et (à venir) Leaderboard.astro / Masthead.astro.
 *
 * Pattern : couleur HSL stable dérivée du player_id (hash simple) +
 * initiale du prénom. Même couleur au refresh — repère visuel constant
 * pendant toute la partie.
 *
 * Dédupliqué depuis play.astro:309-313 et recap.astro:179-186 où ces
 * fonctions étaient identiques mais copiées.
 */

/** Hash simple → hue 0..360. Stable pour un même id. */
export function hueFromId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) % 360;
  }
  return h;
}

/** Première lettre du prénom en majuscule, fallback '?'. */
export function initialOf(name: string): string {
  return (name.trim()[0] ?? '?').toUpperCase();
}

/**
 * Couleur d'avatar HSL prête à appliquer en CSS.
 * Saturation 55%, lightness 55% → ton chaleureux qui passe sur fond clair
 * comme sur fond sombre (testé visuellement avec les pages actuelles).
 */
export function avatarColor(id: string): string {
  return `hsl(${hueFromId(id)}, 55%, 55%)`;
}
