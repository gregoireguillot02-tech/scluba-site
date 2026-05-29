import { describe, it, expect } from 'vitest';
import { computePace } from './pace';

// Tee-time fixe pour des tests déterministes.
const tee = new Date('2026-05-29T08:00:00.000Z');
const at = (min: number) => new Date(tee.getTime() + min * 60_000);

describe('computePace — modèle de cadence', () => {
  it('statut unknown avant le tee-time (départ à venir)', () => {
    const r = computePace({
      teeTime: tee,
      now: new Date(tee.getTime() - 10 * 60_000),
      holeCount: 18,
      playerCount: 4,
      currentHole: 1,
    });
    expect(r.status).toBe('unknown');
    expect(r.behindMin).toBe(0);
    expect(r.message).toBeTruthy();
  });

  it('trou attendu = 1 au démarrage (elapsed 0)', () => {
    const r = computePace({ teeTime: tee, now: at(0), holeCount: 18, playerCount: 2 });
    expect(r.expectedHole).toBe(1);
  });

  it('pile à l’heure → green (2 joueurs, 50 min → trou attendu 5, on est au 5)', () => {
    const r = computePace({ teeTime: tee, now: at(50), holeCount: 18, playerCount: 2, currentHole: 5 });
    expect(r.minutesPerHole).toBe(12.5);
    expect(r.expectedHole).toBe(5);
    expect(r.behindHoles).toBe(0);
    expect(r.status).toBe('green');
  });

  it('un trou de retard → orange', () => {
    const r = computePace({ teeTime: tee, now: at(50), holeCount: 18, playerCount: 2, currentHole: 4 });
    expect(r.behindHoles).toBe(1);
    expect(r.behindMin).toBe(12.5);
    expect(r.status).toBe('orange');
  });

  it('deux trous de retard → red', () => {
    const r = computePace({ teeTime: tee, now: at(50), holeCount: 18, playerCount: 2, currentHole: 3 });
    expect(r.behindHoles).toBe(2);
    expect(r.behindMin).toBe(25);
    expect(r.status).toBe('red');
  });

  it('en avance → green (behind négatif)', () => {
    const r = computePace({ teeTime: tee, now: at(50), holeCount: 18, playerCount: 2, currentHole: 6 });
    expect(r.behindHoles).toBe(-1);
    expect(r.status).toBe('green');
  });

  it('clamp le trou attendu au nombre de trous (9 trous)', () => {
    const r = computePace({ teeTime: tee, now: at(1000), holeCount: 9, playerCount: 1, currentHole: 9 });
    expect(r.expectedHole).toBe(9);
  });

  it('cadence min/trou selon le nombre de joueurs (clamp 1..4)', () => {
    const mph = (playerCount: number) =>
      computePace({ teeTime: tee, now: at(0), holeCount: 18, playerCount }).minutesPerHole;
    expect(mph(1)).toBe(11);
    expect(mph(2)).toBe(12.5);
    expect(mph(3)).toBe(13.5);
    expect(mph(4)).toBe(14.5);
    expect(mph(7)).toBe(14.5); // clamp haut
    expect(mph(0)).toBe(11); // clamp bas → 1 joueur
  });

  it('durée cible totale = trous × min/trou (18 en 4-ball ≈ 4h20)', () => {
    expect(computePace({ teeTime: tee, now: at(0), holeCount: 18, playerCount: 4 }).targetTotalMin).toBe(261);
    expect(computePace({ teeTime: tee, now: at(0), holeCount: 9, playerCount: 1 }).targetTotalMin).toBe(99);
  });

  it('sans currentHole → pas d’évaluation de retard (green, behind 0)', () => {
    const r = computePace({ teeTime: tee, now: at(50), holeCount: 18, playerCount: 2 });
    expect(r.expectedHole).toBe(5);
    expect(r.behindMin).toBe(0);
    expect(r.status).toBe('green');
  });
});
