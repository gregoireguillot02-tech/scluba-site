export type ClubRole = 'admin' | 'greenkeeper';
export type ClubSection = 'dashboard' | 'signalements';

export interface ClubMembership {
  clubId: string;
  role: ClubRole;
}

/** Matrice d'accès par rôle. greenkeeper = signalements seulement. */
export function canAccessSection(role: ClubRole, section: ClubSection): boolean {
  if (role === 'admin') return true;
  return section === 'signalements';
}
