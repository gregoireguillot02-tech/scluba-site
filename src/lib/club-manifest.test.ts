import { describe, it, expect } from 'vitest';
import { buildClubManifest } from './club-manifest';

describe('buildClubManifest', () => {
  it('utilise icon_url quand présent', () => {
    const m = buildClubManifest(
      { name: 'Teoula', icon_url: 'https://x/icon.png', logo_url: 'https://x/logo.png', primary_color: '#1B4332' },
      'ABCD1234',
    );
    expect(m.name).toBe('Teoula — Scluba');
    expect(m.short_name).toBe('Teoula');
    expect(m.icons[0].src).toBe('https://x/icon.png');
    expect(m.icons[0].sizes).toBe('512x512');
    expect(m.display).toBe('browser');
    expect(m.theme_color).toBe('#1B4332');
    expect(m.start_url).toBe('/r/ABCD1234/');
  });

  it("retombe sur logo_url si pas d'icon_url", () => {
    const m = buildClubManifest(
      { name: 'Teoula', icon_url: null, logo_url: 'https://x/logo.png', primary_color: null },
      'ABCD1234',
    );
    expect(m.icons[0].src).toBe('https://x/logo.png');
    expect(m.theme_color).toBe('#0EA968'); // défaut
  });

  it('retombe sur favicon.svg si aucun logo', () => {
    const m = buildClubManifest({ name: 'Teoula', icon_url: null, logo_url: null, primary_color: null }, 'ABCD1234');
    expect(m.icons[0].src).toBe('/favicon.svg');
    expect(m.icons[0].type).toBe('image/svg+xml');
    expect(m.icons[0].sizes).toBe('any');
  });

  it('gère un club null (manifest Scluba générique)', () => {
    const m = buildClubManifest(null, 'ABCD1234');
    expect(m.name).toBe('Scluba');
    expect(m.short_name).toBe('Scluba');
    expect(m.icons[0].src).toBe('/favicon.svg');
  });
});
