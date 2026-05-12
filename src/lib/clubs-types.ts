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
  photo_url: string | null;
  primary_color: string | null;
  course_data: CourseData;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export const ROUND_STATUSES = ['lobby', 'playing', 'finished'] as const;
export type RoundStatus = (typeof ROUND_STATUSES)[number];

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
}

export interface Score {
  id: string;
  round_player_id: string;
  hole_number: number;
  strokes: number;
  updated_at: string;
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
