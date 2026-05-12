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

export interface ComposeInput {
  photoUrl: string | null;
  player: RoundPlayer | null;
  club: Club;
  startedAt: string | null;
  holes: CourseHole[];
  scoresByHole: Record<number, number>;
  totalDiff: number;
  totalStrokes: number;
  holesPlayed: number;
  // Optional mini-leaderboard rendered between the F9/B9 grid and the legend.
  // Only set for multiplayer rounds; solo rounds omit it.
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
  label: string,
  startY: number,
  clubColor: string,
) {
  const PAD_X = 48;
  const W = 1080;
  const N_TOTAL = 10; // 1 label + 9 cells
  const GAP = 8;
  const CELL_W = (W - 2 * PAD_X - (N_TOTAL - 1) * GAP) / N_TOTAL; // ~92
  const CELL_H = 72;

  // Label F9/B9 — fond clubColor
  drawRoundedRect(ctx, PAD_X, startY, CELL_W, CELL_H, 8);
  ctx.fillStyle = clubColor;
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `800 24px ${FONT_STACK}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, PAD_X + CELL_W / 2, startY + CELL_H / 2);

  // 9 score cells
  for (let i = 0; i < holes.length; i++) {
    const x = PAD_X + (i + 1) * (CELL_W + GAP);
    const s = scoresByHole[holes[i].number];
    const played = s !== undefined;
    const type = played ? scoreType(s, holes[i].par) : null;

    let bg: string;
    let txtColor: string;
    let hasBorder = false;
    if (!played) {
      bg = CELL_EMPTY_BG;
      txtColor = CELL_EMPTY_TXT;
    } else if (type === 'birdie' || type === 'eagle') {
      bg = CELL_BIRDIE_BG;
      txtColor = CELL_BIRDIE_TXT;
    } else if (type === 'bogey' || type === 'double') {
      bg = CELL_BOGEY_BG;
      txtColor = CELL_BOGEY_TXT;
    } else {
      bg = CELL_PAR_BG;
      txtColor = clubColor;
      hasBorder = true;
    }

    drawRoundedRect(ctx, x, startY, CELL_W, CELL_H, 8);
    ctx.fillStyle = bg;
    ctx.fill();
    if (hasBorder) {
      ctx.strokeStyle = CELL_PAR_BORDER;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.fillStyle = txtColor;
    ctx.font = `800 32px ${FONT_STACK}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(played ? String(s) : '—', x + CELL_W / 2, startY + CELL_H / 2);
  }

  return CELL_H;
}

function drawLegend(
  ctx: CanvasRenderingContext2D,
  cy: number,
  W: number,
  clubColor: string,
) {
  const items: { label: string; bg: string; border: string | null }[] = [
    { label: 'Birdie', bg: CELL_BIRDIE_BG, border: null },
    { label: 'Par', bg: CELL_PAR_BG, border: CELL_PAR_BORDER },
    { label: 'Bogey', bg: CELL_BOGEY_BG, border: null },
  ];
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

// Multiplayer mini-leaderboard. Renders between the F9/B9 grid and the
// legend in composeShareImage. Returns the total height drawn so the caller
// can advance its y cursor.
function drawLeaderboard(
  ctx: CanvasRenderingContext2D,
  entries: LeaderboardEntry[],
  startY: number,
  W: number,
  primaryColor: string,
): number {
  const PAD_X = 72;
  const ROW_H = 56;
  const ROW_GAP = 6;
  const TITLE_H = 50;

  // Title "CLASSEMENT" — accent uppercase tracked, same vibe as the score eyebrow.
  ctx.fillStyle = '#D4A574';
  ctx.font = `700 22px ${FONT_STACK}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  drawTrackedText(ctx, 'CLASSEMENT', W / 2, startY, 3);

  let y = startY + TITLE_H;
  let rank = 0;
  for (const row of entries) {
    const displayRank = row.finished ? String(++rank) : '—';

    // Row background (highlight for current player)
    if (row.is_me) {
      ctx.fillStyle = 'rgba(212, 165, 116, 0.18)';
      drawRoundedRect(ctx, PAD_X, y, W - 2 * PAD_X, ROW_H, 10);
      ctx.fill();
      ctx.fillStyle = '#D4A574';
      ctx.fillRect(PAD_X, y, 4, ROW_H);
    }

    // Rank (left)
    ctx.fillStyle = row.finished ? primaryColor : '#A8A294';
    ctx.font = `800 28px ${FONT_STACK}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(displayRank, PAD_X + 22, y + ROW_H / 2);

    // Name (center-left), truncated if too long for the available space.
    ctx.fillStyle = row.finished ? '#1B4332' : '#6B7280';
    ctx.font = `600 26px ${FONT_STACK}`;
    const NAME_X = PAD_X + 70;
    const NAME_MAX = W - PAD_X * 2 - 70 - 220;
    let name = row.display_name;
    if (ctx.measureText(name).width > NAME_MAX) {
      while (name.length > 1 && ctx.measureText(name + '…').width > NAME_MAX) {
        name = name.slice(0, -1);
      }
      name += '…';
    }
    ctx.fillText(name, NAME_X, y + ROW_H / 2);

    // Score (right). Strokes in clubColor bold, diff in muted parentheses,
    // or "NC" pill for unfinished players.
    ctx.textAlign = 'right';
    const SCORE_X = W - PAD_X - 16;
    if (row.finished) {
      const diffStr = row.diff === 0
        ? '±0'
        : row.diff > 0 ? `+${row.diff}` : `${row.diff}`;
      ctx.fillStyle = '#6B7280';
      ctx.font = `500 22px ${FONT_STACK}`;
      ctx.fillText(`(${diffStr})`, SCORE_X, y + ROW_H / 2);
      const diffW = ctx.measureText(`(${diffStr})`).width;
      ctx.fillStyle = primaryColor;
      ctx.font = `800 30px ${FONT_STACK}`;
      ctx.fillText(String(row.strokes), SCORE_X - diffW - 10, y + ROW_H / 2);
    } else {
      ctx.fillStyle = '#A8A294';
      ctx.font = `700 18px ${FONT_STACK}`;
      drawTrackedText(ctx, 'NC', SCORE_X - 14, y + ROW_H / 2, 2);
    }

    y += ROW_H + ROW_GAP;
  }

  return y - startY;
}

export async function composeShareImage(input: ComposeInput): Promise<Blob> {
  const W = 1080;
  const PAD_X = 48;
  const PHOTO_H = 675; // 50%

  // The canvas grows vertically when a leaderboard is included so the new
  // section fits between the F9/B9 grid and the legend. Width stays 1080 to
  // keep WhatsApp / Instagram Story compatibility.
  const lbEntries = input.leaderboard ?? [];
  const LB_TITLE_H = 50;
  const LB_ROW_H = 56;
  const LB_ROW_GAP = 6;
  const LB_BOTTOM_PAD = 24;
  const leaderboardHeight = lbEntries.length > 0
    ? LB_TITLE_H + lbEntries.length * (LB_ROW_H + LB_ROW_GAP) + LB_BOTTOM_PAD
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
  drawTrackedText(ctx, `SCORE · ${input.holes.length} TROUS`, W / 2, SCORE_Y, 3);

  // Gros total en clubColor — taille adaptée selon nombre de chiffres
  const totalStr = String(input.totalStrokes);
  const totalFontSize = totalStr.length >= 3 ? 110 : 130;
  ctx.fillStyle = primaryColor;
  ctx.font = `800 ${totalFontSize}px ${FONT_STACK}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(totalStr, W / 2, SCORE_Y + 90);

  // Subtitle "±0 · Par 72"
  const totalPar2 = input.holes.reduce((s, h) => s + h.par, 0);
  const diffStr = input.totalDiff === 0
    ? '±0'
    : input.totalDiff > 0
      ? `+${input.totalDiff}`
      : `${input.totalDiff}`;
  ctx.fillStyle = '#6B7280';
  ctx.font = `500 28px ${FONT_STACK}`;
  ctx.fillText(`${diffStr} · Par ${totalPar2}`, W / 2, SCORE_Y + 170);

  // Section 4 : Grid F9 + B9 (chaque row = label clubColor + 9 cells)
  const front9 = input.holes.filter((h) => h.number <= 9);
  const back9 = input.holes.filter((h) => h.number > 9);
  const ROW_GAP = 14;
  let gridY = SCORE_Y + 220; // ~1005
  if (front9.length) {
    const h = drawScoreRow(ctx, front9, input.scoresByHole, 'F9', gridY, primaryColor);
    gridY += h + ROW_GAP;
  }
  if (back9.length) {
    drawScoreRow(ctx, back9, input.scoresByHole, 'B9', gridY, primaryColor);
    gridY += 72 + ROW_GAP;
  }

  // Section 4b : Mini-leaderboard (multiplayer only). The grid sat on the
  // 1350 layout, so we resume from gridY and let drawLeaderboard advance it.
  let postGridY = gridY + 24;
  if (lbEntries.length > 0) {
    postGridY += drawLeaderboard(ctx, lbEntries, postGridY, W, primaryColor);
    postGridY += LB_BOTTOM_PAD;
  }

  // Section 5 : Legend (Birdie · Par · Bogey)
  drawLegend(ctx, postGridY, W, primaryColor);

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
