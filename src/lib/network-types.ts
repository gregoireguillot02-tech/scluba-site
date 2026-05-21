// Types et constantes pour la table network_contacts (annuaire écosystème FFGolf).
// Calqué sur src/lib/ops-types.ts (prospects-clubs).

export const NETWORK_STATUSES = ['to_contact', 'contacted', 'intro_done', 'dead'] as const;
export type NetworkStatus = (typeof NETWORK_STATUSES)[number];

export const NETWORK_STATUS_LABELS: Record<NetworkStatus, string> = {
  to_contact: 'À contacter',
  contacted: 'Contacté',
  intro_done: 'Intro faite',
  dead: 'Pas d\'intérêt',
};

export const NETWORK_STATUS_COLORS: Record<NetworkStatus, string> = {
  to_contact: '#9CA3AF',
  contacted: '#60A5FA',
  intro_done: '#10B981',
  dead: '#EF4444',
};

export const ORG_TYPES = ['chaine', 'ligue', 'asso'] as const;
export type OrgType = (typeof ORG_TYPES)[number];

export const ORG_TYPE_LABELS: Record<OrgType, string> = {
  chaine: 'Chaîne',
  ligue: 'Ligue',
  asso: 'Association',
};

export const ORG_TYPE_COLORS: Record<OrgType, string> = {
  chaine: '#A78BFA',
  ligue: '#FBBF24',
  asso: '#34D399',
};

export interface NetworkContact {
  id: string;
  name: string;
  role: string | null;
  org: string;
  org_type: OrgType;
  region: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  status: NetworkStatus;
  notes: string | null;
  intros_made: string[];
  created_at: string;
  updated_at: string;
}
