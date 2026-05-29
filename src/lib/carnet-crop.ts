// Carnet de parcours — traitement géométrique des images, côté client.
// Canvas pur, déterministe, AUCUNE IA. Tout tourne dans ce module same-origin
// (émis par Vite) → conforme CSP `script-src 'self'` : pas de worker externe,
// pas de CDN. Utilisé par /ops/clubs/[id]/carnet pour deux usages :
//   - autoCropToFile   : rogne les marges quasi-uniformes d'une image de trou.
//   - sliceGridToFiles : découpe une grande image (trous en grille régulière)
//                        en une image par cellule, chacune auto-croppée.
// Sortie = JPEG 0.85 (via canvasToFile de carnet-split), que l'endpoint
// /api/ops/clubs/[id]/upload?kind=hole sniffe et accepte (≤ 5 Mo).

import { canvasToFile } from './carnet-split';

// Largeur max de sortie : borne la taille des JPEG (net sur mobile, < 5 Mo).
const MAX_OUTPUT_W = 1400;
// Tolérance "pixel = fond" : somme des écarts |ΔR|+|ΔG|+|ΔB| par rapport au fond.
const BG_TOLERANCE = 42;
// Une ligne/colonne est une "marge" si ≥ ce ratio de ses pixels sont du fond.
const MARGIN_FILL = 0.985;
// Padding réintroduit autour du contenu détecté (fraction de la dimension).
const PAD_FRAC = 0.02;

export type GridOrder = 'row' | 'col';

function loadBitmap(file: File): Promise<ImageBitmap> {
  // imageOrientation: 'from-image' applique l'EXIF (photos iPhone) comme dans
  // share-card.ts. createImageBitmap échoue sur certains HEIC selon le
  // navigateur → message clair plutôt qu'une exception opaque.
  return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => {
    throw new Error(`Image illisible (${file.type || 'format inconnu'}). Exporte en JPEG ou PNG.`);
  });
}

function canvas2d(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Contexte canvas 2D indisponible.');
  return { canvas, ctx };
}

// Bbox du contenu (hors marges quasi-uniformes). Fond présumé = moyenne des
// 4 coins. Renvoie des bornes inclusives en pixels.
function contentBBox(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const { data } = ctx.getImageData(0, 0, w, h);
  const rgb = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    return [data[i], data[i + 1], data[i + 2]] as const;
  };
  const corners = [rgb(0, 0), rgb(w - 1, 0), rgb(0, h - 1), rgb(w - 1, h - 1)];
  const bg = [0, 1, 2].map((k) => (corners[0][k] + corners[1][k] + corners[2][k] + corners[3][k]) / 4);
  const isBg = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    return (
      Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2]) <= BG_TOLERANCE
    );
  };
  const rowMargin = (y: number) => {
    let n = 0;
    for (let x = 0; x < w; x++) if (isBg(x, y)) n++;
    return n >= w * MARGIN_FILL;
  };
  const colMargin = (x: number) => {
    let n = 0;
    for (let y = 0; y < h; y++) if (isBg(x, y)) n++;
    return n >= h * MARGIN_FILL;
  };
  let top = 0;
  let bottom = h - 1;
  let left = 0;
  let right = w - 1;
  while (top < bottom && rowMargin(top)) top++;
  while (bottom > top && rowMargin(bottom)) bottom--;
  while (left < right && colMargin(left)) left++;
  while (right > left && colMargin(right)) right--;
  return { left, top, right, bottom };
}

// Dessine la région [sx,sy,sw,sh] de `bmp`, rogne ses marges, redimensionne
// (borné MAX_OUTPUT_W) et exporte en JPEG. Conserve le ratio du contenu rogné
// (la grille ops et la modale joueur affichent en object-fit/contain → rendu
// homogène sans barres de letterbox cuites dans le fichier).
async function regionToFile(
  bmp: ImageBitmap,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  name: string,
): Promise<File> {
  const { canvas: work, ctx } = canvas2d(sw, sh);
  ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, work.width, work.height);

  let { left, top, right, bottom } = contentBBox(ctx, work.width, work.height);
  let cw = right - left + 1;
  let ch = bottom - top + 1;

  // Garde-fou : bbox dégénérée (quasi vide, ou déjà ~plein cadre) → pas de crop.
  const coverage = (cw * ch) / (work.width * work.height);
  if (cw < work.width * 0.1 || ch < work.height * 0.1 || coverage > 0.985) {
    left = 0;
    top = 0;
    cw = work.width;
    ch = work.height;
  } else {
    const padX = Math.round(cw * PAD_FRAC);
    const padY = Math.round(ch * PAD_FRAC);
    left = Math.max(0, left - padX);
    top = Math.max(0, top - padY);
    cw = Math.min(work.width - left, cw + 2 * padX);
    ch = Math.min(work.height - top, ch + 2 * padY);
  }

  const scale = Math.min(1, MAX_OUTPUT_W / cw);
  const { canvas: out, ctx: octx } = canvas2d(cw * scale, ch * scale);
  octx.drawImage(work, left, top, cw, ch, 0, 0, out.width, out.height);
  return canvasToFile(out, name);
}

// Rogne les marges d'une image de trou et renvoie un JPEG prêt à uploader.
export async function autoCropToFile(file: File, name = 'trou.jpg'): Promise<File> {
  const bmp = await loadBitmap(file);
  try {
    return await regionToFile(bmp, 0, 0, bmp.width, bmp.height, name);
  } finally {
    bmp.close?.();
  }
}

// Découpe une grande image en cols×rows cellules (auto-croppées). `order`
// contrôle l'ordre de remplissage : 'row' = ligne par ligne (défaut), 'col' =
// colonne par colonne. Le tableau renvoyé est mappé sur les trous dans l'ordre.
export async function sliceGridToFiles(
  file: File,
  cols: number,
  rows: number,
  order: GridOrder = 'row',
): Promise<File[]> {
  const bmp = await loadBitmap(file);
  try {
    const cw = bmp.width / cols;
    const ch = bmp.height / rows;
    const out: File[] = [];
    const push = (c: number, r: number) =>
      regionToFile(bmp, c * cw, r * ch, cw, ch, `cell-${out.length + 1}.jpg`).then((f) => out.push(f));
    if (order === 'row') {
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) await push(c, r);
    } else {
      for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) await push(c, r);
    }
    return out;
  } finally {
    bmp.close?.();
  }
}

// Grille par défaut pour n trous : paire de facteurs (cols ≥ rows) dont le ratio
// est le plus proche d'un paysage ~1.5. 18 → 6×3, 9 → 3×3 ; n premier → n×1.
export function autoGridDims(n: number): { cols: number; rows: number } {
  if (n <= 0) return { cols: 1, rows: 1 };
  let best = { cols: n, rows: 1 };
  let bestScore = Infinity;
  for (let rows = 1; rows <= Math.floor(Math.sqrt(n)); rows++) {
    if (n % rows !== 0) continue;
    const cols = n / rows;
    const score = Math.abs(cols / rows - 1.5);
    if (score < bestScore) {
      bestScore = score;
      best = { cols, rows };
    }
  }
  return best;
}
