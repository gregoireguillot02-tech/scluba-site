/**
 * File de synchronisation des scores — cœur "anti-perte" de la saisie.
 *
 * Problème résolu : aujourd'hui un score est écrit en local AVANT le POST et
 * n'a aucun statut. Si le POST échoue (réseau pourri sur le green), rien ne le
 * rejoue et rien ne prévient → le score est perdu au reload (cf. saveScore
 * dans play.astro). Cette file donne à chaque score un statut explicite
 * (pending → saved | failed) et décide QUAND le rejouer.
 *
 * Module PUR et déterministe (pas de fetch, pas de timer, pas de DOM, `now`
 * injecté) → testable comme pace.ts. Les effets de bord (fetch, setTimeout,
 * rendu des cellules) vivent dans play.astro et appellent cette file.
 */

export type SyncStatus = 'pending' | 'saved' | 'failed';

export interface SyncEntry {
  pid: string;
  hole: number;
  /** Corps exact du POST à rejouer ({ hole, strokes } | { hole, picked_up } + éventuel player_id). */
  body: Record<string, unknown>;
  status: SyncStatus;
  attempts: number;
  /** Timestamp (ms) à partir duquel l'entrée est de nouveau "due" pour un retry. */
  nextAttemptAt: number;
}

const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30000;

/** Backoff exponentiel borné : 1s, 2s, 4s, 8s… plafonné à 30s. */
export function backoff(attempts: number): number {
  return Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** (attempts - 1));
}

function keyOf(pid: string, hole: number): string {
  return `${pid}:${hole}`;
}

export class ScoreSyncQueue {
  private entries = new Map<string, SyncEntry>();

  /** Saisie (ou correction) d'un score : (re)passe en pending, due tout de suite. */
  enqueue(pid: string, hole: number, body: Record<string, unknown>): void {
    this.entries.set(keyOf(pid, hole), {
      pid,
      hole,
      body,
      status: 'pending',
      attempts: 0,
      nextAttemptAt: 0,
    });
  }

  /** Le serveur a confirmé l'écriture. */
  markSaved(pid: string, hole: number): void {
    const e = this.entries.get(keyOf(pid, hole));
    if (e) e.status = 'saved';
  }

  /** Le POST a échoué : on garde la valeur et on reprogramme un retry. */
  markFailed(pid: string, hole: number, now: number): void {
    const e = this.entries.get(keyOf(pid, hole));
    if (!e) return;
    e.status = 'failed';
    e.attempts += 1;
    e.nextAttemptAt = now + backoff(e.attempts);
  }

  /** Entrées non confirmées dont le délai de retry est écoulé, à (re)POSTer. */
  due(now: number): SyncEntry[] {
    return [...this.entries.values()].filter(
      (e) => e.status !== 'saved' && e.nextAttemptAt <= now,
    );
  }

  /** Reste-t-il des scores non confirmés ? (base du garde-fou "Terminer".) */
  hasUnsaved(): boolean {
    return [...this.entries.values()].some((e) => e.status !== 'saved');
  }

  unsavedCount(): number {
    return [...this.entries.values()].filter((e) => e.status !== 'saved').length;
  }

  statusOf(pid: string, hole: number): SyncStatus | undefined {
    return this.entries.get(keyOf(pid, hole))?.status;
  }

  bodyOf(pid: string, hole: number): Record<string, unknown> | undefined {
    return this.entries.get(keyOf(pid, hole))?.body;
  }
}
