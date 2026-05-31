import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { saveActiveRound, getActiveRound, clearActiveRound } from './active-round';

const sample = {
  shortCode: 'K7M2QP',
  clubSlug: 'teoula',
  clubName: 'Golf de Téoula',
  playerName: 'Antoine',
};

// Faux localStorage Map-backed : le jsdom de ce projet n'expose pas un Storage
// complet (.clear absent), et le module lit le global directement.
function installFakeStorage(): void {
  const map = new Map<string, string>();
  const fake = {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  };
  vi.stubGlobal('localStorage', fake);
}

beforeEach(() => {
  installFakeStorage();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('active-round', () => {
  it('mémorise puis relit la partie courante', () => {
    saveActiveRound(sample);
    const got = getActiveRound();
    expect(got).toMatchObject(sample);
    expect(typeof got?.ts).toBe('number');
  });

  it('renvoie null sans partie mémorisée', () => {
    expect(getActiveRound()).toBeNull();
  });

  it('ignore une saisie sans shortCode / clubSlug', () => {
    saveActiveRound({ ...sample, shortCode: '' });
    expect(getActiveRound()).toBeNull();
  });

  it('périme une partie de plus de 12 h et la nettoie', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-31T08:00:00Z'));
    saveActiveRound(sample);
    expect(getActiveRound()).not.toBeNull();

    // +13 h → périmée
    vi.setSystemTime(new Date('2026-05-31T21:00:00Z'));
    expect(getActiveRound()).toBeNull();
    // …et le storage a été purgé
    expect(localStorage.getItem('scluba:active-round')).toBeNull();
  });

  it('garde une partie de moins de 12 h', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-31T08:00:00Z'));
    saveActiveRound(sample);
    vi.setSystemTime(new Date('2026-05-31T19:00:00Z')); // +11 h
    expect(getActiveRound()).toMatchObject(sample);
  });

  it('clearActiveRound() sans argument efface', () => {
    saveActiveRound(sample);
    clearActiveRound();
    expect(getActiveRound()).toBeNull();
  });

  it("clearActiveRound(autreCode) n'efface PAS une autre partie active", () => {
    saveActiveRound(sample);
    clearActiveRound('AUTRE9'); // un vieil onglet recap d'une autre partie
    expect(getActiveRound()).toMatchObject(sample);
  });

  it('clearActiveRound(memeCode) efface bien la partie', () => {
    saveActiveRound(sample);
    clearActiveRound(sample.shortCode);
    expect(getActiveRound()).toBeNull();
  });

  it('renvoie null sur storage corrompu', () => {
    localStorage.setItem('scluba:active-round', '{pas du json');
    expect(getActiveRound()).toBeNull();
  });
});
