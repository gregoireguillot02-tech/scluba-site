import QRCode from 'qrcode';

export const SCLUBA_GREEN = '#1B4332';

export interface QrOptions {
  dark?: string;
  light?: string;
  margin?: number;
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
}

export async function qrSvg(url: string, options: QrOptions = {}): Promise<string> {
  return QRCode.toString(url, {
    type: 'svg',
    errorCorrectionLevel: options.errorCorrectionLevel ?? 'M',
    margin: options.margin ?? 0,
    color: {
      dark: options.dark ?? SCLUBA_GREEN,
      light: options.light ?? '#FFFFFF',
    },
  });
}

export async function qrPngDataUrl(url: string, options: QrOptions = {}): Promise<string> {
  return QRCode.toDataURL(url, {
    errorCorrectionLevel: options.errorCorrectionLevel ?? 'H',
    margin: options.margin ?? 2,
    width: 1024,
    color: {
      dark: options.dark ?? SCLUBA_GREEN,
      light: options.light ?? '#FFFFFF',
    },
  });
}

export function clubPageUrl(slug: string, origin: string): string {
  return `${origin.replace(/\/$/, '')}/c/${slug}`;
}
