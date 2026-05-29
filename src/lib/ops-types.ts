export const PROSPECT_STATUSES = [
  'to_contact',
  'contacted',
  'in_discussion',
  'page_created',
  'qr_sent',
  'demo_scheduled',
  'active_client',
  'lost',
] as const;

export type ProspectStatus = (typeof PROSPECT_STATUSES)[number];

export const STATUS_LABELS: Record<ProspectStatus, string> = {
  to_contact: 'À contacter',
  contacted: 'Contacté',
  in_discussion: 'En discussion',
  page_created: 'Page créée',
  qr_sent: 'QR envoyé',
  demo_scheduled: 'Démo prévue',
  active_client: 'Client actif',
  lost: 'Perdu',
};

export const STATUS_COLORS: Record<ProspectStatus, string> = {
  to_contact: '#9CA3AF',
  contacted: '#60A5FA',
  in_discussion: '#A78BFA',
  page_created: '#FBBF24',
  qr_sent: '#FB923C',
  demo_scheduled: '#34D399',
  active_client: '#10B981',
  lost: '#EF4444',
};

export const OWNERS = ['greg', 'paul', 'shared'] as const;
export type Owner = (typeof OWNERS)[number];

// Type d'exploitation du golf (prospection à froid).
export const CLUB_TYPES = ['ugolf', 'bluegreen', 'resort', 'independant', 'municipal', 'associatif', 'autre'] as const;
export type ClubType = (typeof CLUB_TYPES)[number];

export const CLUB_TYPE_LABELS: Record<ClubType, string> = {
  ugolf: 'UGolf',
  bluegreen: 'Bluegreen',
  resort: 'Resort',
  independant: 'Indépendant',
  municipal: 'Municipal',
  associatif: 'Associatif',
  autre: 'Autre',
};

export const OWNER_LABELS: Record<Owner, string> = {
  greg: 'Grégoire',
  paul: 'Paul',
  shared: 'Les deux',
};

export const EVENT_TYPES = [
  'note',
  'email_sent',
  'call',
  'meeting',
  'page_created',
  'qr_sent',
  'demo_scheduled',
  'status_change',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_LABELS: Record<EventType, string> = {
  note: 'Note',
  email_sent: 'Email envoyé',
  call: 'Appel',
  meeting: 'RDV',
  page_created: 'Page créée',
  qr_sent: 'QR envoyé',
  demo_scheduled: 'Démo prévue',
  status_change: 'Statut changé',
};

export interface Prospect {
  id: string;
  club_name: string;
  contact_name: string | null;
  contact_role: string | null;
  club_type: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  region: string | null;
  status: ProspectStatus;
  owner: Owner;
  notes: string | null;
  source: string | null;
  next_action_at: string | null;
  next_action_note: string | null;
  demo_at: string | null;
  demo_link: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProspectEvent {
  id: string;
  prospect_id: string;
  type: EventType;
  body: string | null;
  author: string | null;
  created_at: string;
}

export interface ProspectAction {
  id: string;
  prospect_id: string;
  due_on: string;
  note: string | null;
  done: boolean;
  done_at: string | null;
  created_at: string;
}

export const TASK_STATUSES = ['todo', 'doing', 'done'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'À faire',
  doing: 'En cours',
  done: 'Fait',
};

export interface Task {
  id: string;
  title: string;
  description: string | null;
  assignee: Owner;
  due_date: string | null;
  status: TaskStatus;
  done: boolean;
  done_at: string | null;
  prospect_id: string | null;
  created_by: string | null;
  created_at: string;
}

export interface Lead {
  id: string;
  name: string;
  club: string;
  email: string;
  locale: string | null;
  user_agent: string | null;
  created_at: string;
}
