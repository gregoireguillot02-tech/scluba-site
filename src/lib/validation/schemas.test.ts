import { describe, it, expect } from 'vitest';
import { courseReportSchema } from './schemas';

describe('courseReportSchema', () => {
  it('accepte un signalement valide', () => {
    const r = courseReportSchema.safeParse({ hole_number: 5, category: 'bunker', comment: 'sable trop sec' });
    expect(r.success).toBe(true);
  });
  it('accepte un commentaire vide', () => {
    const r = courseReportSchema.safeParse({ hole_number: 5, category: 'green', comment: '' });
    expect(r.success).toBe(true);
  });
  it('accepte sans commentaire (defaut vide)', () => {
    const r = courseReportSchema.safeParse({ hole_number: 5, category: 'green' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.comment).toBe('');
  });
  it('refuse une catégorie inconnue', () => {
    const r = courseReportSchema.safeParse({ hole_number: 5, category: 'volcan', comment: '' });
    expect(r.success).toBe(false);
  });
  it('refuse un trou hors 1-18', () => {
    expect(courseReportSchema.safeParse({ hole_number: 19, category: 'green' }).success).toBe(false);
    expect(courseReportSchema.safeParse({ hole_number: 0, category: 'green' }).success).toBe(false);
  });
  it('refuse un commentaire > 200 chars', () => {
    const r = courseReportSchema.safeParse({ hole_number: 5, category: 'green', comment: 'x'.repeat(201) });
    expect(r.success).toBe(false);
  });
});
