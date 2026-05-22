import type { CourseData, CourseFormat, CourseHole, CourseLoop } from '../clubs-types';
import type { ExtractedClubData } from './types';

const P_P_REGEX = /pitch.?putt|p\s?&\s?p\b|par\s?3\b/i;

function loopId(name: string, idx: number): string {
  const base = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || `loop-${idx + 1}`;
}

/**
 * Builds the canonical {@link CourseData} the DB stores: a flat
 * `holes` array (renumbered 1..N) plus `loops` and `formats` when
 * there is more than one loop.
 *
 * Missing pars are filled with safe defaults — par 3 if the club is a
 * Pitch & Putt, par 4 otherwise — and every filled hole produces a
 * warning so the admin can correct it before saving.
 */
export function buildCourseData(data: ExtractedClubData): {
  course_data: CourseData;
  warnings: string[];
} {
  const isPP = data.is_pitch_putt || data.loops.some((l) => P_P_REGEX.test(l.name));
  const defaultPar = isPP ? 3 : 4;

  const warnings: string[] = [];
  if (data.loops.length === 0) {
    warnings.push("Aucune boucle de parcours détectée sur le site — choisis 6/9/18 trous ci-dessous et ajuste les pars avant de sauver.");
  }

  const usedLoopIds = new Set<string>();
  const loops: CourseLoop[] = data.loops.map((rawLoop, idx) => {
    let id = loopId(rawLoop.name, idx);
    while (usedLoopIds.has(id)) id = `${id}-${idx + 1}`;
    usedLoopIds.add(id);

    const holes: CourseHole[] = rawLoop.holes.map((h, holeIdx) => {
      if (h.par == null) {
        warnings.push(`Loop "${rawLoop.name}" trou ${holeIdx + 1} : par non trouvé, défaut ${defaultPar} appliqué.`);
        return { number: holeIdx + 1, par: defaultPar };
      }
      return { number: holeIdx + 1, par: h.par };
    });

    return { id, name: rawLoop.name, holes };
  });

  if (data.confidence.pars === 'low' && warnings.length === 0) {
    warnings.push('Le LLM a une confiance faible dans les pars — vérifie les valeurs.');
  }

  const formats: CourseFormat[] = [];
  if (loops.length === 1) {
    const loop = loops[0];
    formats.push({ id: loop.id, label: `${loop.holes.length} trous`, loop_ids: [loop.id] });
  } else if (loops.length >= 2) {
    for (const loop of loops) {
      formats.push({ id: loop.id, label: `9 trous — ${loop.name}`, loop_ids: [loop.id] });
    }
    if (loops.length === 2) {
      formats.push({ id: '18', label: '18 trous', loop_ids: loops.map((l) => l.id) });
    }
  }

  const flat: CourseHole[] = [];
  let n = 1;
  for (const loop of loops) {
    for (const h of loop.holes) flat.push({ number: n++, par: h.par });
  }

  return {
    course_data: {
      holes: flat,
      ...(loops.length ? { loops } : {}),
      ...(formats.length ? { formats } : {}),
    },
    warnings,
  };
}
