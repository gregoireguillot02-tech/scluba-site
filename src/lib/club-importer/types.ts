import type { CourseData } from '../clubs-types';

export interface ScrapedAssets {
  logoCandidates: string[];
  photoCandidates: string[];
  ogImage: string | null;
  faviconUrl: string | null;
  textContent: string;
  baseUrl: string;
}

export interface DownloadedImage {
  bytes: Uint8Array;
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  sourceUrl: string;
}

export type ExtractionConfidence = 'high' | 'medium' | 'low';

export interface ExtractedClubData {
  name: string;
  city: string | null;
  primary_color: string | null;
  is_pitch_putt: boolean;
  loops: Array<{
    name: string;
    holes: Array<{ number: number; par: number | null }>;
  }>;
  confidence: {
    name: ExtractionConfidence;
    loops: ExtractionConfidence;
    pars: ExtractionConfidence;
    primary_color: ExtractionConfidence;
  };
  notes: string | null;
}

export interface ImportResult {
  source_url: string;
  name: string;
  city: string | null;
  primary_color: string;
  logo_url: string | null;
  photo_url: string | null;
  course_data: CourseData;
  warnings: string[];
  llm_notes: string | null;
}
