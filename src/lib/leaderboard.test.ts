import { describe, it, expect } from 'vitest';
import { fmtToPar, ecartToLeader } from './leaderboard';

describe('fmtToPar — format unique du score vs par', () => {
  it('affiche — tant qu\'aucun trou n\'est joué', () => {
    expect(fmtToPar(0, 0)).toBe('—');
    expect(fmtToPar(5, 0)).toBe('—');
  });
  it('affiche ±0 quand on est pile au par', () => {
    expect(fmtToPar(0, 6)).toBe('±0');
  });
  it('préfixe + au-dessus du par', () => {
    expect(fmtToPar(3, 6)).toBe('+3');
    expect(fmtToPar(11, 9)).toBe('+11');
  });
  it('garde le signe - en-dessous du par', () => {
    expect(fmtToPar(-2, 6)).toBe('-2');
  });
});

describe('ecartToLeader — retard sur le leader', () => {
  it('affiche ±0 pour le leader (même diff) ou un ex æquo', () => {
    expect(ecartToLeader(2, 2)).toBe('±0');
    expect(ecartToLeader(-3, -3)).toBe('±0');
  });
  it('affiche +N de retard sur le leader', () => {
    expect(ecartToLeader(5, 2)).toBe('+3');
    expect(ecartToLeader(0, -3)).toBe('+3');
  });
});
