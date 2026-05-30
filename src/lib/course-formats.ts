import type { CourseData, CourseFormat, CourseHole, CourseLoop } from './clubs-types';

// Forme minimale d'une boucle acceptée par suggestFormats / resolvePrimaryFlatHoles :
// un CourseLoop complet (DB) comme le modèle allégé de l'éditeur client (trous
// sans `number`) s'y conforment.
export type CourseLoopLike = { id: string; name: string; holes: { par: number }[] };

// Slug d'un id de boucle : minuscules, accents retirés, non-alphanum → '-'.
// Repli `loop-<n>` quand le nom ne donne aucun slug exploitable. Partagé entre
// l'éditeur ops (client) et l'API (serveur) — et identique à la logique de
// l'import LLM (club-importer/defaults.ts).
export function slugifyLoopId(name: string, idx: number): string {
  const base = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || `loop-${idx + 1}`;
}

// Clé canonique d'un ensemble de boucles (ordre indifférent) — sert à
// rapprocher un format suggéré d'un format déjà enregistré.
export function loopIdsKey(ids: string[]): string {
  return [...ids].sort().join('|');
}

// Tronque/normalise un id de format pour respecter formatIdSchema (slug,
// ≤ 32 car.). Un id vide après nettoyage retombe sur 'f'.
function formatId(raw: string): string {
  const slug = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
    .replace(/-+$/g, '');
  return slug || 'f';
}

// Un format suggéré = un CourseFormat + un flag `enabled` (état de la case à
// cocher dans l'éditeur). Le flag n'est jamais persisté : seuls les formats
// cochés sont écrits dans course_data.formats.
export interface SuggestedFormat extends CourseFormat {
  enabled: boolean;
}

// Construit la liste des formats proposés pour un jeu de boucles :
//   - chaque boucle seule → un format « N trous » (coché par défaut) ;
//   - chaque paire de boucles → un 18 composite. Coché par défaut UNIQUEMENT
//     s'il y a exactement 2 boucles (cas courant) ; pour 3+ boucles les paires
//     sont proposées mais décochées, l'admin active la vraie paire (ex. Caen :
//     Plaine + Vallon, en laissant Plaine + Bois / Vallon + Bois décochés).
// Quand un format déjà enregistré couvre le même ensemble de boucles, on
// réutilise son id + son libellé (et il compte comme coché) afin qu'une
// re-dérivation ne change jamais un id référencé par des parties passées.
export function suggestFormats(loops: CourseLoopLike[], existing: CourseFormat[] = []): SuggestedFormat[] {
  const byKey = new Map<string, CourseFormat>();
  for (const f of existing) byKey.set(loopIdsKey(f.loop_ids), f);

  const usedIds = new Set<string>();
  const out: SuggestedFormat[] = [];

  const push = (loopIds: string[], baseId: string, label: string, defaultEnabled: boolean) => {
    const prior = byKey.get(loopIdsKey(loopIds));
    let id = prior?.id ?? formatId(baseId);
    let n = 2;
    while (usedIds.has(id)) id = formatId(`${baseId}-${n++}`);
    usedIds.add(id);
    out.push({
      id,
      label: prior?.label ?? label,
      loop_ids: loopIds,
      enabled: prior ? true : defaultEnabled,
    });
  };

  for (const loop of loops) {
    const n = loop.holes.length;
    push([loop.id], `${n}-${loop.id}`, `${n} trous — ${loop.name}`, true);
  }
  for (let i = 0; i < loops.length; i++) {
    for (let j = i + 1; j < loops.length; j++) {
      const a = loops[i];
      const b = loops[j];
      const total = a.holes.length + b.holes.length;
      push(
        [a.id, b.id],
        `${total}-${a.id}-${b.id}`,
        `${total} trous — ${a.name} + ${b.name}`,
        loops.length === 2,
      );
    }
  }
  return out;
}

// Recalcule le tableau plat `holes` (canonique), renuméroté 1..N. C'est le
// repli joué quand un round n'a pas de format_id, la base du « Par » affiché
// et des trous montrés sur la page d'entrée. On prend le format RETENU le plus
// grand (ex. Caen : le 18 Plaine+Vallon plutôt qu'un 9), pour que la fiche
// reste représentative. Les formats produits ici sont toujours ≤ 18 trous
// (boucles ≤ 9, formats = 1 ou 2 boucles) → on respecte la contrainte
// scores.hole_number (1..18).
export function resolvePrimaryFlatHoles(loops: CourseLoopLike[], formats: CourseFormat[]): CourseHole[] {
  const byId = new Map(loops.map((l) => [l.id, l]));
  const sizeOf = (f: CourseFormat) =>
    f.loop_ids.reduce((n, id) => n + (byId.get(id)?.holes.length ?? 0), 0);
  let primary: CourseFormat | undefined = formats[0];
  for (const f of formats) if (sizeOf(f) > sizeOf(primary as CourseFormat)) primary = f;
  const ids = primary ? primary.loop_ids : loops[0] ? [loops[0].id] : [];
  const out: CourseHole[] = [];
  let n = 1;
  for (const id of ids) {
    const loop = byId.get(id);
    if (!loop) continue;
    for (const h of loop.holes) out.push({ number: n++, par: h.par });
  }
  return out;
}

// Forme du payload envoyé par l'éditeur multi-boucles (après validation zod
// côté API). Les ids de boucle peuvent être absents (nouvelles boucles) ou
// des placeholders « loop-N » : on les normalise ici.
export interface MultiCourseInput {
  loops: { id?: string; name: string; holes: { par: number }[] }[];
  formats: { id: string; label: string; loop_ids: string[] }[];
}

// Sanitize serveur + recompute : assigne des ids de boucle uniques (slug du
// nom quand l'id est absent ou un placeholder « loop-N »), renumérote les
// trous 1..N par boucle, ne garde que les formats dont toutes les boucles
// existent, et recalcule le tableau plat. Fonction pure → testable. Renvoie
// `{ courseData }` ou `{ error }` (message FR prêt à renvoyer en 400).
export function buildMultiCourseData(
  input: MultiCourseInput,
): { courseData: CourseData } | { error: string } {
  if (input.loops.length === 0) return { error: 'au moins une boucle requise' };

  const used = new Set<string>();
  const remap: Record<string, string> = {};
  const loops: CourseLoop[] = input.loops.map((l, idx) => {
    const provided = (l.id ?? '').trim();
    const isPlaceholder = provided === '' || /^loop-\d+$/.test(provided) || !/^[a-z0-9-]+$/.test(provided);
    let id = isPlaceholder ? slugifyLoopId(l.name, idx) : provided;
    let n = 2;
    const baseId = id;
    while (used.has(id)) id = `${baseId}-${n++}`;
    used.add(id);
    if (provided && provided !== id) remap[provided] = id;
    return {
      id,
      name: l.name.trim(),
      holes: l.holes.map((h, hi) => ({ number: hi + 1, par: h.par })),
    };
  });

  const loopIds = new Set(loops.map((l) => l.id));
  const usedFmtIds = new Set<string>();
  const formats: CourseFormat[] = [];
  for (const f of input.formats) {
    const ids = f.loop_ids.map((id) => remap[id] ?? id).filter((id) => loopIds.has(id));
    if (ids.length === 0) continue;
    if (usedFmtIds.has(f.id)) continue;
    usedFmtIds.add(f.id);
    formats.push({ id: f.id, label: f.label.trim(), loop_ids: ids });
  }
  if (formats.length === 0) return { error: 'au moins un format valide à exposer' };

  const holes = resolvePrimaryFlatHoles(loops, formats);
  if (holes.length === 0) return { error: 'parcours vide après recalcul' };

  return { courseData: { holes, loops, formats } };
}
