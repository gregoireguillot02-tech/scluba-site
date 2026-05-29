const DEFAULT_ICON = '/favicon.svg';
const DEFAULT_THEME = '#0EA968';

export interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose: string;
}

export interface ClubManifest {
  name: string;
  short_name: string;
  icons: ManifestIcon[];
  display: 'browser';
  theme_color: string;
  background_color: string;
  start_url: string;
}

type ClubLike = {
  name?: string | null;
  icon_url?: string | null;
  logo_url?: string | null;
  primary_color?: string | null;
} | null;

/**
 * Construit le manifest PWA d'un club. `display: "browser"` → pas de standalone
 * ni de prompt d'installation : l'app reste dans le navigateur, on ne récupère
 * que l'icône + le nom à l'ajout à l'écran d'accueil.
 */
export function buildClubManifest(club: ClubLike, shortCode: string): ClubManifest {
  const clubName = club?.name ?? null;
  const clubIcon = club?.icon_url ?? club?.logo_url ?? null;
  const icons: ManifestIcon[] = clubIcon
    ? [{ src: clubIcon, sizes: '512x512', type: 'image/png', purpose: 'any' }]
    : [{ src: DEFAULT_ICON, sizes: 'any', type: 'image/svg+xml', purpose: 'any' }];
  return {
    name: clubName ? `${clubName} — Scluba` : 'Scluba',
    short_name: clubName ?? 'Scluba',
    icons,
    display: 'browser',
    theme_color: club?.primary_color ?? DEFAULT_THEME,
    background_color: '#FFFFFF',
    start_url: `/r/${shortCode}/`,
  };
}
