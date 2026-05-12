import { z } from 'zod';

export const slugSchema = z
  .string()
  .trim()
  .min(1, 'slug requis')
  .max(60, 'slug trop long')
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug invalide');

export const shortCodeSchema = z
  .string()
  .trim()
  .transform((s) => s.toUpperCase())
  .pipe(z.string().regex(/^[A-Z0-9]{4,8}$/, 'code de partie invalide'));

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, 'prénom requis')
  .max(40, 'prénom trop long (40 max)')
  .regex(/^[\p{L}\p{M}0-9 ’'\-_.]+$/u, 'caractères non autorisés');

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(254)
  .email('email invalide');

export const uuidSchema = z.string().uuid('identifiant invalide');

export const holeSchema = z.coerce.number().int().min(1).max(18);
export const strokesSchema = z.coerce.number().int().min(1).max(20);

// Bots that auto-fill every field will put something here; humans never see
// the input. Server: any non-empty value → reject.
export const honeypotSchema = z.string().max(0, 'spam_detected').optional();

// Up to 7 additional players (a foursome is 4 = creator + 3, but allow a
// little headroom for two groups merging). Names are deduplicated and trimmed
// in the API handler.
export const additionalPlayersSchema = z
  .array(displayNameSchema)
  .max(7, 'trop de joueurs (7 max en plus de toi)')
  .optional();

export const createRoundSchema = z.object({
  slug: slugSchema,
  display_name: displayNameSchema,
  additional_players: additionalPlayersSchema,
  hp_email: honeypotSchema,
});

export const joinRoundSchema = z.object({
  display_name: displayNameSchema,
  hp_email: honeypotSchema,
});

// Claim flow: pick an existing placeholder slot (placeholder_id) OR add
// yourself as a brand-new player with a free-text display_name. Exactly one
// of the two must be provided.
export const claimSlotSchema = z
  .object({
    placeholder_id: uuidSchema.optional(),
    display_name: displayNameSchema.optional(),
    hp_email: honeypotSchema,
  })
  .refine(
    (v) => Boolean(v.placeholder_id) !== Boolean(v.display_name),
    { message: 'placeholder_id ou display_name requis (pas les deux)' },
  );

// Organizer adds a missing teammate name after the QR has been shown.
export const addPlayerSchema = z.object({
  display_name: displayNameSchema,
  hp_email: honeypotSchema,
});

export const findRoundSchema = z.object({
  display_name: displayNameSchema,
  hp_email: honeypotSchema,
});

export const scoreSchema = z.object({
  hole: holeSchema,
  strokes: strokesSchema,
});

export const magicLinkSchema = z.object({
  email: emailSchema,
  next: z.string().max(500).optional(),
  hp_email: honeypotSchema,
});

export type CreateRoundInput = z.infer<typeof createRoundSchema>;
export type JoinRoundInput = z.infer<typeof joinRoundSchema>;
export type ClaimSlotInput = z.infer<typeof claimSlotSchema>;
export type AddPlayerInput = z.infer<typeof addPlayerSchema>;
export type FindRoundInput = z.infer<typeof findRoundSchema>;
export type ScoreInput = z.infer<typeof scoreSchema>;
export type MagicLinkInput = z.infer<typeof magicLinkSchema>;

export function formatZodError(err: z.ZodError): string {
  return err.issues.map((i) => i.message).join(' · ');
}
