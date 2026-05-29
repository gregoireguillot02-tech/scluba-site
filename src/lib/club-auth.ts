export type ClubRole = 'admin' | 'greenkeeper';
export type ClubSection = 'dashboard' | 'signalements';

export interface ClubMembership {
  clubId: string;
  role: ClubRole;
  // Email du membre connecté (issu de la session signée). Sert d'identité pour
  // l'audit, ex. resolved_by sur un signalement traité.
  email: string;
}

/** Matrice d'accès par rôle. greenkeeper = signalements seulement. */
export function canAccessSection(role: ClubRole, section: ClubSection): boolean {
  if (role === 'admin') return true;
  return section === 'signalements';
}
