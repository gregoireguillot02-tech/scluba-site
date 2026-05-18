// @vitest-environment node
// detectEvent est pure (zéro DOM) — pas besoin de jsdom, et le passage
// en env node évite les chargements lourds qui timent out sur Google Drive.

import { describe, it, expect } from 'vitest';
import { detectEvent, type ScoresMap, type ParsMap } from './round-events';

/**
 * Parcours fictif court (5 trous) : pars 4-3-5-4-3. Suffisant pour tester
 * tous les events sauf "declic" (qui exige ≥5 holes consécutifs over-par)
 * et "streak_pars à 5" — pour ceux-là on utilise un 9 trous.
 */
const PARS_5: ParsMap = { 1: 4, 2: 3, 3: 5, 4: 4, 5: 3 };
const PARS_9: ParsMap = { 1: 4, 2: 3, 3: 5, 4: 4, 5: 3, 6: 4, 7: 5, 8: 4, 9: 3 };

describe('detectEvent', () => {
  it('retourne null quand le trou saisi n\'est pas dans pars', () => {
    const scores: ScoresMap = { 99: 4 };
    expect(detectEvent(scores, PARS_5, 99)).toBeNull();
  });

  it('retourne null sur pickup (null)', () => {
    const scores: ScoresMap = { 1: null };
    expect(detectEvent(scores, PARS_5, 1)).toBeNull();
  });

  it('détecte HIO sur un par 3 saisi à 1', () => {
    const scores: ScoresMap = { 5: 1 };
    expect(detectEvent(scores, PARS_5, 5)).toEqual({ type: 'hio', hole: 5 });
  });

  it('détecte HIO en priorité sur eagle (par 3 score 1)', () => {
    // Sur un par 3, score = 1 est à la fois HIO et eagle (par - 2). HIO gagne.
    const scores: ScoresMap = { 2: 1 };
    expect(detectEvent(scores, PARS_5, 2)).toEqual({ type: 'hio', hole: 2 });
  });

  it('détecte eagle sur un par 4 saisi à 2 (non HIO)', () => {
    const scores: ScoresMap = { 1: 2 };
    expect(detectEvent(scores, PARS_5, 1)).toEqual({ type: 'eagle', hole: 1 });
  });

  it('détecte first_birdie sur le premier sub-par de la partie', () => {
    // Trous 1 et 2 = par ou pire, trou 3 = sub-par → c'est le premier birdie.
    const scores: ScoresMap = { 1: 5, 2: 4, 3: 4 }; // bogey, bogey, birdie sur par 5
    expect(detectEvent(scores, PARS_5, 3)).toEqual({ type: 'first_birdie', hole: 3 });
  });

  it('ne re-déclenche pas first_birdie au deuxième birdie', () => {
    // Premier birdie au trou 1, deuxième au trou 3 → null pour le deuxième.
    const scores: ScoresMap = { 1: 3, 2: 3, 3: 4 }; // birdie, par, birdie sur par 5
    expect(detectEvent(scores, PARS_5, 3)).toBeNull();
  });

  it('détecte streak_pars à 3 pars d\'affilée', () => {
    const scores: ScoresMap = { 1: 4, 2: 3, 3: 5 }; // 3 pars consécutifs
    expect(detectEvent(scores, PARS_5, 3)).toEqual({
      type: 'streak_pars',
      hole: 3,
      count: 3,
    });
  });

  it('ne re-déclenche pas streak_pars à 4 (palier 3 et 5 uniquement)', () => {
    const scores: ScoresMap = { 1: 4, 2: 3, 3: 5, 4: 4 };
    expect(detectEvent(scores, PARS_5, 4)).toBeNull();
  });

  it('re-déclenche streak_pars à 5 pars d\'affilée', () => {
    const scores: ScoresMap = { 1: 4, 2: 3, 3: 5, 4: 4, 5: 3 };
    expect(detectEvent(scores, PARS_5, 5)).toEqual({
      type: 'streak_pars',
      hole: 5,
      count: 5,
    });
  });

  it('streak_pars cassé par un birdie au milieu ne re-déclenche pas à 3', () => {
    // Pars: 4-3-5-4-3. Scores : par, par, birdie, par, par → seulement 2 pars
    // d'affilée à la fin (trous 4-5). first_birdie déjà déclenché au trou 3.
    const scores: ScoresMap = { 1: 4, 2: 3, 3: 4, 4: 4, 5: 3 };
    expect(detectEvent(scores, PARS_5, 5)).toBeNull();
  });

  it('détecte declic après 5 over-par consécutifs', () => {
    // 5 over-par puis un birdie au trou 6 → declic.
    const scores: ScoresMap = { 1: 5, 2: 4, 3: 6, 4: 5, 5: 4, 6: 3 };
    expect(detectEvent(scores, PARS_9, 6)).toEqual({ type: 'declic', hole: 6 });
  });

  it('ne déclenche pas declic si seulement 4 over-par avant le sub-par', () => {
    // Scores : 5-4-6-5-3 (over, over, over, over, birdie) → seulement 4 over.
    const scores: ScoresMap = { 1: 5, 2: 4, 3: 6, 4: 5, 5: 2 };
    expect(detectEvent(scores, PARS_5, 5)).toEqual({ type: 'first_birdie', hole: 5 });
  });

  it('ne déclenche rien sur un par seul (besoin de streak)', () => {
    const scores: ScoresMap = { 1: 4 };
    expect(detectEvent(scores, PARS_5, 1)).toBeNull();
  });

  it('priorité hio > eagle > first_birdie sur un trou cumulant les trois', () => {
    // Par 3 saisi à 1 sur le PREMIER trou → HIO + eagle + first_birdie.
    const scores: ScoresMap = { 2: 1 };
    expect(detectEvent(scores, PARS_5, 2)).toEqual({ type: 'hio', hole: 2 });
  });

  it('pickup au milieu d\'un streak de pars casse le streak', () => {
    // Pars, pars, pickup, pars, pars → 2 pars max d'affilée à la fin.
    const scores: ScoresMap = { 1: 4, 2: 3, 3: null, 4: 4, 5: 3 };
    expect(detectEvent(scores, PARS_5, 5)).toBeNull();
  });

  it('respecte l\'ordre numérique des trous, pas l\'ordre de saisie', () => {
    // Saisie dans le désordre : trou 3 d'abord, puis trous 1, 2 (pars).
    // Quand on saisit le trou 2 (par), le streak (1, 2) = 2, mais le 3
    // est déjà sub-par donc... actually trou 3 sub-par casse pas le run
    // [1,2]. Le streak est de 2 → pas de fire.
    const scores: ScoresMap = { 3: 4, 1: 4, 2: 3 };
    expect(detectEvent(scores, PARS_5, 2)).toBeNull();
  });
});
