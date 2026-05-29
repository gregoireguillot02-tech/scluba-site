// Module de calcul de cadence (rythme de jeu) — fonction PURE, sans dépendance
// Supabase/DOM, donc bundlable côté client (banniere play.astro) et réutilisable
// côté serveur (futur cron Web Push, dashboard /ops cadence).
//
// Modèle par défaut calibré golf réel : ~4h-4h30 pour 18 trous en 4-ball.

export type PaceStatus = 'green' | 'orange' | 'red' | 'unknown';

export interface PaceInput {
  /** rounds.tee_time, sinon started_at. */
  teeTime: Date;
  now: Date;
  /** Nombre de trous joués (resolveRoundHoles(round, club).length). */
  holeCount: number;
  /** Nombre de joueurs (count round_players). */
  playerCount: number;
  /** Trou en cours, connu côté client (play.astro) ou estimé serveur (max hole). */
  currentHole?: number;
}

export interface PaceResult {
  status: PaceStatus;
  /** Trou où le groupe devrait être à `now`. */
  expectedHole: number;
  /** Minutes écoulées depuis le tee-time (≥ 0). */
  elapsedMin: number;
  /** Minutes de retard (> 0 = en retard, < 0 = en avance, 0 si non évaluable). */
  behindMin: number;
  /** Trous de retard (expectedHole − currentHole), 0 si currentHole inconnu. */
  behindHoles: number;
  /** Cadence cible effective (min/trou) selon le nombre de joueurs. */
  minutesPerHole: number;
  /** Durée cible totale de la partie (min). */
  targetTotalMin: number;
  /** Message FR prêt à afficher. */
  message: string;
}

/** Minutes par trou selon le nombre de joueurs (1→4), clampé. */
const MINUTES_PER_HOLE: Record<1 | 2 | 3 | 4, number> = { 1: 11, 2: 12.5, 3: 13.5, 4: 14.5 };

/** Seuil de retard (min) avant de passer en orange. */
const ORANGE_THRESHOLD_MIN = 8;
/** Seuil de retard (min) avant de passer en rouge (~1 trou). */
const RED_THRESHOLD_MIN = 15;

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function computePace(input: PaceInput): PaceResult {
  const { teeTime, now, holeCount, playerCount, currentHole } = input;

  const players = clamp(Math.round(playerCount) || 1, 1, 4) as 1 | 2 | 3 | 4;
  const minutesPerHole = MINUTES_PER_HOLE[players];
  const targetTotalMin = holeCount * minutesPerHole;

  const elapsedMin = (now.getTime() - teeTime.getTime()) / 60_000;

  // Avant le départ : rien à évaluer.
  if (elapsedMin < 0) {
    return {
      status: 'unknown',
      expectedHole: 1,
      elapsedMin: 0,
      behindMin: 0,
      behindHoles: 0,
      minutesPerHole,
      targetTotalMin,
      message: 'Départ à venir',
    };
  }

  const expectedHole = clamp(Math.floor(elapsedMin / minutesPerHole) + 1, 1, holeCount);

  // Sans trou courant on ne peut pas mesurer le retard : on reste neutre.
  const behindHoles = currentHole === undefined ? 0 : expectedHole - currentHole;
  const behindMin = behindHoles * minutesPerHole;

  let status: PaceStatus;
  let message: string;
  if (behindMin >= RED_THRESHOLD_MIN) {
    status = 'red';
    message = `~${behindHoles} trou(s) de retard — laissez passer ou rejoignez votre place`;
  } else if (behindMin >= ORANGE_THRESHOLD_MIN) {
    status = 'orange';
    message = 'Léger retard — pensez à accélérer';
  } else {
    status = 'green';
    message = 'Bon rythme';
  }

  return {
    status,
    expectedHole,
    elapsedMin: Math.round(elapsedMin),
    behindMin,
    behindHoles,
    minutesPerHole,
    targetTotalMin,
    message,
  };
}
