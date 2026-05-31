/**
 * Données mock partagées par les prototypes /variants (Couche 2B).
 * Scénario = le cas DOMINANT du pilote : une personne (host = « moi »)
 * saisit pour 4 joueurs, mi-partie (trous 1-5 remplis, on attaque le trou 6).
 * Aucune connexion DB / auth / realtime — tout est statique ici.
 */

export interface FixturePlayer {
  id: string;
  name: string;
  is_creator: boolean;
  is_me: boolean;
}
export interface FixtureHole {
  number: number;
  par: number;
}
export interface FixtureScore {
  pid: string;
  hole: number;
  strokes: number;
}

export interface Fixture {
  club: { name: string; primary_color: string };
  players: FixturePlayer[];
  holes: FixtureHole[];
  scores: FixtureScore[];
  pickedUp: { pid: string; hole: number }[];
  currentPlayerId: string;
  currentHole: number;
}

const PARS = [4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 5, 3, 4]; // par 72

// Scores des trous 1-5 (par 4,3,5,4,4) pour 4 joueurs.
const SEED: Record<string, number[]> = {
  p1: [5, 4, 6, 5, 4], // moi — +4
  p2: [4, 3, 5, 4, 5], // Alain — +1 (meneur)
  p3: [6, 4, 7, 5, 5], // Léa — +7
  p4: [4, 4, 5, 4, 4], // Marc — +1
};

export const FIXTURE: Fixture = {
  club: { name: 'Golf de Caen-la-Mer', primary_color: '#1A4490' },
  players: [
    { id: 'p1', name: 'Grégoire', is_creator: true, is_me: true },
    { id: 'p2', name: 'Alain', is_creator: false, is_me: false },
    { id: 'p3', name: 'Léa', is_creator: false, is_me: false },
    { id: 'p4', name: 'Marc', is_creator: false, is_me: false },
  ],
  holes: PARS.map((par, i) => ({ number: i + 1, par })),
  scores: Object.entries(SEED).flatMap(([pid, arr]) =>
    arr.map((strokes, i) => ({ pid, hole: i + 1, strokes })),
  ),
  pickedUp: [],
  currentPlayerId: 'p1', // host : on commence la saisie du trou 6 par moi
  currentHole: 6,
};

export function parOf(fx: Fixture, hole: number): number {
  return fx.holes.find((h) => h.number === hole)?.par ?? 4;
}

/** Label par-relatif golfer-native (aligné sur ScoreInput.astro / play.astro). */
export function relLabel(par: number, offset: number): string {
  if (offset === -2 && par === 3) return 'Ace';
  if (offset === -2) return 'Eagle';
  if (offset === -1) return 'Birdie';
  if (offset === 0) return 'Par';
  if (offset === 1) return 'Bogey';
  if (offset === 2) return 'Double';
  if (offset === 3) return 'Triple';
  return '';
}

/** Offsets des boutons par-relatifs : jusqu'au Triple (+3), comme le vrai flow. */
export const REL_OFFSETS = [-2, -1, 0, 1, 2, 3] as const;
