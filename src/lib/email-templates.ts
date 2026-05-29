export const EMAIL_TEMPLATE_KEYS = ['outreach', 'demo_prospect', 'demo_pilote', 'demo_reminder'] as const;
export type EmailTemplateKey = (typeof EMAIL_TEMPLATE_KEYS)[number];

// Libellés affichés (source unique : Paramètres, fiche prospect, compositeur).
export const EMAIL_TEMPLATE_LABELS: Record<EmailTemplateKey, string> = {
  outreach: 'Mail de démarchage / explicatif',
  demo_prospect: 'Visio - Prospect',
  demo_pilote: 'Visio - Pilote',
  demo_reminder: 'Mail rappel visio (H-24)',
};

export interface EmailTemplate {
  key: EmailTemplateKey;
  name: string;
  subject: string;
  body: string;
  updated_at: string;
}

export interface TemplateVars {
  prenom?: string;
  club?: string;
  lien_visio?: string;
  demo_quand?: string;
  jour?: string;
  heure?: string;
}

// Remplace {{token}} (avec espaces tolérés : {{ club }}) par la valeur fournie,
// chaîne vide si absente.
export function renderTemplate(text: string, vars: TemplateVars): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key: string) => {
    const v = (vars as Record<string, string | undefined>)[key];
    return v ?? '';
  });
}

// Lien de composition Outlook Web (Microsoft 365) — ouvre un brouillon pré-rempli.
export function outlookComposeUrl(to: string, subject: string, body: string): string {
  const params = new URLSearchParams({ to, subject, body });
  return `https://outlook.office.com/mail/deeplink/compose?${params.toString()}`;
}
