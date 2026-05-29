// Carnet de parcours — conversion d'un fichier déposé (PDF ou image) en une
// liste de "candidats" : une image par page (PDF) ou par fichier (images).
// Les candidats sont ensuite assignés aux trous dans la grille de vérification
// de /ops/clubs/[id]/carnet, puis uploadés un par un.
//
// Le rendu PDF utilise pdf.js (pdfjs-dist). Le worker est importé via `?url`
// pour être émis comme asset same-origin par Vite → compatible CSP `script-src
// 'self'` (pas de worker blob ni de CDN externe).

export interface CarnetCandidate {
  // Image finale à uploader (JPEG). Wrappée en File pour porter un type MIME
  // que l'endpoint d'upload sniffe et valide.
  file: File;
  // Data URL réduite pour la preview <img> dans la grille (pas la pleine def).
  previewUrl: string;
  // Libellé affiché dans les <select> ("Page 1", "trou-7.jpg"…).
  label: string;
}

let workerConfigured = false;

async function getPdfjs() {
  const pdfjs = await import('pdfjs-dist');
  if (!workerConfigured) {
    // @ts-ignore - le suffixe ?url est résolu par Vite en URL d'asset same-origin.
    const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    workerConfigured = true;
  }
  return pdfjs;
}

// Exporté pour être réutilisé par carnet-crop.ts (auto-crop + découpe grille),
// qui produit les mêmes JPEG 0.85 que l'endpoint d'upload sniffe et accepte.
export async function canvasToFile(canvas: HTMLCanvasElement, name: string): Promise<File> {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('canvas.toBlob returned null'))),
      'image/jpeg',
      0.85,
    );
  });
  return new File([blob], name, { type: 'image/jpeg' });
}

export async function pdfToCandidates(file: File, scale = 2): Promise<CarnetCandidate[]> {
  const pdfjs = await getPdfjs();
  const data = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data }).promise;
  const out: CarnetCandidate[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d context unavailable');
    await page.render({ canvasContext: ctx, viewport }).promise;
    out.push({
      file: await canvasToFile(canvas, `page-${p}.jpg`),
      previewUrl: canvas.toDataURL('image/jpeg', 0.5),
      label: `Page ${p}`,
    });
  }
  return out;
}

function imageToCandidate(file: File): Promise<CarnetCandidate> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve({ file, previewUrl: fr.result as string, label: file.name });
    fr.onerror = () => reject(new Error('image read failed'));
    fr.readAsDataURL(file);
  });
}

// Transforme une sélection de fichiers (PDF et/ou images) en candidats, dans
// l'ordre de dépôt. Les types non supportés sont ignorés silencieusement.
export async function filesToCandidates(files: File[]): Promise<CarnetCandidate[]> {
  const out: CarnetCandidate[] = [];
  for (const f of files) {
    if (f.type === 'application/pdf') {
      out.push(...(await pdfToCandidates(f)));
    } else if (f.type.startsWith('image/')) {
      out.push(await imageToCandidate(f));
    }
  }
  return out;
}
