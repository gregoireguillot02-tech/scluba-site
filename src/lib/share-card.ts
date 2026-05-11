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

function drawScoreTable(
  ctx: CanvasRenderingContext2D,
  holes: CourseHole[],
  scoresByHole: Record<number, number>,
  startY: number,
) {
  const PAD_X = 48;
  const W = 1080;
  const N = 9;
  const GAP = 6;
  const CELL_W = (W - 2 * PAD_X - (N - 1) * GAP) / N; // 104
  const TROU_H = 35;
  const PAR_H = 45;
  const SCORE_H = 60;

  // Row 1 : Trou (numéros)
  for (let i = 0; i < holes.length; i++) {
    const x = PAD_X + i * (CELL_W + GAP);
    drawRoundedRect(ctx, x, startY, CELL_W, TROU_H, 4);
    ctx.fillStyle = '#EFEBE0';
    ctx.fill();
    ctx.fillStyle = '#888';
    ctx.font = `700 18px ${FONT_STACK}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(holes[i].number), x + CELL_W / 2, startY + TROU_H / 2);
  }

  // Row 2 : Par
  const parY = startY + TROU_H + 2;
  for (let i = 0; i < holes.length; i++) {
    const x = PAD_X + i * (CELL_W + GAP);
    drawRoundedRect(ctx, x, parY, CELL_W, PAR_H, 4);
    ctx.fillStyle = '#FAF1DC';
    ctx.fill();
    ctx.fillStyle = '#5C5340';
    ctx.font = `500 24px ${FONT_STACK}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(holes[i].par), x + CELL_W / 2, parY + PAR_H / 2);
  }

  // Row 3 : Score (couleur par scoreType, tiret grisé si non joué)
  const scoreY = parY + PAR_H + 2;
  for (let i = 0; i < holes.length; i++) {
    const x = PAD_X + i * (CELL_W + GAP);
    const s = scoresByHole[holes[i].number];
    const played = s !== undefined;
    const type = played ? scoreType(s, holes[i].par) : null;
    const bg = type ? (CELL_COLOR[type] ?? '#EEE') : '#ECEAE2';

    drawRoundedRect(ctx, x, scoreY, CELL_W, SCORE_H, 6);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.fillStyle = played ? '#1B4332' : '#A8A294';
    ctx.font = `800 32px ${FONT_STACK}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(played ? String(s) : '—', x + CELL_W / 2, scoreY + SCORE_H / 2 + 2);
  }

  return TROU_H + 2 + PAR_H + 2 + SCORE_H; // 144 total height (avec micro-gaps)
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

export async function composeShareImage(input: ComposeInput): Promise<Blob> {
  const W = 1080;
  const H = 1350;
  const PAD_X = 48;
  const PHOTO_H = 675; // 50%

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

  // Section 3 : Total des coups (795..895, 100px) — fond cream foncé
  const TOTAL_Y = BAND_Y + 120;
  const TOTAL_H = 100;
  ctx.fillStyle = '#F3EFE2';
  ctx.fillRect(0, TOTAL_Y, W, TOTAL_H);

  // "92 coups" + " (+5)" avec couleur diff
  const totalLabel = `${input.totalStrokes} coups`;
  const diffLabel = `  ${formatDiff(input.totalDiff)}`;
  ctx.font = `800 52px ${FONT_STACK}`;
  ctx.textBaseline = 'middle';
  const tW = ctx.measureText(totalLabel).width;
  const dW = ctx.measureText(diffLabel).width;
  const startX = (W - tW - dW) / 2;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#1B4332';
  ctx.fillText(totalLabel, startX, TOTAL_Y + TOTAL_H / 2);
  ctx.fillStyle = primaryColor;
  ctx.fillText(diffLabel, startX + tW, TOTAL_Y + TOTAL_H / 2);

  // Section 4 + 5 : Score tables (front 9 puis back 9)
  const front9 = input.holes.filter((h) => h.number <= 9);
  const back9 = input.holes.filter((h) => h.number > 9);
  let tableY = TOTAL_Y + TOTAL_H + 20; // 915
  if (front9.length) {
    const usedH = drawScoreTable(ctx, front9, input.scoresByHole, tableY);
    tableY += usedH + 20;
  }
  if (back9.length) {
    drawScoreTable(ctx, back9, input.scoresByHole, tableY);
  }

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
