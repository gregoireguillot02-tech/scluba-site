// Météo via Open-Meteo (free, sans clé) — snapshot pris à la création
// d'une partie pour figer la météo affichée sur la carte partagée.
// https://open-meteo.com/en/docs

export interface WeatherSnapshot {
  temp_c: number;
  code: number;
  label: string;
  emoji: string;
}

// Mapping WMO weather_code → libellé FR + emoji. Approximation grossière
// (Open-Meteo a 30+ codes). Cf https://open-meteo.com/en/docs#weathervariables
const WEATHER_CODES: Record<number, { label: string; emoji: string }> = {
  0: { label: 'Ciel dégagé', emoji: '☀️' },
  1: { label: 'Peu nuageux', emoji: '🌤️' },
  2: { label: 'Partiellement nuageux', emoji: '⛅' },
  3: { label: 'Couvert', emoji: '☁️' },
  45: { label: 'Brouillard', emoji: '🌫️' },
  48: { label: 'Brouillard givrant', emoji: '🌫️' },
  51: { label: 'Bruine légère', emoji: '🌦️' },
  53: { label: 'Bruine', emoji: '🌦️' },
  55: { label: 'Bruine forte', emoji: '🌧️' },
  61: { label: 'Pluie légère', emoji: '🌦️' },
  63: { label: 'Pluie', emoji: '🌧️' },
  65: { label: 'Pluie forte', emoji: '🌧️' },
  71: { label: 'Neige légère', emoji: '🌨️' },
  73: { label: 'Neige', emoji: '🌨️' },
  75: { label: 'Neige forte', emoji: '❄️' },
  77: { label: 'Grésil', emoji: '🌨️' },
  80: { label: 'Averses légères', emoji: '🌦️' },
  81: { label: 'Averses', emoji: '🌧️' },
  82: { label: 'Averses fortes', emoji: '⛈️' },
  85: { label: 'Averses de neige', emoji: '🌨️' },
  86: { label: 'Fortes averses de neige', emoji: '❄️' },
  95: { label: 'Orage', emoji: '⛈️' },
  96: { label: 'Orage avec grêle', emoji: '⛈️' },
  99: { label: 'Orage violent', emoji: '⛈️' },
};

function describeCode(code: number): { label: string; emoji: string } {
  return WEATHER_CODES[code] ?? { label: 'Conditions inconnues', emoji: '🌡️' };
}

// Fetch la météo courante au point (lat, lon). Retourne null en cas d'erreur
// (timeout, code non-2xx, parsing) pour ne jamais bloquer la création d'une
// partie. La météo est cosmétique, pas critique.
export async function fetchCurrentWeather(
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
): Promise<WeatherSnapshot | null> {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', latitude.toString());
  url.searchParams.set('longitude', longitude.toString());
  url.searchParams.set('current', 'temperature_2m,weather_code');
  url.searchParams.set('timezone', 'auto');

  try {
    const res = await fetch(url.toString(), { signal });
    if (!res.ok) {
      console.warn('[weather] Open-Meteo non-OK', res.status);
      return null;
    }
    const data = (await res.json()) as {
      current?: { temperature_2m?: number; weather_code?: number };
    };
    const current = data.current;
    if (!current || typeof current.temperature_2m !== 'number' || typeof current.weather_code !== 'number') {
      console.warn('[weather] payload incomplet', data);
      return null;
    }
    const desc = describeCode(current.weather_code);
    return {
      temp_c: Math.round(current.temperature_2m * 10) / 10,
      code: current.weather_code,
      label: desc.label,
      emoji: desc.emoji,
    };
  } catch (err) {
    console.warn('[weather] fetch failed', err);
    return null;
  }
}
