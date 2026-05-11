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

export async function composeShareImage(input: ComposeInput): Promise<Blob> {
  const W = 1080;
  const H = 1350;
  const PHOTO_H = 810;
  const PAD_X = 48;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');

  const club = input.club;
  const primaryColor = club.primary_color ?? '#1B4332';
  const FONT_STACK = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

  // Background
  ctx.fillStyle = '#FAF7EE';
  ctx.fillRect(0, 0, W, H);

  // Photo (60%) ou gradient
  let photoOk = false;
  if (input.photoUrl) {
    try {
      const photoImg = await loadImage(input.photoUrl);
      drawCoverImage(ctx, photoImg, 0, 0, W, PHOTO_H);
      photoOk = true;
    } catch (err) {
      console.error('[share-card] photo load failed, fallback gradient', err);
    }
  }
  if (!photoOk) {
    const grad = ctx.createLinearGradient(0, 0, W, PHOTO_H);
    grad.addColorStop(0, primaryColor);
    grad.addColorStop(1, '#87B894');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, PHOTO_H);
  }

  // Header : nom (gauche) + score (droite)
  const HEADER_Y = PHOTO_H + 32;
  ctx.fillStyle = '#1B4332';
  ctx.font = `800 56px ${FONT_STACK}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(input.player?.display_name ?? '—', PAD_X, HEADER_Y, W - 360);

  ctx.fillStyle = primaryColor;
  ctx.font = `800 64px ${FONT_STACK}`;
  ctx.textAlign = 'right';
  ctx.fillText(formatDiff(input.totalDiff), W - PAD_X, HEADER_Y - 6);

  // Meta : club · date · trous
  ctx.fillStyle = '#555';
  ctx.font = `400 24px ${FONT_STACK}`;
  ctx.textAlign = 'left';
  ctx.fillText(
    `${club.name} · ${fmtDateShort(input.startedAt)} · ${input.holesPlayed} trous`,
    PAD_X, HEADER_Y + 80, W - 2 * PAD_X,
  );

  // Grille : aller / retour
  const front9 = input.holes.filter((h) => h.number <= 9);
  const back9 = input.holes.filter((h) => h.number > 9);
  const rows: { holes: CourseHole[]; label: string }[] = [];
  if (front9.length) rows.push({ holes: front9, label: 'ALLER' });
  if (back9.length) rows.push({ holes: back9, label: 'RETOUR' });

  const CELL_SIZE = 90;
  const CELL_GAP = 6;
  const LABEL_W = 100;
  const GRID_Y = HEADER_Y + 130;

  rows.forEach((row, idx) => {
    const y = GRID_Y + idx * (CELL_SIZE + 12);

    // Label (Aller / Retour)
    ctx.fillStyle = '#999';
    ctx.font = `700 20px ${FONT_STACK}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(row.label, PAD_X, y + CELL_SIZE / 2);

    // Cells
    row.holes.forEach((h, i) => {
      const s = input.scoresByHole[h.number];
      const x = PAD_X + LABEL_W + i * (CELL_SIZE + CELL_GAP);
      const type = s !== undefined ? scoreType(s, h.par) : null;
      const bg = type ? (CELL_COLOR[type] ?? '#EEE') : '#F3F3F3';

      drawRoundedRect(ctx, x, y, CELL_SIZE, CELL_SIZE, 8);
      ctx.fillStyle = bg;
      ctx.fill();

      ctx.fillStyle = '#1B4332';
      ctx.font = `700 30px ${FONT_STACK}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(s !== undefined ? String(s) : '—', x + CELL_SIZE / 2, y + CELL_SIZE / 2 + 2);
    });
  });

  // Footer SCLUBA
  ctx.fillStyle = '#1B4332';
  ctx.font = `800 26px ${FONT_STACK}`;
  ctx.textBaseline = 'alphabetic';
  drawTrackedText(ctx, 'SCLUBA', W / 2, H - 36, 8);

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
