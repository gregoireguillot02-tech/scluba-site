export type ClubRole = 'admin' | 'greenkeeper';
export type ClubSection = 'dashboard' | 'signalements';

export interface ClubMembership {
  clubId: string;
  role: ClubRole;
}

/** Token d'invitation url-safe non devinable (base64url de 24 octets aléatoires). */
export function generateInviteToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Une invite est utilisable si non consommée et non expirée. */
export function isInviteUsable(
  invite: { used_at: string | null; expires_at: string },
  now: Date,
): boolean {
  if (invite.used_at) return false;
  return new Date(invite.expires_at).getTime() > now.getTime();
}

/** Matrice d'accès par rôle. greenkeeper = signalements seulement. */
export function canAccessSection(role: ClubRole, section: ClubSection): boolean {
  if (role === 'admin') return true;
  return section === 'signalements';
}
