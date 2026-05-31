/**
 * Store mock framework-free pour les prototypes /variants — le « cerveau »
 * scoring + navigation, IDENTIQUE en logique au vrai play.astro (effective
 * strokes, totals, round-robin host), mais sur des données en mémoire (aucun
 * backend). Partagé par les 3 variantes B/C/A : seul le rendu diffère.
 *
 * Code éphémère (prototype) — supprimé avec /variants après la décision de flow.
 */

import { FIXTURE, parOf, type Fixture } from './_fixture';

export interface Totals {
  strokes: number;
  played: number;
  diff: number;
}

export function createMockStore(fx: Fixture = FIXTURE) {
  const orderedPlayerIds = fx.players.map((p) => p.id);
  const holeCount = fx.holes.length;
  const nameById = new Map(fx.players.map((p) => [p.id, p.name]));
  const isMeById = new Map(fx.players.map((p) => [p.id, p.is_me]));

  // État vivant (cloné depuis la seed → mutable).
  const scores = new Map<string, Map<number, number>>();
  const pickups = new Map<string, Set<number>>();
  for (const p of fx.players) {
    scores.set(p.id, new Map());
    pickups.set(p.id, new Set());
  }
  for (const s of fx.scores) scores.get(s.pid)?.set(s.hole, s.strokes);
  for (const pu of fx.pickedUp) pickups.get(pu.pid)?.add(pu.hole);

  let currentPlayerId = fx.currentPlayerId;
  let currentHole = fx.currentHole;

  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());

  function hasEntry(pid: string, hole: number): boolean {
    return pickups.get(pid)!.has(hole) || scores.get(pid)!.has(hole);
  }
  function effStrokes(pid: string, hole: number): number | null {
    if (pickups.get(pid)!.has(hole)) return parOf(fx, hole) + 2;
    return scores.get(pid)!.get(hole) ?? null;
  }
  function totalsFor(pid: string): Totals {
    let strokes = 0;
    let played = 0;
    let diff = 0;
    for (const h of fx.holes) {
      const eff = effStrokes(pid, h.number);
      if (eff === null) continue;
      strokes += eff;
      played++;
      diff += eff - h.par;
    }
    return { strokes, played, diff };
  }
  function playedCountOnHole(hole: number): number {
    let n = 0;
    for (const pid of orderedPlayerIds) if (hasEntry(pid, hole)) n++;
    return n;
  }
  function isHoleCompleteForAll(hole: number): boolean {
    return orderedPlayerIds.every((pid) => hasEntry(pid, hole));
  }
  /** Prochain joueur sans saisie sur ce trou (round-robin depuis `pid`). */
  function nextPlayerOnHole(pid: string, hole: number): string | null {
    const idx = orderedPlayerIds.indexOf(pid);
    for (let i = 1; i <= orderedPlayerIds.length; i++) {
      const cand = orderedPlayerIds[(idx + i) % orderedPlayerIds.length];
      if (!hasEntry(cand, hole)) return cand;
    }
    return null;
  }
  /** Round-robin host : finir le trou courant pour tous, puis avancer. */
  function nextSlotHost(): { pid: string; hole: number } | null {
    const np = nextPlayerOnHole(currentPlayerId, currentHole);
    if (np) return { pid: np, hole: currentHole };
    for (let h = currentHole + 1; h <= holeCount; h++)
      for (const pid of orderedPlayerIds) if (!hasEntry(pid, h)) return { pid, hole: h };
    for (let h = 1; h < currentHole; h++)
      for (const pid of orderedPlayerIds) if (!hasEntry(pid, h)) return { pid, hole: h };
    return null;
  }

  return {
    fx,
    orderedPlayerIds,
    holeCount,
    nameById,
    isMeById,
    get currentPlayerId() {
      return currentPlayerId;
    },
    get currentHole() {
      return currentHole;
    },
    parOf: (hole: number) => parOf(fx, hole),
    scoreOf: (pid: string, hole: number) => scores.get(pid)!.get(hole) ?? null,
    isPickup: (pid: string, hole: number) => pickups.get(pid)!.has(hole),
    hasEntry,
    totalsFor,
    playedCountOnHole,
    isHoleCompleteForAll,
    nextPlayerOnHole,
    nextSlotHost,
    setScore(pid: string, hole: number, strokes: number) {
      pickups.get(pid)!.delete(hole);
      scores.get(pid)!.set(hole, strokes);
      emit();
    },
    setPickup(pid: string, hole: number) {
      scores.get(pid)!.delete(hole);
      pickups.get(pid)!.add(hole);
      emit();
    },
    setCurrent(pid: string, hole: number) {
      currentPlayerId = pid;
      currentHole = Math.max(1, Math.min(holeCount, hole));
      emit();
    },
    /** Classement trié (diff croissant ; à égalité, + de trous joués). */
    orderedLeaderboard() {
      return [...orderedPlayerIds]
        .map((pid) => ({
          pid,
          name: nameById.get(pid)!,
          isMe: isMeById.get(pid)!,
          ...totalsFor(pid),
        }))
        .sort((a, b) => {
          if (a.played === 0 && b.played === 0) return a.name.localeCompare(b.name);
          if (a.played === 0) return 1;
          if (b.played === 0) return -1;
          if (a.diff !== b.diff) return a.diff - b.diff;
          return b.played - a.played;
        });
    },
    subscribe(cb: () => void) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
}

export type MockStore = ReturnType<typeof createMockStore>;
