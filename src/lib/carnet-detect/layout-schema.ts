import { z } from 'zod';

export interface CarnetCell {
  row: number;
  col: number;
  hole: number | null;
}

export interface CarnetLayout {
  rows: number;
  cols: number;
  cells: CarnetCell[];
}

// Sentinelle "détection échouée / rien d'exploitable sur cette page". Le client
// la traite comme une page à placer à la main (pas d'erreur bloquante).
export const EMPTY_LAYOUT: CarnetLayout = { rows: 0, cols: 0, cells: [] };

const CellSchema = z.object({
  row: z.number().int().min(0).max(5),
  col: z.number().int().min(0).max(5),
  // Claude omet parfois un champ nullable → on traite undefined comme null.
  hole: z.preprocess((v) => v ?? null, z.number().int().min(1).max(36).nullable()),
});

const LayoutSchema = z.object({
  rows: z.number().int().min(1).max(6),
  cols: z.number().int().min(1).max(6),
  cells: z.array(CellSchema).max(36),
});

// Valide la sortie de l'outil `report_layout`. Sur toute violation, renvoie la
// sentinelle vide plutôt que de jeter — une page mal lue ne doit pas faire
// échouer tout l'import ; l'admin place cette page à la main.
export function parseLayoutToolInput(raw: unknown): CarnetLayout {
  const parsed = LayoutSchema.safeParse(raw);
  return parsed.success ? parsed.data : EMPTY_LAYOUT;
}
