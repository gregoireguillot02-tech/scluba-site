export interface CourseHole {
  number: number;
  par: number;
  distance?: number;
}

// A nine-hole loop (a "9"). Clubs that have more than one loop expose them
// here so a round can play any subset. Holes inside a loop are numbered 1-9.
export interface CourseLoop {
  id: string;
  name: string;
  holes: CourseHole[];
}

// A playable format the player picks at party creation. Composing 1 loop
// gives a 9-hole format, composing 2 (or more) gives an 18-hole composite,
// with holes renumbered 1..N across loops in declaration order.
export interface CourseFormat {
  id: string;
  label: string;
  loop_ids: string[];
}

export interface CourseData {
  holes: CourseHole[];
  // Optional: when the club has more than one nine, expose loops + formats so
  // round creation can offer them. Absent for legacy / single-course clubs;
  // such clubs always play `holes` (backward compatible).
  loops?: CourseLoop[];
  formats?: CourseFormat[];
}

export interface Club {
  id: string;
  prospect_id: string | null;
  slug: string;
  name: string;
  city: string | null;
  logo_url: string | null;
  icon_url: string | null;
  photo_url: string | null;
  primary_color: string | null;
  // Latitude/longitude du clubhouse (utilisé pour fetcher la météo
  // Open-Meteo lors de la création d'une partie). Nullable : un club créé
  // sans coords ne casse rien, la météo est juste skippée.
  latitude: number | null;
  longitude: number | null;
  course_data: CourseData;
  // 4 sponsors optionnels affichés flanquant le score sur la carte
  // recap publique et la share card PNG. Slot vide (url null) = invisible.
  // Le lien est optionnel — si présent l'image devient un <a target="_blank">.
  sponsor_1_url: string | null;
  sponsor_2_url: string | null;
  sponsor_3_url: string | null;
  sponsor_4_url: string | null;
  sponsor_1_link: string | null;
  sponsor_2_link: string | null;
  sponsor_3_link: string | null;
  sponsor_4_link: string | null;
  // Carnet de parcours : map { "<numéro de trou>": "<url image publique>" }.
  // Renseigné via /ops (dépôt du carnet club). Vide/absent = pas de carnet,
  // donc aucun bouton "Voir le trou" côté joueur. Clé = numéro de trou de
  // course_data.holes (OK pour les clubs mono-parcours type Téoula ; les clubs
  // multi-boucles sont une limite v1). Voir migration 0022.
  hole_guides?: Record<string, string>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface WeatherSnapshot {
  temp_c: number;
  code: number;
  label: string;
  emoji: string;
}

export const ROUND_STATUSES = ['lobby', 'playing', 'finished'] as const;
export type RoundStatus = (typeof ROUND_STATUSES)[number];

export const SCORING_MODES = ['self', 'host'] as const;
export type ScoringMode = (typeof SCORING_MODES)[number];

export interface Round {
  id: string;
  club_id: string;
  short_code: string;
  status: RoundStatus;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  share_photo_url: string | null;
  // When set, identifies an entry in `clubs.course_data.formats` describing
  // which loops this round plays. Null means "play the flat course_data.holes
  // array" (legacy behaviour, before multi-loop clubs existed).
  format_id: string | null;
  // Snapshot Open-Meteo récupéré à la création (température + code WMO +
  // label/emoji). Null si pas de coords club ou si Open-Meteo a échoué.
  weather: WeatherSnapshot | null;
  // Commentaire libre saisi par le joueur en fin de partie (page recap).
  // Affiché sur la scorecard partagée.
  comment: string | null;
  // 'self' = chaque joueur saisit sur son tel (comportement par défaut).
  // 'host' = un seul scoreur (host) saisit pour tout le flight ; les autres
  // ont une vue spectateur. Voir migration 0015.
  scoring_mode: ScoringMode;
}

export interface RoundPlayer {
  id: string;
  round_id: string;
  display_name: string;
  user_id: string | null;
  is_creator: boolean;
  joined_at: string;
  // null = placeholder name typed by organizer, waiting for a device to claim it.
  // not-null = a player device has scanned the QR and selected this name (or
  // self-added). Start gating requires every row to have claimed_at set.
  claimed_at: string | null;
  // Commentaire libre saisi par CE joueur sur sa carte recap (200 chars max).
  // Migré depuis rounds.comment en 0020 — chaque joueur a désormais le sien.
  comment: string | null;
}

export interface Score {
  id: string;
  round_player_id: string;
  hole_number: number;
  // null quand le trou a été abandonné (picked_up = true).
  strokes: number | null;
  // true = trou abandonné ("chablis"). Compté comme par(trou) + 2 dans les
  // calculs de total et d'écart au par (Maximum Score, Rules of Golf 2023).
  picked_up: boolean;
  updated_at: string;
}

// Coup effectif utilisé pour les calculs de total/diff. Pour un trou
// abandonné, retourne par + 2 (Maximum Score). Pour un trou joué, retourne
// les coups saisis. Retourne null si aucun score n'a été saisi.
export function effectiveStrokes(
  score: Pick<Score, 'strokes' | 'picked_up'> | undefined,
  par: number,
): number | null {
  if (!score) return null;
  if (score.picked_up) return par + 2;
  return score.strokes;
}

export function totalPar(course: CourseData): number {
  return course.holes.reduce((sum, h) => sum + h.par, 0);
}

// A section of the scorecard that's displayed as one row in the grid. For a
// 9-hole format there's a single section labelled with the loop name. For an
// 18-hole composite there are two sections (e.g. "La Plaine" then "Le Vallon").
export interface ResolvedSection {
  loop_id: string;
  loop_name: string;
  holes: CourseHole[];
}

// Returns the full flat list of holes this round actually plays, renumbered
// 1..N. Falls back to `course_data.holes` when the round has no format set
// or the club doesn't expose loops — preserves the pre-loops behaviour.
export function resolveRoundHoles(round: Round, club: Club): CourseHole[] {
  const cd = club.course_data;
  if (!round.format_id || !cd.formats || !cd.loops) return cd.holes;
  const fmt = cd.formats.find((f) => f.id === round.format_id);
  if (!fmt) return cd.holes;
  const out: CourseHole[] = [];
  let n = 1;
  for (const loopId of fmt.loop_ids) {
    const loop = cd.loops.find((l) => l.id === loopId);
    if (!loop) continue;
    for (const h of loop.holes) out.push({ ...h, number: n++ });
  }
  return out.length > 0 ? out : cd.holes;
}

// Same resolution as resolveRoundHoles but keeps the loop boundaries so the
// scorecard grid can render one row per loop with its real name (instead of
// the legacy "F9"/"B9" labels).
export function resolveRoundSections(round: Round, club: Club): ResolvedSection[] {
  const cd = club.course_data;
  if (!round.format_id || !cd.formats || !cd.loops) {
    // Legacy fallback: synthesise F9/B9 from the flat holes array.
    const holes = cd.holes;
    const front = holes.filter((h) => h.number <= 9);
    const back = holes.filter((h) => h.number > 9);
    const sections: ResolvedSection[] = [];
    if (front.length) sections.push({ loop_id: 'f9', loop_name: 'F9', holes: front });
    if (back.length) sections.push({ loop_id: 'b9', loop_name: 'B9', holes: back });
    return sections;
  }
  const fmt = cd.formats.find((f) => f.id === round.format_id);
  if (!fmt) return resolveRoundSections({ ...round, format_id: null }, club);
  const out: ResolvedSection[] = [];
  let n = 1;
  for (const loopId of fmt.loop_ids) {
    const loop = cd.loops.find((l) => l.id === loopId);
    if (!loop) continue;
    out.push({
      loop_id: loop.id,
      loop_name: loop.name,
      holes: loop.holes.map((h) => ({ ...h, number: n++ })),
    });
  }
  return out;
}

export function scoreType(strokes: number, par: number): 'eagle' | 'birdie' | 'par' | 'bogey' | 'double' {
  const diff = strokes - par;
  if (diff <= -2) return 'eagle';
  if (diff === -1) return 'birdie';
  if (diff === 0) return 'par';
  if (diff === 1) return 'bogey';
  return 'double';
}
