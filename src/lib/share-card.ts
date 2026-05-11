import { createBrowserClient } from '@supabase/ssr';
import { toBlob } from 'html-to-image';
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

function buildTemplate(input: ComposeInput): HTMLElement {
  const root = document.createElement('div');
  root.style.cssText = `
    position: fixed; left: -99999px; top: 0;
    width: 1080px; height: 1350px;
    background: #FAF7EE;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    display: flex; flex-direction: column;
  `;

  // Photo (60%)
  const photo = document.createElement('div');
  photo.style.cssText = `
    width: 100%; height: 810px;
    background-size: cover; background-position: center;
    ${input.photoUrl
      ? `background-image: url("${input.photoUrl}");`
      : `background: linear-gradient(135deg, ${input.club.primary_color ?? '#1B4332'}, #87B894);`}
  `;
  root.appendChild(photo);

  // Header (nom + score)
  const header = document.createElement('div');
  header.style.cssText = 'padding: 32px 48px 16px; display: flex; justify-content: space-between; align-items: baseline;';
  header.innerHTML = `
    <div style="font-size: 56px; font-weight: 800; color: #1B4332;">${escapeHtml(input.player?.display_name ?? '—')}</div>
    <div style="font-size: 64px; font-weight: 800; color: ${input.club.primary_color ?? '#1B4332'};">${formatDiff(input.totalDiff)}</div>
  `;
  root.appendChild(header);

  // Meta (club + date)
  const meta = document.createElement('div');
  meta.style.cssText = 'padding: 0 48px 20px; font-size: 24px; color: #555;';
  meta.textContent = `${input.club.name} · ${fmtDateShort(input.startedAt)} · ${input.holesPlayed} trous`;
  root.appendChild(meta);

  // Grille (front 9 / back 9)
  const grid = document.createElement('div');
  grid.style.cssText = 'padding: 0 48px; display: flex; flex-direction: column; gap: 10px;';
  const front9 = input.holes.filter(h => h.number <= 9);
  const back9 = input.holes.filter(h => h.number > 9);
  for (const row of [front9, back9]) {
    if (row.length === 0) continue;
    const line = document.createElement('div');
    line.style.cssText = `display: grid; grid-template-columns: 80px repeat(${row.length}, 1fr); gap: 6px; align-items: center;`;
    const label = document.createElement('div');
    label.style.cssText = 'font-size: 18px; color: #999; text-transform: uppercase; letter-spacing: 1px;';
    label.textContent = row === front9 ? 'Aller' : 'Retour';
    line.appendChild(label);
    for (const h of row) {
      const s = input.scoresByHole[h.number];
      const cell = document.createElement('div');
      const type = s !== undefined ? scoreType(s, h.par) : null;
      const bg = type ? (CELL_COLOR[type] ?? '#EEE') : '#F3F3F3';
      cell.style.cssText = `background: ${bg}; aspect-ratio: 1; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 22px; color: #1B4332;`;
      cell.textContent = s !== undefined ? String(s) : '—';
      line.appendChild(cell);
    }
    grid.appendChild(line);
  }
  root.appendChild(grid);

  // Footer brand
  const footer = document.createElement('div');
  footer.style.cssText = 'margin-top: auto; padding: 24px 48px; text-align: center; letter-spacing: 8px; font-size: 22px; font-weight: 700; color: #1B4332;';
  footer.textContent = 'SCLUBA';
  root.appendChild(footer);

  return root;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c] as string));
}

export async function composeShareImage(input: ComposeInput): Promise<Blob> {
  const node = buildTemplate(input);
  document.body.appendChild(node);
  try {
    // Si photo distante, attendre qu'elle se charge pour éviter image cassée dans le PNG
    if (input.photoUrl) {
      await new Promise<void>((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve();
        img.onerror = () => resolve(); // on continue même si fail → fond par défaut
        img.src = input.photoUrl!;
      });
    }

    const blob = await toBlob(node, {
      width: 1080,
      height: 1350,
      pixelRatio: 1,
      cacheBust: true,
    });
    if (!blob) throw new Error('html-to-image returned null');
    return blob;
  } finally {
    node.remove();
  }
}
