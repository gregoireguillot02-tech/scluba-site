import { describe, it, expect } from 'vitest';
import {
  slugifyLoopId,
  suggestFormats,
  resolvePrimaryFlatHoles,
  buildMultiCourseData,
  type MultiCourseInput,
} from './course-formats';

const nine = () => Array.from({ length: 9 }, () => ({ par: 4 }));

describe('slugifyLoopId', () => {
  it('slugifie le nom, retire les accents', () => {
    expect(slugifyLoopId('La Plaine', 0)).toBe('la-plaine');
    expect(slugifyLoopId('Le Vallon !!!', 1)).toBe('le-vallon');
    expect(slugifyLoopId('Forêt', 0)).toBe('foret');
  });
  it('repli loop-N quand le nom ne donne aucun slug', () => {
    expect(slugifyLoopId('   ', 2)).toBe('loop-3');
    expect(slugifyLoopId('', 0)).toBe('loop-1');
  });
});

describe('suggestFormats', () => {
  it('1 boucle → 1 format 9 coché', () => {
    const s = suggestFormats([{ id: 'a', name: 'A', holes: nine() }]);
    expect(s).toHaveLength(1);
    expect(s[0].loop_ids).toEqual(['a']);
    expect(s[0].enabled).toBe(true);
  });

  it('2 boucles → 2 × 9 + 1 × 18, tous cochés par défaut', () => {
    const s = suggestFormats([
      { id: 'a', name: 'A', holes: nine() },
      { id: 'b', name: 'B', holes: nine() },
    ]);
    const singles = s.filter((f) => f.loop_ids.length === 1);
    const pairs = s.filter((f) => f.loop_ids.length === 2);
    expect(singles).toHaveLength(2);
    expect(pairs).toHaveLength(1);
    expect(singles.every((f) => f.enabled)).toBe(true);
    expect(pairs[0].enabled).toBe(true);
  });

  it('3 boucles → 3 × 9 cochés, paires 18 proposées mais décochées', () => {
    const s = suggestFormats([
      { id: 'plaine', name: 'La Plaine', holes: nine() },
      { id: 'vallon', name: 'Le Vallon', holes: nine() },
      { id: 'bois', name: 'Le Bois', holes: nine() },
    ]);
    const singles = s.filter((f) => f.loop_ids.length === 1);
    const pairs = s.filter((f) => f.loop_ids.length === 2);
    expect(singles).toHaveLength(3);
    expect(pairs).toHaveLength(3);
    expect(singles.every((f) => f.enabled)).toBe(true);
    expect(pairs.every((f) => !f.enabled)).toBe(true);
  });

  it('réutilise id + libellé + état coché des formats déjà enregistrés', () => {
    const loops = [
      { id: 'plaine', name: 'La Plaine', holes: nine() },
      { id: 'vallon', name: 'Le Vallon', holes: nine() },
      { id: 'bois', name: 'Le Bois', holes: nine() },
    ];
    const existing = [
      { id: '18', label: '18 trous · Plaine + Vallon', loop_ids: ['plaine', 'vallon'] },
      { id: '9-bois', label: '9 trous · Le Bois', loop_ids: ['bois'] },
    ];
    const s = suggestFormats(loops, existing);
    const pv = s.find((f) => f.loop_ids.length === 2 && f.loop_ids.includes('plaine') && f.loop_ids.includes('vallon'))!;
    expect(pv.id).toBe('18');
    expect(pv.label).toBe('18 trous · Plaine + Vallon');
    expect(pv.enabled).toBe(true);
    const bois = s.find((f) => f.loop_ids.length === 1 && f.loop_ids[0] === 'bois')!;
    expect(bois.id).toBe('9-bois');
    expect(bois.enabled).toBe(true);
    // Les autres paires (non enregistrées) restent décochées.
    const pb = s.find((f) => f.loop_ids.includes('plaine') && f.loop_ids.includes('bois'))!;
    expect(pb.enabled).toBe(false);
  });
});

describe('resolvePrimaryFlatHoles', () => {
  it('prend le plus grand format retenu, renuméroté 1..N', () => {
    const loops = [
      { id: 'a', name: 'A', holes: nine() },
      { id: 'b', name: 'B', holes: nine() },
    ];
    const formats = [
      { id: '9-a', label: '9 A', loop_ids: ['a'] },
      { id: '18', label: '18', loop_ids: ['a', 'b'] },
    ];
    const flat = resolvePrimaryFlatHoles(loops, formats);
    expect(flat).toHaveLength(18);
    expect(flat[0].number).toBe(1);
    expect(flat[17].number).toBe(18);
  });
});

describe('buildMultiCourseData', () => {
  it('Caen : 3 boucles + formats (3×9 + 18) → loops/formats persistés, plat = 18', () => {
    const input: MultiCourseInput = {
      loops: [
        { id: 'loop-1', name: 'La Plaine', holes: nine() },
        { id: 'loop-2', name: 'Le Vallon', holes: nine() },
        { id: 'loop-3', name: 'Le Bois', holes: nine() },
      ],
      formats: [
        { id: '9-loop-1', label: '9 — La Plaine', loop_ids: ['loop-1'] },
        { id: '9-loop-2', label: '9 — Le Vallon', loop_ids: ['loop-2'] },
        { id: '9-loop-3', label: '9 — Le Bois', loop_ids: ['loop-3'] },
        { id: '18-pv', label: '18 — Plaine + Vallon', loop_ids: ['loop-1', 'loop-2'] },
      ],
    };
    const r = buildMultiCourseData(input);
    if (!('courseData' in r)) throw new Error(r.error);
    const cd = r.courseData;
    // ids placeholder « loop-N » régénérés depuis les noms.
    expect(cd.loops!.map((l) => l.id)).toEqual(['la-plaine', 'le-vallon', 'le-bois']);
    expect(cd.formats).toHaveLength(4);
    // loop_ids des formats remappés vers les nouveaux ids.
    const f18 = cd.formats!.find((f) => f.loop_ids.length === 2)!;
    expect(f18.loop_ids).toEqual(['la-plaine', 'le-vallon']);
    // plat = le 18 (plus grand format), renuméroté 1..18.
    expect(cd.holes).toHaveLength(18);
    expect(cd.holes[0].number).toBe(1);
    expect(cd.holes[17].number).toBe(18);
  });

  it('garde les ids de boucle valides (non placeholder)', () => {
    const r = buildMultiCourseData({
      loops: [{ id: 'plaine', name: 'La Plaine', holes: nine() }],
      formats: [{ id: '9-plaine', label: '9', loop_ids: ['plaine'] }],
    });
    if (!('courseData' in r)) throw new Error(r.error);
    expect(r.courseData.loops!.map((l) => l.id)).toEqual(['plaine']);
  });

  it('ignore les formats qui référencent une boucle inconnue → erreur si plus aucun', () => {
    const r = buildMultiCourseData({
      loops: [{ id: 'a', name: 'A', holes: [{ par: 4 }] }],
      formats: [{ id: 'x', label: 'X', loop_ids: ['ghost'] }],
    });
    expect('error' in r).toBe(true);
  });

  it('erreur sans boucle', () => {
    expect('error' in buildMultiCourseData({ loops: [], formats: [] })).toBe(true);
  });
});
