import { describe, it, expect } from 'vitest';
import { otpRequestSchema, otpVerifySchema } from './schemas';

describe('otpRequestSchema', () => {
  it('accepte un email valide', () => {
    const r = otpRequestSchema.safeParse({ email: 'a@b.com' });
    expect(r.success).toBe(true);
  });

  it('rejette un email invalide', () => {
    const r = otpRequestSchema.safeParse({ email: 'nope' });
    expect(r.success).toBe(false);
  });

  it('rejette si honeypot rempli', () => {
    const r = otpRequestSchema.safeParse({ email: 'a@b.com', hp_email: 'bot@bot.com' });
    expect(r.success).toBe(false);
  });

  it('accepte un next optionnel', () => {
    const r = otpRequestSchema.safeParse({ email: 'a@b.com', next: '/foo' });
    expect(r.success).toBe(true);
  });
});

describe('otpVerifySchema', () => {
  it('accepte email + token 6 chiffres', () => {
    const r = otpVerifySchema.safeParse({ email: 'a@b.com', token: '123456' });
    expect(r.success).toBe(true);
  });

  it('rejette token < 6 chiffres', () => {
    const r = otpVerifySchema.safeParse({ email: 'a@b.com', token: '12345' });
    expect(r.success).toBe(false);
  });

  it('rejette token avec lettres', () => {
    const r = otpVerifySchema.safeParse({ email: 'a@b.com', token: '12345a' });
    expect(r.success).toBe(false);
  });

  it('trim le token', () => {
    const r = otpVerifySchema.safeParse({ email: 'a@b.com', token: ' 123456 ' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.token).toBe('123456');
  });

  it('rejette token > 6 chiffres', () => {
    const r = otpVerifySchema.safeParse({ email: 'a@b.com', token: '1234567' });
    expect(r.success).toBe(false);
  });

  it('rejette si honeypot rempli', () => {
    const r = otpVerifySchema.safeParse({ email: 'a@b.com', token: '123456', hp_email: 'bot@bot.com' });
    expect(r.success).toBe(false);
  });
});
