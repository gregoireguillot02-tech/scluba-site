import { describe, it, expect } from 'vitest';
import { ScoreSyncQueue, backoff } from './score-sync';

describe('backoff', () => {
  it('grows exponentially from 1s', () => {
    expect(backoff(1)).toBe(1000);
    expect(backoff(2)).toBe(2000);
    expect(backoff(3)).toBe(4000);
  });
  it('caps at 30s so a dead network never waits forever between retries', () => {
    expect(backoff(10)).toBe(30000);
  });
});

describe('ScoreSyncQueue', () => {
  it('marks a freshly entered score pending and immediately due to POST', () => {
    const q = new ScoreSyncQueue();
    q.enqueue('p1', 5, { hole: 5, strokes: 4 });
    expect(q.statusOf('p1', 5)).toBe('pending');
    expect(q.due(0).map((e) => [e.pid, e.hole])).toEqual([['p1', 5]]);
  });

  it('drops a saved score from the due queue and from the unsaved set', () => {
    const q = new ScoreSyncQueue();
    q.enqueue('p1', 5, { hole: 5, strokes: 4 });
    q.markSaved('p1', 5);
    expect(q.statusOf('p1', 5)).toBe('saved');
    expect(q.due(0)).toEqual([]);
    expect(q.hasUnsaved()).toBe(false);
  });

  it('on failure stays unsaved and is not retried before the backoff elapses', () => {
    const q = new ScoreSyncQueue();
    q.enqueue('p1', 5, { hole: 5, strokes: 4 });
    q.markFailed('p1', 5, 1000); // now = 1000, attempt 1 -> next at 1000 + backoff(1)=1000 => 2000
    expect(q.statusOf('p1', 5)).toBe('failed');
    expect(q.hasUnsaved()).toBe(true);
    expect(q.due(1500)).toEqual([]); // not yet due
    expect(q.due(2000).map((e) => [e.pid, e.hole])).toEqual([['p1', 5]]); // due now
  });

  it('escalates the backoff with each repeated failure', () => {
    const q = new ScoreSyncQueue();
    q.enqueue('p1', 5, { hole: 5, strokes: 4 });
    q.markFailed('p1', 5, 0); // attempt 1 -> next at 1000
    expect(q.due(1000).length).toBe(1);
    q.markFailed('p1', 5, 1000); // attempt 2 -> next at 1000 + 2000 = 3000
    expect(q.due(2999)).toEqual([]);
    expect(q.due(3000).length).toBe(1);
  });

  it('re-entering a score (correction) resets it to pending, even if it was saved', () => {
    const q = new ScoreSyncQueue();
    q.enqueue('p1', 5, { hole: 5, strokes: 4 });
    q.markSaved('p1', 5);
    q.enqueue('p1', 5, { hole: 5, strokes: 6 }); // golfer corrects the score
    expect(q.statusOf('p1', 5)).toBe('pending');
    expect(q.bodyOf('p1', 5)).toEqual({ hole: 5, strokes: 6 });
    expect(q.due(0).length).toBe(1);
  });

  it('counts unsaved entries across every player and hole (basis of the finish guard)', () => {
    const q = new ScoreSyncQueue();
    q.enqueue('p1', 1, { hole: 1, strokes: 4 });
    q.enqueue('p2', 1, { hole: 1, strokes: 5 });
    q.markSaved('p1', 1);
    expect(q.unsavedCount()).toBe(1);
    expect(q.hasUnsaved()).toBe(true);
    q.markSaved('p2', 1);
    expect(q.unsavedCount()).toBe(0);
    expect(q.hasUnsaved()).toBe(false);
  });

  it('ignores acks for a key it never saw', () => {
    const q = new ScoreSyncQueue();
    expect(() => q.markSaved('x', 9)).not.toThrow();
    expect(() => q.markFailed('x', 9, 0)).not.toThrow();
    expect(q.statusOf('x', 9)).toBeUndefined();
  });

  it('hands back the exact POST body to retry (incl. pickup + host player_id hint)', () => {
    const q = new ScoreSyncQueue();
    q.enqueue('p1', 3, { hole: 3, picked_up: true, player_id: 'p1' });
    const [entry] = q.due(0);
    expect(entry.body).toEqual({ hole: 3, picked_up: true, player_id: 'p1' });
  });
});

describe('ScoreSyncQueue — persistance offline-first', () => {
  const KEY = 'scluba:sync:ABC';
  function fakeStorage() {
    const data: Record<string, string> = {};
    return {
      _data: data,
      getItem: (k: string) => (k in data ? data[k] : null),
      setItem: (k: string, v: string) => {
        data[k] = v;
      },
    };
  }

  it('persiste une saisie dans le storage injecté', () => {
    const s = fakeStorage();
    const q = new ScoreSyncQueue({ storage: s, key: KEY });
    q.enqueue('p1', 5, { hole: 5, strokes: 4 });
    expect(s._data[KEY]).toBeTruthy();
    expect(JSON.parse(s._data[KEY]).entries).toHaveLength(1);
  });

  it('survit à un reload : une nouvelle instance retrouve les scores non synchronisés', () => {
    const s = fakeStorage();
    const q1 = new ScoreSyncQueue({ storage: s, key: KEY });
    q1.enqueue('p1', 5, { hole: 5, strokes: 4 });
    q1.markFailed('p1', 5, 0);
    const q2 = new ScoreSyncQueue({ storage: s, key: KEY }); // « reload »
    expect(q2.statusOf('p1', 5)).toBe('failed');
    expect(q2.hasUnsaved()).toBe(true);
    expect(q2.bodyOf('p1', 5)).toEqual({ hole: 5, strokes: 4 });
  });

  it('un score confirmé reste saved après reload (pas de re-POST)', () => {
    const s = fakeStorage();
    const q1 = new ScoreSyncQueue({ storage: s, key: KEY });
    q1.enqueue('p1', 5, { hole: 5, strokes: 4 });
    q1.markSaved('p1', 5);
    const q2 = new ScoreSyncQueue({ storage: s, key: KEY });
    expect(q2.statusOf('p1', 5)).toBe('saved');
    expect(q2.hasUnsaved()).toBe(false);
  });

  it("mémorise l'intention de terminer hors-ligne à travers un reload", () => {
    const s = fakeStorage();
    const q1 = new ScoreSyncQueue({ storage: s, key: KEY });
    expect(q1.isFinishRequested()).toBe(false);
    q1.requestFinish();
    const q2 = new ScoreSyncQueue({ storage: s, key: KEY });
    expect(q2.isFinishRequested()).toBe(true);
    q2.clearFinish();
    const q3 = new ScoreSyncQueue({ storage: s, key: KEY });
    expect(q3.isFinishRequested()).toBe(false);
  });

  it("expose toutes les entrées pour réhydrater l'affichage", () => {
    const s = fakeStorage();
    const q = new ScoreSyncQueue({ storage: s, key: KEY });
    q.enqueue('p1', 1, { hole: 1, strokes: 4 });
    q.enqueue('p2', 1, { hole: 1, picked_up: true });
    const all = q.allEntries().map((e) => `${e.pid}:${e.hole}`).sort();
    expect(all).toEqual(['p1:1', 'p2:1']);
  });

  it('ignore un storage corrompu sans planter', () => {
    const s = fakeStorage();
    s._data[KEY] = '{ pas du json';
    expect(() => new ScoreSyncQueue({ storage: s, key: KEY })).not.toThrow();
    expect(new ScoreSyncQueue({ storage: s, key: KEY }).hasUnsaved()).toBe(false);
  });

  it('sans storage : fonctionne en mémoire (rétrocompat)', () => {
    const q = new ScoreSyncQueue();
    q.enqueue('p1', 5, { hole: 5, strokes: 4 });
    expect(q.statusOf('p1', 5)).toBe('pending');
  });
});
