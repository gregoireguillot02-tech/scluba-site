import { createBrowserClient } from '@supabase/ssr';
import type { Club, CourseHole, RoundPlayer } from './clubs-types';
import { scoreType } from './clubs-types';

const TARGET_W = 1080;
const TARGET_H = 1350;
const JPEG_QUALITY = 0.85;

export async function compressPhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' as ImageOrientation });
  try {
    const canvas = document.createElement('canvas');
    canvas.width = TARGET_W;
    canvas.height = TARGET_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d context unavailable');

    // cover 4:5 — crop centré
    const srcAspect = bitmap.width / bitmap.height;
    const dstAspect = TARGET_W / TARGET_H;
    let sx = 0, sy = 0, sw = bitmap.width, sh = bitmap.height;
    if (srcAspect > dstAspect) {
      sw = bitmap.height * dstAspect;
      sx = (bitmap.width - sw) / 2;
    } else {
      sh = bitmap.width / dstAspect;
      sy = (bitmap.height - sh) / 2;
    }
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, TARGET_W, TARGET_H);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('toBlob returned null'))),
        'image/jpeg',
        JPEG_QUALITY,
      );
    });
  } finally {
    bitmap.close();
  }
}

const BUCKET = 'round-share-photos';

function browserClient() {
  const url = import.meta.env.PUBLIC_SUPABASE_URL as string;
  const key = import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string;
  return createBrowserClient(url, key);
}

export async function uploadSharePhoto(roundId: string, blob: Blob): Promise<string> {
  const sb = browserClient();
  const path = `${roundId}/cover.jpg`;

  const { error: uploadError } = await sb.storage
    .from(BUCKET)
    .upload(path, blob, {
      upsert: true,
      contentType: 'image/jpeg',
      cacheControl: '60',
    });
  if (uploadError) throw uploadError;

  const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path);
  // bust cache au remplacement
  const url = `${pub.publicUrl}?v=${Date.now()}`;

  const { error: updateError } = await sb
    .from('rounds')
    .update({ share_photo_url: url })
    .eq('id', roundId);
  if (updateError) throw updateError;

  return url;
}

export interface LeaderboardEntry {
  display_name: string;
  is_me: boolean;
  strokes: number;
  diff: number;
  finished: boolean;
}

export interface ComposeSection {
  // Label drawn on the chip at the left of the row (e.g. "La Plaine",
  // "Le Vallon", or legacy "F9"/"B9").
  label: string;
  holes: CourseHole[];
}

export interface ComposeInput {
  photoUrl: string | null;
  player: RoundPlayer | null;
  club: Club;
  startedAt: string | null;
  holes: CourseHole[];
  scoresByHole: Record<number, number>;
  // Numéros des trous abandonnés (picked_up = true). Affichés "C" dans la
  // grille et comptés Par(trou) + 2 dans le total (Maximum Score, Rules of
  // Golf 2023). Absent ou tableau vide = aucun trou abandonné.
  pickedUpHoles?: number[];
  totalDiff: number;
  totalStrokes: number;
  holesPlayed: number;
  // Optional scorecard sections, one per loop. If omitted, the canvas falls
  // back to the legacy F9/B9 split (holes ≤ 9, holes > 9).
  sections?: ComposeSection[];
  // Optional override for the par sum displayed in the subtitle. Used when a
  // 9-hole format would otherwise show "Par 72" computed from the full club.
  totalPar?: number;
  // Par cumulé des seuls trous joués (utile quand la carte est incomplète :
  // on affiche "Par 28" pour 8 trous joués plutôt que "Par 71" pour le
  // parcours complet). Si absent ou si holesPlayed = holes.length, on utilise
  // totalPar/sum(holes.par).
  playedPar?: number;
  // Optional label rendered above the big score number on the PNG (e.g.
  // "LE BOIS", "PLAINE + VALLON"). Falls back to "{n} TROUS" when absent.
  formatLabel?: string;
  // Optional mini-leaderboard rendered between the scorecard grid and the
  // legend. Only set for multiplayer rounds; solo rounds omit it.
  leaderboard?: LeaderboardEntry[];
}

function fmtDateShort(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' });
}

function formatDiff(diff: number): string {
  if (diff === 0) return 'E';
  return diff > 0 ? `+${diff}` : `${diff}`;
}

const CELL_COLOR: Record<string, string> = {
  'eagle': '#A7E1B7',
  'birdie': '#D4E8D4',
  'par': '#F0E8D4',
  'bogey': '#E8D4D4',
  'double': '#D8A8A8',
};

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = url;
  });
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dx: number, dy: number, dw: number, dh: number,
) {
  const srcAspect = img.width / img.height;
  const dstAspect = dw / dh;
  let sx = 0, sy = 0, sw = img.width, sh = img.height;
  if (srcAspect > dstAspect) {
    sw = img.height * dstAspect;
    sx = (img.width - sw) / 2;
  } else {
    sh = img.width / dstAspect;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}

function drawTrackedText(
  ctx: CanvasRenderingContext2D,
  text: string, cx: number, y: number, tracking: number,
) {
  const widths = Array.from(text).map((c) => ctx.measureText(c).width);
  const totalW = widths.reduce((a, b) => a + b, 0) + tracking * (text.length - 1);
  let x = cx - totalW / 2;
  const prevAlign = ctx.textAlign;
  ctx.textAlign = 'left';
  for (let i = 0; i < text.length; i++) {
    ctx.fillText(text[i], x, y);
    x += widths[i] + tracking;
  }
  ctx.textAlign = prevAlign;
}

const FONT_STACK = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

// Couleurs des cells score (alignées sur recap.astro tokens)
const CELL_BIRDIE_BG = '#F5E6CF';   // --accent-soft
const CELL_BIRDIE_TXT = '#C0392B';
const CELL_BOGEY_BG = '#E8E5DD';
const CELL_BOGEY_TXT = '#6B7280';   // --muted
const CELL_PAR_BG = '#FFFFFF';
const CELL_PAR_BORDER = '#E8E1D0';
const CELL_EMPTY_BG = '#F0EDE3';
const CELL_EMPTY_TXT = '#B5AE9C';

function drawScoreRow(
  ctx: CanvasRenderingContext2D,
  holes: CourseHole[],
  scoresByHole: Record<number, number>,
  pickedUpSet: Set<number>,
  label: string,
  startY: number,
  clubColor: string,
) {
  const PAD_X = 48;
  const W = 1080;
  const GAP = 8;
  // Loop names like "La Plaine" / "Le Vallon" need a wider chip than the
  // legacy two-char "F9"/"B9". The 9 score cells share the remaining width
  // evenly. The font auto-shrinks if the label is unusually long.
  const LABEL_W = 180;
  const CELL_W = (W - 2 * PAD_X - LABEL_W - 9 * GAP) / 9;
  const CELL_H = 72;

  // Label chip — fond clubColor, font auto-fit
  drawRoundedRect(ctx, PAD_X, startY, LABEL_W, CELL_H, 8);
  ctx.fillStyle = clubColor;
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  let labelFont = 24;
  ctx.font = `800 ${labelFont}px ${FONT_STACK}`;
  while (ctx.measureText(label).width > LABEL_W - 16 && labelFont > 12) {
    labelFont -= 1;
    ctx.font = `800 ${labelFont}px ${FONT_STACK}`;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, PAD_X + LABEL_W / 2, startY + CELL_H / 2);

  // 9 score cells
  for (let i = 0; i < holes.length; i++) {
    const x = PAD_X + LABEL_W + GAP + i * (CELL_W + GAP);
    const holeNum = holes[i].number;
    const s = scoresByHole[holeNum];
    const isPickup = pickedUpSet.has(holeNum);
    const played = s !== undefined;
    const type = played ? scoreType(s, holes[i].par) : null;

    let bg: string;
    let txtColor: string;
    let hasBorder = false;
    let dashedBorder = false;
    let cellText: string;
    if (isPickup) {
      bg = '#F0EDE3';
      txtColor = '#8A8270';
      dashedBorder = true;
      cellText = 'C';
    } else if (!played) {
      bg = CELL_EMPTY_BG;
      txtColor = CELL_EMPTY_TXT;
      cellText = '—';
    } else if (type === 'birdie' || type === 'eagle') {
      bg = CELL_BIRDIE_BG;
      txtColor = CELL_BIRDIE_TXT;
      cellText = String(s);
    } else if (type === 'bogey' || type === 'double') {
      bg = CELL_BOGEY_BG;
      txtColor = CELL_BOGEY_TXT;
      cellText = String(s);
    } else {
      bg = CELL_PAR_BG;
      txtColor = clubColor;
      hasBorder = true;
      cellText = String(s);
    }

    drawRoundedRect(ctx, x, startY, CELL_W, CELL_H, 8);
    ctx.fillStyle = bg;
    ctx.fill();
    if (hasBorder || dashedBorder) {
      ctx.strokeStyle = dashedBorder ? '#A8A294' : CELL_PAR_BORDER;
      ctx.lineWidth = 1.5;
      if (dashedBorder) ctx.setLineDash([4, 4]);
      ctx.stroke();
      if (dashedBorder) ctx.setLineDash([]);
    }
    ctx.fillStyle = txtColor;
    ctx.font = `800 32px ${FONT_STACK}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(cellText, x + CELL_W / 2, startY + CELL_H / 2);
  }

  return CELL_H;
}

function drawLegend(
  ctx: CanvasRenderingContext2D,
  cy: number,
  W: number,
  clubColor: string,
  hasPickup: boolean,
) {
  const items: { label: string; bg: string; border: string | null }[] = [
    { label: 'Birdie', bg: CELL_BIRDIE_BG, border: null },
    { label: 'Par', bg: CELL_PAR_BG, border: CELL_PAR_BORDER },
    { label: 'Bogey', bg: CELL_BOGEY_BG, border: null },
  ];
  if (hasPickup) {
    items.push({ label: 'Abandonné', bg: '#F0EDE3', border: '#A8A294' });
  }
  const SWATCH = 22;
  const GAP_SWATCH_LABEL = 12;
  const GAP_ITEMS = 32;

  ctx.font = `500 22px ${FONT_STACK}`;
  const itemWidths = items.map((it) => SWATCH + GAP_SWATCH_LABEL + ctx.measureText(it.label).width);
  const totalW = itemWidths.reduce((a, b) => a + b, 0) + GAP_ITEMS * (items.length - 1);
  let xCursor = (W - totalW) / 2;

  ctx.textBaseline = 'middle';
  for (let i = 0; i < items.length; i++) {
    drawRoundedRect(ctx, xCursor, cy - SWATCH / 2, SWATCH, SWATCH, 4);
    ctx.fillStyle = items[i].bg;
    ctx.fill();
    if (items[i].border) {
      ctx.strokeStyle = items[i].border!;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.fillStyle = clubColor === '#1B4332' ? CELL_BOGEY_TXT : '#6B7280';
    ctx.textAlign = 'left';
    ctx.fillText(items[i].label, xCursor + SWATCH + GAP_SWATCH_LABEL, cy);
    xCursor += itemWidths[i] + GAP_ITEMS;
  }
}

function drawLogoOverlay(
  ctx: CanvasRenderingContext2D,
  logoImg: HTMLImageElement,
  cx: number, cy: number, circleR: number,
) {
  // Cercle blanc avec ombre douce
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 4;
  ctx.beginPath();
  ctx.arc(cx, cy, circleR, 0, Math.PI * 2);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.restore();

  // Logo fit "contain" centré (pas cover, sinon coupe les bords)
  const innerR = circleR - 14;
  const innerD = innerR * 2;
  const aspect = logoImg.width / logoImg.height;
  let lw: number, lh: number;
  if (aspect >= 1) { lw = innerD; lh = innerD / aspect; }
  else { lh = innerD; lw = innerD * aspect; }
  ctx.drawImage(logoImg, cx - lw / 2, cy - lh / 2, lw, lh);
}

// Helper: draw a single leaderboard row inside a given rect (x, y, w, h).
// rank == 0 means "no rank" (NC). Extracted from drawLeaderboard so it can
// be reused for both 1-column and 2-column layouts.
function drawLeaderboardRow(
  ctx: CanvasRenderingContext2D,
  row: LeaderboardEntry,
  rank: number,
  x: number,
  y: number,
  w: number,
  h: number,
  primaryColor: string,
  compact: boolean,
) {
  const displayRank = row.finished ? String(rank) : '—';

  // Row background highlight + accent stripe for the current player.
  if (row.is_me) {
    ctx.fillStyle = 'rgba(212, 165, 116, 0.18)';
    drawRoundedRect(ctx, x, y, w, h, 10);
    ctx.fill();
    ctx.fillStyle = '#D4A574';
    ctx.fillRect(x, y, 4, h);
  }

  const rankSize = compact ? 22 : 28;
  const nameSize = compact ? 22 : 26;
  const strokesSize = compact ? 26 : 30;
  const diffSize = compact ? 19 : 22;
  const ncSize = compact ? 16 : 18;
  const rankPadX = compact ? 14 : 22;
  const namePadX = compact ? 52 : 70;
  const scorePadR = compact ? 12 : 16;
  const scoreReserve = compact ? 140 : 220;

  // Rank (left)
  ctx.fillStyle = row.finished ? primaryColor : '#A8A294';
  ctx.font = `800 ${rankSize}px ${FONT_STACK}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(displayRank, x + rankPadX, y + h / 2);

  // Name with ellipsis when it overflows the available width.
  ctx.fillStyle = row.finished ? '#1B4332' : '#6B7280';
  ctx.font = `600 ${nameSize}px ${FONT_STACK}`;
  const nameX = x + namePadX;
  const nameMax = w - namePadX - scoreReserve;
  let name = row.display_name;
  if (ctx.measureText(name).width > nameMax) {
    while (name.length > 1 && ctx.measureText(name + '…').width > nameMax) {
      name = name.slice(0, -1);
    }
    name += '…';
  }
  ctx.fillText(name, nameX, y + h / 2);

  // Score on the right. Finished → strokes + diff. Unfinished → "NC".
  ctx.textAlign = 'right';
  const scoreX = x + w - scorePadR;
  if (row.finished) {
    const diffStr = row.diff === 0
      ? '±0'
      : row.diff > 0 ? `+${row.diff}` : `${row.diff}`;
    ctx.fillStyle = '#6B7280';
    ctx.font = `500 ${diffSize}px ${FONT_STACK}`;
    ctx.fillText(`(${diffStr})`, scoreX, y + h / 2);
    const diffW = ctx.measureText(`(${diffStr})`).width;
    ctx.fillStyle = primaryColor;
    ctx.font = `800 ${strokesSize}px ${FONT_STACK}`;
    ctx.fillText(String(row.strokes), scoreX - diffW - 8, y + h / 2);
  } else {
    ctx.fillStyle = '#A8A294';
    ctx.font = `700 ${ncSize}px ${FONT_STACK}`;
    drawTrackedText(ctx, 'NC', scoreX - 14, y + h / 2, 2);
  }
}

// Multiplayer mini-leaderboard. 1 column for ≤3 players, 2 columns for 4+
// to keep the share-card compact. Returns the total height drawn.
function drawLeaderboard(
  ctx: CanvasRenderingContext2D,
  entries: LeaderboardEntry[],
  startY: number,
  W: number,
  primaryColor: string,
): number {
  const PAD_X = 72;
  const ROW_GAP = 6;
  const COL_GAP = 12;
  const TITLE_H = 50;
  const twoCols = entries.length >= 4;
  const ROW_H = twoCols ? 48 : 56;

  // Title "CLASSEMENT" — accent uppercase tracked, same vibe as the score eyebrow.
  ctx.fillStyle = '#D4A574';
  ctx.font = `700 22px ${FONT_STACK}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  drawTrackedText(ctx, 'CLASSEMENT', W / 2, startY, 3);

  const innerW = W - 2 * PAD_X;
  const rowsPerCol = twoCols ? Math.ceil(entries.length / 2) : entries.length;
  const cellW = twoCols ? (innerW - COL_GAP) / 2 : innerW;

  // Assign visible rank to finished players first, then iterate in order.
  let rank = 0;
  const ranks = entries.map((row) => (row.finished ? ++rank : 0));

  // Row-major fill: rank 1 top-left, rank 2 top-right, rank 3 mid-left…
  // Matches the recap HTML and keeps the podium feeling at the top.
  for (let i = 0; i < entries.length; i++) {
    const colIdx = twoCols ? i % 2 : 0;
    const rowIdx = twoCols ? Math.floor(i / 2) : i;
    const x = PAD_X + colIdx * (cellW + COL_GAP);
    const y = startY + TITLE_H + rowIdx * (ROW_H + ROW_GAP);
    drawLeaderboardRow(ctx, entries[i], ranks[i], x, y, cellW, ROW_H, primaryColor, twoCols);
  }

  return TITLE_H + rowsPerCol * (ROW_H + ROW_GAP);
}

export async function composeShareImage(input: ComposeInput): Promise<Blob> {
  const W = 1080;
  const PAD_X = 48;
  const PHOTO_H = 675; // 50%

  // The canvas grows vertically when a leaderboard is included so the new
  // section fits between the F9/B9 grid and the legend. Width stays 1080 to
  // keep WhatsApp / Instagram Story compatibility. 4+ players → 2 columns,
  // halving the row count and the added height.
  const lbEntries = input.leaderboard ?? [];
  const lbTwoCols = lbEntries.length >= 4;
  const lbRowsPerCol = lbTwoCols ? Math.ceil(lbEntries.length / 2) : lbEntries.length;
  const LB_TITLE_H = 50;
  const LB_ROW_H = lbTwoCols ? 48 : 56;
  const LB_ROW_GAP = 6;
  const LB_BOTTOM_PAD = 24;
  const leaderboardHeight = lbEntries.length > 0
    ? LB_TITLE_H + lbRowsPerCol * (LB_ROW_H + LB_ROW_GAP) + LB_BOTTOM_PAD
    : 0;
  const H = 1350 + leaderboardHeight;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');

  const club = input.club;
  const primaryColor = club.primary_color ?? '#1B4332';

  // Background global
  ctx.fillStyle = '#FAF7EE';
  ctx.fillRect(0, 0, W, H);

  // Charger photo et logo en parallèle (les deux peuvent fail indépendamment)
  let photoImg: HTMLImageElement | null = null;
  let logoImg: HTMLImageElement | null = null;
  await Promise.all([
    input.photoUrl
      ? loadImage(input.photoUrl).then((img) => { photoImg = img; }, (err) => {
          console.error('[share-card] photo load failed, fallback gradient', err);
        })
      : Promise.resolve(),
    club.logo_url
      ? loadImage(club.logo_url).then((img) => { logoImg = img; }, (err) => {
          console.error('[share-card] logo load failed, skip overlay', err);
        })
      : Promise.resolve(),
  ]);

  // Section 1 : Photo (0..675) ou gradient
  if (photoImg) {
    drawCoverImage(ctx, photoImg, 0, 0, W, PHOTO_H);
  } else {
    const grad = ctx.createLinearGradient(0, 0, W, PHOTO_H);
    grad.addColorStop(0, primaryColor);
    grad.addColorStop(1, '#87B894');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, PHOTO_H);
  }

  // Logo overlay coin haut-droit
  if (logoImg) {
    const CIRCLE_R = 70; // diamètre 140
    const CIRCLE_CX = W - 32 - CIRCLE_R;
    const CIRCLE_CY = 32 + CIRCLE_R;
    drawLogoOverlay(ctx, logoImg, CIRCLE_CX, CIRCLE_CY, CIRCLE_R);
  }

  // Section 2 : Bandeau brand (675..795, 120px)
  const BAND_Y = PHOTO_H;
  ctx.fillStyle = '#1B4332';
  ctx.font = `800 38px ${FONT_STACK}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(club.name.toUpperCase(), W / 2, BAND_Y + 48, W - 2 * PAD_X);

  ctx.fillStyle = '#666';
  ctx.font = `400 22px ${FONT_STACK}`;
  const subText = `${input.player?.display_name ?? '—'} · ${fmtDateShort(input.startedAt)} · ${input.holesPlayed} trous`;
  ctx.fillText(subText, W / 2, BAND_Y + 92, W - 2 * PAD_X);

  // Section 3 : Score block — eyebrow + gros total + sub (style recap.astro)
  const SCORE_Y = BAND_Y + 160; // ~835 (espace meta → eyebrow)

  // Eyebrow "SCORE · 18 TROUS" en coral upper letterspaced
  ctx.fillStyle = '#D4A574'; // --accent
  ctx.font = `700 22px ${FONT_STACK}`;
  ctx.textBaseline = 'middle';
  const eyebrow = input.formatLabel
    ? `SCORE · ${input.formatLabel.toUpperCase()}`
    : `SCORE · ${input.holes.length} TROUS`;
  drawTrackedText(ctx, eyebrow, W / 2, SCORE_Y, 3);

  // Gros total en clubColor — taille adaptée selon nombre de chiffres
  const totalStr = String(input.totalStrokes);
  const totalFontSize = totalStr.length >= 3 ? 110 : 130;
  ctx.fillStyle = primaryColor;
  ctx.font = `800 ${totalFontSize}px ${FONT_STACK}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(totalStr, W / 2, SCORE_Y + 90);

  // Subtitle "±0 · Par 72" — quand la carte est incomplète on affiche le
  // par des trous JOUÉS (input.playedPar) plutôt que le par total, sinon
  // l'écart est trompeur (-1 contre Par 71 alors qu'on a fait 8/18).
  const fullPar = input.totalPar ?? input.holes.reduce((s, h) => s + h.par, 0);
  const isComplete = input.holesPlayed >= input.holes.length;
  const parDisplayed = isComplete ? fullPar : (input.playedPar ?? fullPar);
  const diffStr = input.totalDiff === 0
    ? '±0'
    : input.totalDiff > 0
      ? `+${input.totalDiff}`
      : `${input.totalDiff}`;
  ctx.fillStyle = '#6B7280';
  ctx.font = `500 28px ${FONT_STACK}`;
  const subSubText = isComplete
    ? `${diffStr} · Par ${parDisplayed}`
    : `${diffStr} · Par ${parDisplayed} · ${input.holesPlayed}/${input.holes.length} trous`;
  ctx.fillText(subSubText, W / 2, SCORE_Y + 170);

  // Section 4 : Scorecard rows. If the caller provided named sections (loops),
  // draw one row per section with its loop name. Otherwise fall back to the
  // legacy F9/B9 split for backward compat with older payloads.
  const sections: ComposeSection[] = input.sections && input.sections.length > 0
    ? input.sections
    : (() => {
        const front9 = input.holes.filter((h) => h.number <= 9);
        const back9 = input.holes.filter((h) => h.number > 9);
        const out: ComposeSection[] = [];
        if (front9.length) out.push({ label: 'F9', holes: front9 });
        if (back9.length) out.push({ label: 'B9', holes: back9 });
        return out;
      })();

  const pickedUpSet = new Set<number>(input.pickedUpHoles ?? []);
  const ROW_GAP = 14;
  let gridY = SCORE_Y + 220; // ~1005
  for (const section of sections) {
    const h = drawScoreRow(ctx, section.holes, input.scoresByHole, pickedUpSet, section.label, gridY, primaryColor);
    gridY += h + ROW_GAP;
  }

  // Section 4b : Mini-leaderboard (multiplayer only). The grid sat on the
  // 1350 layout, so we resume from gridY and let drawLeaderboard advance it.
  let postGridY = gridY + 24;
  if (lbEntries.length > 0) {
    postGridY += drawLeaderboard(ctx, lbEntries, postGridY, W, primaryColor);
    postGridY += LB_BOTTOM_PAD;
  }

  // Section 5 : Legend (Birdie · Par · Bogey)
  drawLegend(ctx, postGridY, W, primaryColor, pickedUpSet.size > 0);

  // Section 6 : Footer SCLUBA — discret
  ctx.fillStyle = '#A8A294';
  ctx.font = `500 16px ${FONT_STACK}`;
  ctx.textBaseline = 'alphabetic';
  drawTrackedText(ctx, 'POWERED BY SCLUBA', W / 2, H - 36, 4);

  // Export PNG
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('canvas.toBlob returned null'))),
      'image/png',
    );
  });
  console.log('[share-card] PNG generated, size:', blob.size, 'bytes');
  return blob;
}

export interface ShareOptions {
  title: string;
  text?: string;
  filename?: string;
  fallbackUrl?: string;
}

export async function sharePngFile(blob: Blob, opts: ShareOptions): Promise<'shared' | 'downloaded' | 'url-shared'> {
  const file = new File([blob], opts.filename ?? 'scluba-carte.png', { type: 'image/png' });

  // 1. Web Share API niveau 2 (avec fichier)
  if (typeof navigator !== 'undefined' && 'canShare' in navigator && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: opts.title, text: opts.text });
      return 'shared';
    } catch (err) {
      if ((err as DOMException).name === 'AbortError') throw err;
      // Sinon on tombe sur les autres fallbacks
    }
  }

  // 2. Fallback URL (Web Share niveau 1)
  if (opts.fallbackUrl && typeof navigator !== 'undefined' && 'share' in navigator) {
    try {
      await navigator.share({ url: opts.fallbackUrl, title: opts.title });
      return 'url-shared';
    } catch (err) {
      if ((err as DOMException).name === 'AbortError') throw err;
    }
  }

  // 3. Download manuel
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = opts.filename ?? 'scluba-carte.png';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return 'downloaded';
}
