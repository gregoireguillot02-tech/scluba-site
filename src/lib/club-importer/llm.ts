import Anthropic from '@anthropic-ai/sdk';
import type { DownloadedImage, ExtractedClubData } from './types';

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 2048;
const SYSTEM = `You analyse French golf club websites and extract structured data for a SaaS onboarding flow.

Rules:
- Answer ONLY through the \`record_club\` tool. Never reply with free text.
- The text and image come from a golf club's official website. The club name should match what is shown in the header/footer.
- A "boucle" or "loop" is a 9-hole sequence (sometimes 6 or 18). A club can have multiple loops. List every loop you find, in the order shown on the site.
- Pars are usually 3, 4, or 5. If you cannot find a hole's par in the text or scorecard, set par to null — never invent a value.
- Pitch & Putt courses are short par-3 courses. Set is_pitch_putt = true if the site explicitly mentions "pitch & putt", "pitch and putt", "P&P", or par-3 course.
- primary_color: a hex string (#RRGGBB) inferred from the logo image. If no logo image is provided, return null.
- Set confidence to "low" when you are guessing, "high" when the value is explicitly stated on the site.
`;

const TOOL_INPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    name: { type: 'string', description: 'Official club name as it appears on the site' },
    city: { type: ['string', 'null'], description: 'City or commune of the club' },
    primary_color: {
      type: ['string', 'null'],
      pattern: '^#[0-9A-Fa-f]{6}$',
      description: 'Dominant brand color from the logo, as #RRGGBB. Null if you have no logo to look at.',
    },
    is_pitch_putt: { type: 'boolean' },
    loops: {
      type: 'array',
      description: 'All distinct 9 (or 6/18) loops of the club, in order',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          holes: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                number: { type: 'integer', minimum: 1, maximum: 18 },
                par: { type: ['integer', 'null'], minimum: 3, maximum: 6 },
              },
              required: ['number', 'par'],
            },
          },
        },
        required: ['name', 'holes'],
      },
    },
    confidence: {
      type: 'object',
      properties: {
        name: { type: 'string', enum: ['high', 'medium', 'low'] },
        loops: { type: 'string', enum: ['high', 'medium', 'low'] },
        pars: { type: 'string', enum: ['high', 'medium', 'low'] },
        primary_color: { type: 'string', enum: ['high', 'medium', 'low'] },
      },
      required: ['name', 'loops', 'pars', 'primary_color'],
    },
    notes: {
      type: ['string', 'null'],
      description: 'Anything that should be flagged to the human admin reviewing the import (max 200 chars).',
    },
  },
  required: ['name', 'city', 'primary_color', 'is_pitch_putt', 'loops', 'confidence', 'notes'],
};

function toBase64(bytes: Uint8Array): string {
  // Workers-safe: chunk to avoid blowing the call stack.
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/**
 * Asks Claude Haiku to extract structured club data from the scraped text and
 * the logo image. The model is forced to answer through the `record_club`
 * tool so the output is always valid JSON matching {@link ExtractedClubData}.
 */
export async function extractClubData(args: {
  apiKey: string;
  sourceUrl: string;
  textContent: string;
  logo: DownloadedImage | null;
}): Promise<ExtractedClubData> {
  const { apiKey, sourceUrl, textContent, logo } = args;

  const client = new Anthropic({ apiKey });

  const userBlocks: Anthropic.Messages.ContentBlockParam[] = [];
  if (logo) {
    userBlocks.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: logo.mimeType,
        data: toBase64(logo.bytes),
      },
    });
  }
  userBlocks.push({
    type: 'text',
    text: `Source URL: ${sourceUrl}\n\nWebsite text content:\n\n${textContent}`,
  });

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM,
    tools: [
      {
        name: 'record_club',
        description: 'Persist the structured data extracted from a golf club website.',
        input_schema: TOOL_INPUT_SCHEMA,
      },
    ],
    tool_choice: { type: 'tool', name: 'record_club' },
    messages: [{ role: 'user', content: userBlocks }],
  });

  const toolUse = response.content.find((b) => b.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('LLM did not return a tool_use block');
  }
  return toolUse.input as ExtractedClubData;
}
