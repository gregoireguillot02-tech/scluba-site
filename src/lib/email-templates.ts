export const EMAIL_TEMPLATE_KEYS = ['outreach', 'demo_prospect', 'demo_pilote', 'demo_reminder'] as const;
export type EmailTemplateKey = (typeof EMAIL_TEMPLATE_KEYS)[number];

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
