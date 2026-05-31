/**
 * File de synchronisation des scores — cœur "offline-first" de la saisie.
 *
 * Problème résolu : un score était écrit en local AVANT le POST, sans statut
 * ni persistance. Un POST échoué (réseau pourri sur le green) n'était ni
 * rejoué ni signalé → score perdu ; et un reload / kill du webapp pendant
 * qu'on est hors-ligne perdait aussi les scaisies non synchronisées.
 *
 * Cette file donne à chaque score un statut explicite (pending → saved |
 * failed), décide QUAND le rejouer (backoff), ET **persiste tout dans un
 * storage** (localStorage en prod) → sur un parcours on peut saisir, continuer
 * et terminer hors-ligne ; rien n'est perdu, tout se synchronise au retour
 * réseau. `finishRequested` mémorise une demande de fin de partie faite
 * hors-ligne, à rejouer une fois en ligne.
 *
 * Module déterministe et testable : pas de fetch, pas de timer, pas de DOM ;
 * `now` et `storage` sont injectés. Les effets de bord (fetch, setTimeout,
 * rendu, navigation) vivent dans play.astro et appellent cette file.
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

/** Adaptateur de stockage (window.localStorage en prod, fake en test). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
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
  private finishRequested = false;
  private storage?: StorageLike;
  private storageKey?: string;

  /** Sans `storage` → file en mémoire (tests / fallback). Avec → persistée. */
  constructor(opts?: { storage?: StorageLike; key?: string }) {
    this.storage = opts?.storage;
    this.storageKey = opts?.key;
    this.hydrate();
  }

  private hydrate(): void {
    if (!this.storage || !this.storageKey) return;
    const raw = this.storage.getItem(this.storageKey);
    if (!raw) return;
    try {
      const data = JSON.parse(raw) as { entries?: SyncEntry[]; finishRequested?: boolean };
      for (const e of data.entries ?? []) {
        if (e && typeof e.pid === 'string' && typeof e.hole === 'number') {
          this.entries.set(keyOf(e.pid, e.hole), e);
        }
      }
      this.finishRequested = data.finishRequested === true;
    } catch {
      /* storage corrompu → on repart vide, sans planter la saisie */
    }
  }

  private persist(): void {
    if (!this.storage || !this.storageKey) return;
    try {
      this.storage.setItem(
        this.storageKey,
        JSON.stringify({
          entries: [...this.entries.values()],
          finishRequested: this.finishRequested,
        }),
      );
    } catch {
      /* quota plein / mode privé restrictif : on ne casse pas la saisie */
    }
  }

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
    this.persist();
  }

  /** Le serveur a confirmé l'écriture. */
  markSaved(pid: string, hole: number): void {
    const e = this.entries.get(keyOf(pid, hole));
    if (!e) return;
    e.status = 'saved';
    this.persist();
  }

  /** Le POST a échoué : on garde la valeur et on reprogramme un retry. */
  markFailed(pid: string, hole: number, now: number): void {
    const e = this.entries.get(keyOf(pid, hole));
    if (!e) return;
    e.status = 'failed';
    e.attempts += 1;
    e.nextAttemptAt = now + backoff(e.attempts);
    this.persist();
  }

  /** Entrées non confirmées dont le délai de retry est écoulé, à (re)POSTer. */
  due(now: number): SyncEntry[] {
    return [...this.entries.values()].filter(
      (e) => e.status !== 'saved' && e.nextAttemptAt <= now,
    );
  }

  /** Reste-t-il des scores non confirmés ? */
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

  /** Toutes les entrées (pour réhydrater l'affichage local après un reload). */
  allEntries(): SyncEntry[] {
    return [...this.entries.values()];
  }

  /** Mémorise qu'on a demandé à terminer la partie (éventuellement hors-ligne). */
  requestFinish(): void {
    this.finishRequested = true;
    this.persist();
  }

  /** La fin de partie a été synchronisée → on oublie l'intention. */
  clearFinish(): void {
    this.finishRequested = false;
    this.persist();
  }

  isFinishRequested(): boolean {
    return this.finishRequested;
  }
}
