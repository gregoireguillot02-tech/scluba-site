export interface IconLayout {
  /** Largeur de dessin du logo (px). */
  drawW: number;
  /** Hauteur de dessin du logo (px). */
  drawH: number;
  /** Décalage horizontal (px) pour centrer. */
  dx: number;
  /** Décalage vertical (px) pour centrer. */
  dy: number;
}

/**
 * Place un logo `imgW × imgH` centré dans un canvas carré `size × size`,
 * en réservant `paddingRatio` de marge de chaque côté, ratio préservé (contain).
 */
export function computeIconLayout(
  imgW: number,
  imgH: number,
  size: number,
  paddingRatio: number,
): IconLayout {
  const safe = size * (1 - 2 * paddingRatio);
  const scale = Math.min(safe / imgW, safe / imgH);
  const drawW = imgW * scale;
  const drawH = imgH * scale;
  const dx = (size - drawW) / 2;
  const dy = (size - drawH) / 2;
  return { drawW, drawH, dx, dy };
}
