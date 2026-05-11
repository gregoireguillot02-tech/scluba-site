export interface CourseHole {
  number: number;
  par: number;
  distance?: number;
}

export interface CourseData {
  holes: CourseHole[];
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
}

export interface RoundPlayer {
  id: string;
  round_id: string;
  display_name: string;
  user_id: string | null;
  is_creator: boolean;
  joined_at: string;
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

export function scoreType(strokes: number, par: number): 'eagle' | 'birdie' | 'par' | 'bogey' | 'double' {
  const diff = strokes - par;
  if (diff <= -2) return 'eagle';
  if (diff === -1) return 'birdie';
  if (diff === 0) return 'par';
  if (diff === 1) return 'bogey';
  return 'double';
}
