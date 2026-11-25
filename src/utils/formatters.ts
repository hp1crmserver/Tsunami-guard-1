import type { TsunamiEvent } from '../types/tsunami';

export function getLocalTimeZoneLabel(): string {
  try {
    const parts = new Intl.DateTimeFormat('es-ES', { timeZoneName: 'short' }).formatToParts(
      new Date()
    );
    const tzShort = parts.find((p) => p.type === 'timeZoneName')?.value;
    const tzIana = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tzShort && tzIana) return `${tzShort} (${tzIana})`;
    return tzShort || tzIana || 'Local';
  } catch {
    return 'Local';
  }
}

export function getLocalTimeZoneShort(): string {
  try {
    const parts = new Intl.DateTimeFormat('es-ES', { timeZoneName: 'short' }).formatToParts(
      new Date()
    );
    return parts.find((p) => p.type === 'timeZoneName')?.value || 'Local';
  } catch {
    return 'Local';
  }
}

export function formatLocalDateTime(iso: string, includeTz = true): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return includeTz
    ? `${yyyy}-${mm}-${dd} ${hh}:${min} ${getLocalTimeZoneShort()}`
    : `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

export function formatLocalDateInput(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function formatUtcDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const min = String(d.getUTCMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min} UTC`;
}

export function formatLocalShort(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(d);
}

export function formatRelativeTimeEs(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return '—';
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'Hace instantes';
  if (min < 60) return `Hace ${min} min`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `Hace ${hrs} h`;
  const days = Math.floor(hrs / 24);
  return `Hace ${days} d`;
}

export function formatCoordinates(lat: number, lon: number): string {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'O';
  return `${Math.abs(lat).toFixed(3)}° ${ns}, ${Math.abs(lon).toFixed(3)}° ${ew}`;
}

export function estimateWaveTravelTimes(event: TsunamiEvent): { radiusKm: number; etaHours: string }[] {
  return [
    { radiusKm: 500, etaHours: '0 h 38 min' },
    { radiusKm: 1500, etaHours: '1 h 53 min' },
    { radiusKm: 3000, etaHours: '3 h 45 min' },
  ].map((ring) => ({
    ...ring,
    radiusKm: event.severity === 'warning' ? ring.radiusKm : ring.radiusKm,
  }));
}
