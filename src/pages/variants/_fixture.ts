/**
 * Mock data partagée par les 3 variantes /play-{a,b,c}.
 *
 * Représente un round fictif "Caen-La-Mer" en mode host (creator marque
 * pour 3 joueurs), trou 6/18, mi-partie. Chaque joueur a saisi les
 * trous 1-5, le creator est en train de saisir le trou 6 pour Martin.
 *
 * Les chiffres sont volontairement réalistes (golfeurs amateurs ~bogey),
 * avec Jean en leader (par-shooter), Greg moyen, Martin en difficulté.
 */

export interface FixtureHole {
  number: number;
  par: number;
  name?: string;
}

export interface FixturePlayer {
  id: string;
  name: string;
  is_creator: boolean;
  is_me: boolean;
}

export interface FixtureScore {
  pid: string;
  hole: number;
  strokes: number;
}

export const FIXTURE = {
  club: {
    name: 'Golf de Caen-La-Mer',
    primary_color: '#1A4490', // bleu marine du club
    logo_url: null as string | null,
  },
  players: [
    { id: 'p1', name: 'Gregoire', is_creator: true,  is_me: true  },
    { id: 'p2', name: 'Martin',   is_creator: false, is_me: false },
    { id: 'p3', name: 'Jean',     is_creator: false, is_me: false },
  ] as FixturePlayer[],
  holes: [
    { number: 1,  par: 4, name: 'La Plaine'  },
    { number: 2,  par: 3, name: 'L\'Étang'   },
    { number: 3,  par: 5, name: 'Le Bois'    },
    { number: 4,  par: 4, name: 'La Falaise' },
    { number: 5,  par: 4, name: 'Le Vallon'  },
    { number: 6,  par: 4, name: 'Les Dunes'  },
    { number: 7,  par: 3, name: 'La Mare'    },
    { number: 8,  par: 5, name: 'Le Tertre'  },
    { number: 9,  par: 4, name: 'Le Retour'  },
    { number: 10, par: 4, name: 'L\'Allée'   },
    { number: 11, par: 3, name: 'Le Pin'     },
    { number: 12, par: 5, name: 'La Côte'    },
    { number: 13, par: 4, name: 'Le Pont'    },
    { number: 14, par: 4, name: 'La Roche'   },
    { number: 15, par: 5, name: 'Le Détour'  },
    { number: 16, par: 3, name: 'L\'Île'     },
    { number: 17, par: 4, name: 'La Lande'   },
    { number: 18, par: 4, name: 'Le Green'   },
  ] as FixtureHole[],
  scores: [
    // Greg (p1) : 4,3,6,4,5 = 22 sur 20 par (+2)
    { pid: 'p1', hole: 1, strokes: 4 },
    { pid: 'p1', hole: 2, strokes: 3 },
    { pid: 'p1', hole: 3, strokes: 6 },
    { pid: 'p1', hole: 4, strokes: 4 },
    { pid: 'p1', hole: 5, strokes: 5 },
    // Martin (p2) : 4,4,5,5,5 = 23 sur 20 par (+3) — trou 6 en cours
    { pid: 'p2', hole: 1, strokes: 4 },
    { pid: 'p2', hole: 2, strokes: 4 },
    { pid: 'p2', hole: 3, strokes: 5 },
    { pid: 'p2', hole: 4, strokes: 5 },
    { pid: 'p2', hole: 5, strokes: 5 },
    // Jean (p3) : 4,3,5,4,4 = 20 sur 20 par (±0) — LEADER
    { pid: 'p3', hole: 1, strokes: 4 },
    { pid: 'p3', hole: 2, strokes: 3 },
    { pid: 'p3', hole: 3, strokes: 5 },
    { pid: 'p3', hole: 4, strokes: 4 },
    { pid: 'p3', hole: 5, strokes: 4 },
  ] as FixtureScore[],
  currentPlayerId: 'p2', // Martin
  currentHole: 6,
} as const;

/** Calcule { strokes, played, diff } pour un joueur depuis FIXTURE.scores. */
export function totalsFor(pid: string) {
  let strokes = 0;
  let played = 0;
  let playedPar = 0;
  for (const s of FIXTURE.scores) {
    if (s.pid !== pid) continue;
    const hole = FIXTURE.holes.find((h) => h.number === s.hole);
    if (!hole) continue;
    strokes += s.strokes;
    playedPar += hole.par;
    played++;
  }
  return { strokes, played, diff: strokes - playedPar };
}

/** Ordre du classement live (leader d'abord). */
export function orderedLeaderboard() {
  return [...FIXTURE.players]
    .map((p) => ({ ...p, ...totalsFor(p.id) }))
    .sort((a, b) => a.diff - b.diff);
}

/** Récupère un score précis joueur+trou, ou null. */
export function scoreFor(pid: string, hole: number): number | null {
  const s = FIXTURE.scores.find((s) => s.pid === pid && s.hole === hole);
  return s?.strokes ?? null;
}
