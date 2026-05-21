import { z } from 'zod';
import { resolveRoundHoles, type Round, type Club } from '../clubs-types';

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

// Identifier of a row in clubs.course_data.formats (e.g. "18", "9-plaine").
// Validity against that array is checked lazily at render time via
// resolveRoundHoles — a stale/unknown id falls back to the flat course holes.
export const formatIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(/^[a-z0-9-]+$/, 'format invalide');

export const scoringModeSchema = z.enum(['self', 'host']);

export const createRoundSchema = z.object({
  slug: slugSchema,
  display_name: displayNameSchema,
  additional_players: additionalPlayersSchema,
  format_id: formatIdSchema.optional(),
  scoring_mode: scoringModeSchema.optional(),
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

// Saisie d'un score sur un trou. Deux modes possibles :
//   (a) score normal — `strokes` est fourni (1..20), `picked_up` est false ou absent
//   (b) trou abandonné — `picked_up: true`, `strokes` est null/absent
//
// `player_id` est optionnel : par défaut, le score est attribué au joueur
// identifié par le cookie. Le host (créateur de la partie) peut le fournir
// pour saisir au nom d'un autre joueur (mode multi-joueurs sur un seul
// téléphone). La vérification que l'appelant est bien le créateur est faite
// côté API — voir `src/pages/api/rounds/[shortCode]/scores.ts`.
export const scoreSchema = z
  .object({
    hole: holeSchema,
    strokes: strokesSchema.nullable().optional(),
    picked_up: z.boolean().optional(),
    player_id: uuidSchema.optional(),
  })
  .refine(
    (v) => {
      const hasStrokes = typeof v.strokes === 'number';
      const isPickup = v.picked_up === true;
      return hasStrokes !== isPickup; // XOR : exactement un des deux
    },
    { message: 'strokes ou picked_up requis (pas les deux)' },
  );

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

// Resolves the round's actual hole list (handles 9-hole formats, multi-loop
// composites) and asserts `hole` falls inside it. Returns null on success,
// or a French error string. Used by /scores to prevent stale-hole writes on
// 9-hole rounds (audit LOW → bundled into the HIGH scoring fix).
export function validateHoleForRound(
  hole: number,
  round: Pick<Round, 'format_id'>,
  club: Pick<Club, 'course_data'>,
): string | null {
  const holes = resolveRoundHoles(round as Round, club as Club);
  if (holes.length === 0) return 'parcours indisponible';
  const max = holes.length;
  if (!Number.isInteger(hole) || hole < 1 || hole > max) {
    return `trou hors parcours (1..${max})`;
  }
  return null;
}
