import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import type {
  AgencyCode,
  AgencyFeedStatus,
  OceanRegion,
  SeverityLevel,
  TsunamiEvent,
  TsunamiFeedResponse,
} from './src/types/tsunami.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const USER_AGENT = 'TsunamiGuard/1.0 (tsunami-telemetry-monitor)';

let cachedFeed: { data: TsunamiFeedResponse; timestamp: number } | null = null;
const CACHE_TTL_MS = 45_000;

function inferOceanRegion(lat: number, lon: number, place = ''): OceanRegion {
  const p = place.toLowerCase();
  if (
    p.includes('japan') ||
    p.includes('kanto') ||
    p.includes('hokkaido') ||
    p.includes('honshu') ||
    p.includes('kuril') ||
    p.includes('izu') ||
    p.includes('ryukyu') ||
    p.includes('bonin') ||
    (lat >= 24 && lat <= 50 && lon >= 125 && lon <= 156)
  ) {
    return 'Japón y Kuriles';
  }
  if (
    p.includes('chile') ||
    p.includes('peru') ||
    p.includes('ecuador') ||
    p.includes('colombia') ||
    p.includes('drake') ||
    p.includes('easter island') ||
    (lat >= -58 && lat <= 12 && lon >= -95 && lon <= -64)
  ) {
    return 'Sudamérica';
  }
  if (
    p.includes('new zealand') ||
    p.includes('kermadec') ||
    p.includes('vanuatu') ||
    p.includes('fiji') ||
    p.includes('tonga') ||
    p.includes('samoa') ||
    p.includes('solomon') ||
    p.includes('papua') ||
    p.includes('macquarie') ||
    p.includes('australia') ||
    (lat >= -55 && lat <= 0 && (lon >= 140 || lon <= -165))
  ) {
    return 'Oceanía';
  }
  if (
    p.includes('indonesia') ||
    p.includes('sumatra') ||
    p.includes('java') ||
    p.includes('banda') ||
    p.includes('molucca') ||
    p.includes('philippines') ||
    p.includes('indian ocean') ||
    p.includes('andaman') ||
    (lat >= -20 && lat <= 22 && lon >= 55 && lon <= 135)
  ) {
    return 'Indonesia e Índico';
  }
  if (
    p.includes('mediterranean') ||
    p.includes('greece') ||
    p.includes('crete') ||
    p.includes('turkey') ||
    p.includes('italy') ||
    p.includes('aegean') ||
    (lat >= 30 && lat <= 46 && lon >= -6 && lon <= 42)
  ) {
    return 'Mediterráneo';
  }
  if (
    p.includes('caribbean') ||
    p.includes('puerto rico') ||
    p.includes('virgin islands') ||
    p.includes('atlantic') ||
    p.includes('sandwich') ||
    (lon >= -88 && lon <= -5 && lat >= -62 && lat <= 68)
  ) {
    return 'Caribe y Atlántico';
  }
  if (lat >= 0 && (lon >= 120 || lon <= -100)) {
    return 'Pacífico Norte';
  }
  if (lat < 0 && (lon >= 120 || lon <= -68)) {
    return 'Pacífico Sur';
  }
  return 'Global';
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function mapCategoryToSeverity(text: string): SeverityLevel {
  const t = text.toLowerCase();
  if (t.includes('major tsunami warning') || t.includes('tsunami warning') || t.includes('warning')) {
    return 'warning';
  }
  if (t.includes('watch')) {
    return 'watch';
  }
  if (t.includes('advisory')) {
    return 'advisory';
  }
  return 'information';
}

function mapSeverityToBulletinType(severity: SeverityLevel, originalTitle = ''): string {
  if (severity === 'warning') return 'Alerta de Tsunami';
  if (severity === 'watch') return 'Vigilancia de Tsunami';
  if (severity === 'advisory') return 'Aviso de Tsunami';
  if (originalTitle.toLowerCase().includes('forecast')) return 'Pronóstico de Tsunami';
  return 'Boletín Informativo';
}

function parseNoaaAtom(xml: string, agency: 'PTWC' | 'NTWC'): TsunamiEvent[] {
  const events: TsunamiEvent[] = [];
  const feedTitleMatch = xml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const feedHeadline = feedTitleMatch ? decodeHtmlEntities(feedTitleMatch[1]) : 'Tsunami Bulletin';

  const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi;
  let match: RegExpExecArray | null;
  while ((match = entryRegex.exec(xml)) !== null) {
    const entry = match[1];
    const title = decodeHtmlEntities(entry.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || 'Evento Oceánico');
    const updated = entry.match(/<updated[^>]*>([\s\S]*?)<\/updated>/i)?.[1]?.trim() || new Date().toISOString();
    const idRaw = entry.match(/<id[^>]*>([\s\S]*?)<\/id>/i)?.[1]?.trim() || `${agency}-${updated}`;
    const latStr = entry.match(/<geo:lat>([\s\S]*?)<\/geo:lat>/i)?.[1]?.trim();
    const lonStr = entry.match(/<geo:long>([\s\S]*?)<\/geo:long>/i)?.[1]?.trim();
    const summaryRaw = entry.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i)?.[1] || '';

    const lat = latStr ? parseFloat(latStr) : NaN;
    const lon = lonStr ? parseFloat(lonStr) : NaN;
    if (Number.isNaN(lat) || Number.isNaN(lon)) continue;

    const categoryMatch = summaryRaw.match(/Category:<\/strong>\s*([^<]+)/i);
    const magMatch = summaryRaw.match(/Preliminary Magnitude:\s*<\/strong>\s*([\d.]+)\s*\(?([A-Za-z]+)?\)?/i);
    const regionMatch = summaryRaw.match(/Affected Region:\s*<\/strong>\s*([^<]+)/i);
    const bulletinHref = summaryRaw.match(/href="([^"]+\.txt)"/i)?.[1] ||
      entry.match(/href="([^"]+PHEBCAP\.xml|[^"]+PAAQCAP\.xml)"/i)?.[1];

    const categoryText = categoryMatch ? categoryMatch[1].trim() : feedHeadline;
    const severity = mapCategoryToSeverity(`${categoryText} ${feedHeadline}`);
    const magnitude = magMatch ? parseFloat(magMatch[1]) : null;
    const magnitudeType = magMatch?.[2] || (magnitude ? 'Mwp' : null);
    const location = regionMatch ? decodeHtmlEntities(regionMatch[1]) : title;

    events.push({
      id: `${agency.toLowerCase()}-${idRaw.replace(/[^a-zA-Z0-9_-]/g, '').slice(-24)}`,
      title: location,
      agency,
      agencyFullName:
        agency === 'PTWC'
          ? 'Pacific Tsunami Warning Center (NOAA)'
          : 'National Tsunami Warning Center (NOAA)',
      bulletinType: mapSeverityToBulletinType(severity, feedHeadline),
      severity,
      region: inferOceanRegion(lat, lon, location),
      location,
      latitude: lat,
      longitude: lon,
      depthKm: null,
      magnitude,
      magnitudeType,
      issuedAt: new Date(updated).toISOString(),
      tsunamiFlag: severity !== 'information' || (magnitude !== null && magnitude >= 6.5),
      summary: `${feedHeadline} emitido por ${agency} para ${location}. Categoría: ${categoryText}.`,
      bulletinUrl: bulletinHref,
      status: severity === 'warning' || severity === 'watch' || severity === 'advisory' ? 'active' : 'historical',
    });
  }
  return events;
}

function parseIso6709(cod: string): { lat: number; lon: number; depthKm: number | null } | null {
  const m = cod.match(/^([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)?\/?$/);
  if (!m) return null;
  const lat = parseFloat(m[1]);
  const lon = parseFloat(m[2]);
  const depthMeters = m[3] ? Math.abs(parseFloat(m[3])) : null;
  return {
    lat,
    lon,
    depthKm: depthMeters !== null ? Math.round((depthMeters / 1000) * 10) / 10 : null,
  };
}

async function fetchNwsAlerts(): Promise<{ events: TsunamiEvent[]; status: AgencyFeedStatus }> {
  try {
    const url =
      'https://api.weather.gov/alerts?event=Tsunami%20Warning,Tsunami%20Advisory,Tsunami%20Watch,Tsunami%20Information%20Statement&limit=20';
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/geo+json' },
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const features = Array.isArray(data.features) ? data.features : [];
    const events: TsunamiEvent[] = [];

    for (const f of features) {
      const p = f.properties || {};
      let lat = 0;
      let lon = 0;
      if (f.geometry?.type === 'Polygon' && Array.isArray(f.geometry.coordinates?.[0])) {
        const ring = f.geometry.coordinates[0];
        lon = ring.reduce((acc: number, pt: number[]) => acc + pt[0], 0) / ring.length;
        lat = ring.reduce((acc: number, pt: number[]) => acc + pt[1], 0) / ring.length;
      } else if (f.geometry?.type === 'Point') {
        lon = f.geometry.coordinates[0];
        lat = f.geometry.coordinates[1];
      } else {
        continue;
      }

      const eventType = String(p.event || 'Tsunami Information Statement');
      const severity = mapCategoryToSeverity(eventType);
      const areaDesc = String(p.areaDesc || 'Zona Costera Pacífico');
      const issuedAt = p.sent || p.effective || new Date().toISOString();

      events.push({
        id: `nws-${String(p.id || f.id || issuedAt).slice(-24)}`,
        title: p.headline || eventType,
        agency: 'NWS',
        agencyFullName: 'U.S. National Weather Service (CAP)',
        bulletinType: mapSeverityToBulletinType(severity, eventType),
        severity,
        region: inferOceanRegion(lat, lon, areaDesc),
        location: areaDesc,
        latitude: Number(lat.toFixed(3)),
        longitude: Number(lon.toFixed(3)),
        depthKm: null,
        magnitude: null,
        magnitudeType: null,
        issuedAt: new Date(issuedAt).toISOString(),
        tsunamiFlag: severity !== 'information',
        summary: String(p.description || p.headline || eventType).slice(0, 420),
        bulletinText: [p.headline, p.description, p.instruction].filter(Boolean).join('\n\n'),
        bulletinUrl: f.id,
        status: p.status === 'Actual' && new Date(p.expires || 0).getTime() > Date.now() ? 'active' : 'historical',
      });
    }

    return {
      events,
      status: {
        code: 'NWS',
        name: 'NOAA / NWS CAP Alerts',
        regionCoverage: 'EE.UU., Alaska, Hawái y Pacífico',
        ok: true,
        count: events.length,
      },
    };
  } catch (err: any) {
    return {
      events: [],
      status: {
        code: 'NWS',
        name: 'NOAA / NWS CAP Alerts',
        regionCoverage: 'EE.UU., Alaska, Hawái y Pacífico',
        ok: false,
        count: 0,
        error: err?.message || 'Error de conexión',
      },
    };
  }
}

async function fetchNoaaTsunamiGov(agency: 'PTWC' | 'NTWC'): Promise<{ events: TsunamiEvent[]; status: AgencyFeedStatus }> {
  const url =
    agency === 'PTWC'
      ? 'https://www.tsunami.gov/events/xml/PHEBAtom.xml'
      : 'https://www.tsunami.gov/events/xml/PAAQAtom.xml';
  const name =
    agency === 'PTWC'
      ? 'Pacific Tsunami Warning Center (PTWC)'
      : 'National Tsunami Warning Center (NTWC)';
  const coverage =
    agency === 'PTWC'
      ? 'Cuenca del Pacífico, Caribe e Índico'
      : 'América del Norte y Ártico';

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    const events = parseNoaaAtom(xml, agency);

    // Pre-fetch the newest bulletin text if available
    if (events[0]?.bulletinUrl && events[0].bulletinUrl.endsWith('.txt')) {
      try {
        const bRes = await fetch(events[0].bulletinUrl, {
          headers: { 'User-Agent': USER_AGENT },
          signal: AbortSignal.timeout(4000),
        });
        if (bRes.ok) {
          events[0].bulletinText = await bRes.text();
        }
      } catch {
        // Non-blocking
      }
    }

    return {
      events,
      status: { code: agency, name, regionCoverage: coverage, ok: true, count: events.length },
    };
  } catch (err: any) {
    return {
      events: [],
      status: {
        code: agency,
        name,
        regionCoverage: coverage,
        ok: false,
        count: 0,
        error: err?.message || 'Error de conexión',
      },
    };
  }
}

async function fetchJmaTsunami(): Promise<{ events: TsunamiEvent[]; status: AgencyFeedStatus }> {
  try {
    const res = await fetch('https://www.jma.go.jp/bosai/tsunami/data/list.json', {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const list = await res.json();
    const items = Array.isArray(list) ? list : [];
    const events: TsunamiEvent[] = [];

    for (const item of items.slice(0, 20)) {
      const coords = item.cod ? parseIso6709(String(item.cod)) : null;
      if (!coords) continue;
      const enTitle = String(item.en_ttl || item.ttl || 'Tsunami Forecast');
      const enPlace = String(item.en_anm || item.anm || 'Japan Region');
      const kindLabels = Array.isArray(item.kind) ? item.kind.map((k: any) => k.kind).join(', ') : '';
      const severity = mapCategoryToSeverity(`${enTitle} ${kindLabels}`);
      const mag = item.mag ? parseFloat(String(item.mag)) : null;

      events.push({
        id: `jma-${item.eid || item.ctt || Math.random().toString(36).slice(2)}`,
        title: `${enPlace} (${enTitle})`,
        agency: 'JMA',
        agencyFullName: 'Japan Meteorological Agency (JMA)',
        bulletinType: mapSeverityToBulletinType(severity, enTitle),
        severity,
        region: 'Japón y Kuriles',
        location: enPlace,
        latitude: coords.lat,
        longitude: coords.lon,
        depthKm: coords.depthKm,
        magnitude: Number.isNaN(mag as number) ? null : mag,
        magnitudeType: mag ? 'Mj' : null,
        issuedAt: new Date(item.rdt || item.at || Date.now()).toISOString(),
        tsunamiFlag: true,
        summary: `Boletín oficial JMA (${enTitle}) emitido para ${enPlace}. ${kindLabels ? `Clasificación: ${kindLabels}.` : ''}`,
        bulletinUrl: item.json ? `https://www.jma.go.jp/bosai/tsunami/data/${item.json}` : undefined,
        status: 'historical',
      });
    }

    return {
      events,
      status: {
        code: 'JMA',
        name: 'Japan Meteorological Agency (JMA)',
        regionCoverage: 'Japón, Mar de Japón y Pacífico Noroeste',
        ok: true,
        count: events.length,
      },
    };
  } catch (err: any) {
    return {
      events: [],
      status: {
        code: 'JMA',
        name: 'Japan Meteorological Agency (JMA)',
        regionCoverage: 'Japón, Mar de Japón y Pacífico Noroeste',
        ok: false,
        count: 0,
        error: err?.message || 'Error de conexión',
      },
    };
  }
}

async function fetchUsgsTsunamiAndSeismic(): Promise<{ events: TsunamiEvent[]; status: AgencyFeedStatus }> {
  try {
    const oneYearAgo = new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString().split('T')[0];
    const url = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&minmagnitude=6.0&starttime=${oneYearAgo}&limit=120`;
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(9000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const features = Array.isArray(data.features) ? data.features : [];
    const events: TsunamiEvent[] = [];

    for (const f of features) {
      const p = f.properties || {};
      const coords = f.geometry?.coordinates;
      if (!Array.isArray(coords) || coords.length < 2) continue;
      const lon = Number(coords[0]);
      const lat = Number(coords[1]);
      const depth = coords[2] !== undefined && coords[2] !== null ? Math.round(Number(coords[2]) * 10) / 10 : null;
      const mag = p.mag !== null && p.mag !== undefined ? Number(p.mag) : null;
      const tsunamiFlag = p.tsunami === 1;
      const place = String(p.place || 'Océano Abierto');

      let severity: SeverityLevel = 'information';
      if (tsunamiFlag && mag !== null && mag >= 7.6) {
        severity = 'warning';
      } else if (tsunamiFlag && mag !== null && mag >= 7.0) {
        severity = 'watch';
      } else if (tsunamiFlag) {
        severity = 'advisory';
      } else if (mag !== null && mag >= 7.0) {
        severity = 'watch';
      }

      const ageHours = (Date.now() - Number(p.time || 0)) / 3_600_000;

      events.push({
        id: `usgs-${f.id}`,
        title: place,
        agency: 'USGS',
        agencyFullName: 'U.S. Geological Survey (NEIC)',
        bulletinType: tsunamiFlag
          ? severity === 'warning'
            ? 'Alerta de Tsunami (Sismo Oceánico)'
            : severity === 'watch'
            ? 'Vigilancia de Tsunami'
            : 'Aviso de Tsunami'
          : 'Monitoreo Sísmico Oceánico',
        severity,
        region: inferOceanRegion(lat, lon, place),
        location: place,
        latitude: Number(lat.toFixed(3)),
        longitude: Number(lon.toFixed(3)),
        depthKm: depth,
        magnitude: mag,
        magnitudeType: p.magType || 'Mww',
        issuedAt: new Date(Number(p.time || Date.now())).toISOString(),
        tsunamiFlag,
        summary: tsunamiFlag
          ? `Evento sísmico M${mag?.toFixed(1) ?? '?'} con bandera oficial de evaluación tsunamigénica activada por USGS/NOAA en ${place}. Profundidad: ${depth ?? '?'} km.`
          : `Sismo oceánico/costero significativo M${mag?.toFixed(1) ?? '?'} registrado por USGS NEIC en ${place}. Profundidad: ${depth ?? '?'} km.`,
        bulletinUrl: p.url,
        status: ageHours <= 48 && tsunamiFlag ? 'active' : 'historical',
      });
    }

    return {
      events,
      status: {
        code: 'USGS',
        name: 'USGS National Earthquake Information Center',
        regionCoverage: 'Cobertura Sísmica y Tsunamigénica Global',
        ok: true,
        count: events.length,
      },
    };
  } catch (err: any) {
    return {
      events: [],
      status: {
        code: 'USGS',
        name: 'USGS National Earthquake Information Center',
        regionCoverage: 'Cobertura Sísmica y Tsunamigénica Global',
        ok: false,
        count: 0,
        error: err?.message || 'Error de conexión',
      },
    };
  }
}

async function fetchEmscEvents(): Promise<{ events: TsunamiEvent[]; status: AgencyFeedStatus }> {
  try {
    const url = 'https://www.seismicportal.eu/fdsnws/event/1/query?format=json&minmag=5.8&limit=30';
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const features = Array.isArray(data.features) ? data.features : [];
    const events: TsunamiEvent[] = [];

    for (const f of features) {
      const p = f.properties || {};
      const coords = f.geometry?.coordinates;
      if (!Array.isArray(coords) || coords.length < 2) continue;
      const lon = Number(coords[0]);
      const lat = Number(coords[1]);
      const depth = p.depth !== undefined ? Math.round(Math.abs(Number(p.depth)) * 10) / 10 : null;
      const mag = p.mag !== undefined ? Number(p.mag) : null;
      const place = String(p.flynn_region || 'Región Euro-Mediterránea / Global');
      const severity: SeverityLevel = mag && mag >= 7.2 ? 'watch' : mag && mag >= 6.6 ? 'advisory' : 'information';

      events.push({
        id: `emsc-${f.id || p.source_id}`,
        title: place,
        agency: 'EMSC',
        agencyFullName: 'European-Mediterranean Seismological Centre (EMSC)',
        bulletinType: severity === 'information' ? 'Boletín Sísmico NEAMTWS' : 'Vigilancia Regional EMSC',
        severity,
        region: inferOceanRegion(lat, lon, place),
        location: place,
        latitude: Number(lat.toFixed(3)),
        longitude: Number(lon.toFixed(3)),
        depthKm: depth,
        magnitude: mag,
        magnitudeType: p.magtype || 'Mw',
        issuedAt: new Date(p.time || Date.now()).toISOString(),
        tsunamiFlag: mag !== null && mag >= 6.8,
        summary: `Registro EMSC/CSEM M${mag?.toFixed(1) ?? '?'} en ${place}. Profundidad focal: ${depth ?? '?'} km.`,
        bulletinUrl: `https://www.emsc-csem.org/Earthquake_information/earthquake.php?id=${p.source_id || ''}`,
        status: 'historical',
      });
    }

    return {
      events,
      status: {
        code: 'EMSC',
        name: 'EMSC / CSEM',
        regionCoverage: 'Mediterráneo, Atlántico y Global',
        ok: true,
        count: events.length,
      },
    };
  } catch (err: any) {
    return {
      events: [],
      status: {
        code: 'EMSC',
        name: 'EMSC / CSEM',
        regionCoverage: 'Mediterráneo, Atlántico y Global',
        ok: false,
        count: 0,
        error: err?.message || 'Error de conexión',
      },
    };
  }
}

async function fetchGeoNetEvents(): Promise<{ events: TsunamiEvent[]; status: AgencyFeedStatus }> {
  try {
    const res = await fetch('https://api.geonet.org.nz/quake?MMI=5', {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const features = Array.isArray(data.features) ? data.features : [];
    const events: TsunamiEvent[] = [];

    for (const f of features.slice(0, 20)) {
      const p = f.properties || {};
      const coords = f.geometry?.coordinates;
      if (!Array.isArray(coords) || coords.length < 2) continue;
      const mag = Number(p.magnitude || 0);
      if (mag < 5.0) continue;

      const lon = Number(coords[0]);
      const lat = Number(coords[1]);
      const depth = p.depth !== undefined ? Math.round(Number(p.depth) * 10) / 10 : null;
      const place = String(p.locality || 'New Zealand / Kermadec Region');
      const severity: SeverityLevel = mag >= 7.0 ? 'watch' : mag >= 6.2 ? 'advisory' : 'information';

      events.push({
        id: `geonet-${p.publicID}`,
        title: place,
        agency: 'GeoNet',
        agencyFullName: 'GeoNet / GNS Science New Zealand',
        bulletinType: 'Boletín Pacífico Sur (GeoNet)',
        severity,
        region: 'Oceanía',
        location: place,
        latitude: Number(lat.toFixed(3)),
        longitude: Number(lon.toFixed(3)),
        depthKm: depth,
        magnitude: Number(mag.toFixed(1)),
        magnitudeType: 'M',
        issuedAt: new Date(p.time || Date.now()).toISOString(),
        tsunamiFlag: mag >= 6.5,
        summary: `Monitoreo GeoNet Pacífico Sur: M${mag.toFixed(1)} (${place}), profundidad ${depth ?? '?'} km, MMI ${p.mmi ?? '-'}.`,
        bulletinUrl: `https://www.geonet.org.nz/earthquake/${p.publicID}`,
        status: 'historical',
      });
    }

    return {
      events,
      status: {
        code: 'GeoNet',
        name: 'GeoNet New Zealand',
        regionCoverage: 'Nueva Zelanda, Kermadec y Pacífico Sur',
        ok: true,
        count: events.length,
      },
    };
  } catch (err: any) {
    return {
      events: [],
      status: {
        code: 'GeoNet',
        name: 'GeoNet New Zealand',
        regionCoverage: 'Nueva Zelanda, Kermadec y Pacífico Sur',
        ok: false,
        count: 0,
        error: err?.message || 'Error de conexión',
      },
    };
  }
}

async function aggregateTsunamiFeeds(force = false): Promise<TsunamiFeedResponse> {
  if (!force && cachedFeed && Date.now() - cachedFeed.timestamp < CACHE_TTL_MS) {
    return cachedFeed.data;
  }

  const results = await Promise.all([
    fetchNwsAlerts(),
    fetchNoaaTsunamiGov('PTWC'),
    fetchNoaaTsunamiGov('NTWC'),
    fetchJmaTsunami(),
    fetchUsgsTsunamiAndSeismic(),
    fetchEmscEvents(),
    fetchGeoNetEvents(),
  ]);

  const allEvents = results.flatMap((r) => r.events);
  const agencies = results.map((r) => r.status);

  // Deduplicate exact IDs and sort newest first
  const seen = new Set<string>();
  const uniqueEvents: TsunamiEvent[] = [];
  for (const ev of allEvents) {
    if (!seen.has(ev.id)) {
      seen.add(ev.id);
      uniqueEvents.push(ev);
    }
  }

  uniqueEvents.sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime());

  const response: TsunamiFeedResponse = {
    events: uniqueEvents,
    agencies,
    fetchedAt: new Date().toISOString(),
  };

  cachedFeed = { data: response, timestamp: Date.now() };
  return response;
}

const ALLOWED_BULLETIN_ORIGINS = [
  'https://www.tsunami.gov/',
  'https://www.jma.go.jp/',
  'https://api.weather.gov/',
];

const ESRI_LAYER_PATHS: Record<string, string> = {
  ocean: 'Ocean/World_Ocean_Base',
  imagery: 'World_Imagery',
  'dark-gray': 'Canvas/World_Dark_Gray_Base',
  'light-gray': 'Canvas/World_Light_Gray_Base',
  topo: 'World_Topo_Map',
  natgeo: 'NatGeo_World_Map',
};

async function startServer() {
  const app = express();
  app.set('trust proxy', true);

  const configuredBasePath = process.env.BASE_PATH
    ? '/' + process.env.BASE_PATH.replace(/^\/+|\/+$/g, '')
    : '';

  app.use((req, res, next) => {
    const qIdx = req.url.indexOf('?');
    const pathname = qIdx >= 0 ? req.url.slice(0, qIdx) : req.url;
    const query = qIdx >= 0 ? req.url.slice(qIdx) : '';

    if (configuredBasePath) {
      if (pathname === configuredBasePath) {
        res.redirect(301, `${configuredBasePath}/${query}`);
        return;
      }
      if (pathname.startsWith(`${configuredBasePath}/`)) {
        req.url = (pathname.slice(configuredBasePath.length) || '/') + query;
        next();
        return;
      }
    }

    // Automatically strip any reverse-proxy subpath prefix before /api/, /assets/, or /src/assets/
    const subMatch = pathname.match(/^.+?(\/(?:api|assets|src\/assets)\/.*)$/);
    if (subMatch && !pathname.startsWith('/api/') && !pathname.startsWith('/assets/')) {
      req.url = subMatch[1] + query;
    }
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, timestamp: new Date().toISOString() });
  });

  app.get('/api/tsunami-events', async (req, res) => {
    try {
      const force = req.query.force === '1';
      const data = await aggregateTsunamiFeeds(force);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Error al consultar agencias internacionales' });
    }
  });

  app.get('/api/bulletin-text', async (req, res) => {
    const rawUrl = String(req.query.url || '');
    if (!ALLOWED_BULLETIN_ORIGINS.some((prefix) => rawUrl.startsWith(prefix))) {
      res.status(400).json({ error: 'Origen de boletín no autorizado' });
      return;
    }
    try {
      const upstream = await fetch(rawUrl, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(7000),
      });
      if (!upstream.ok) {
        res.status(upstream.status).json({ error: `HTTP ${upstream.status}` });
        return;
      }
      const text = await upstream.text();
      res.json({ text });
    } catch (err: any) {
      res.status(502).json({ error: err?.message || 'No se pudo descargar el boletín oficial' });
    }
  });

  app.get('/api/map-tile/:layer/:z/:y/:x', async (req, res) => {
    const { layer, z, y, x } = req.params;
    const servicePath = ESRI_LAYER_PATHS[layer];
    if (!servicePath || !/^\d{1,2}$/.test(z) || !/^\d{1,6}$/.test(y) || !/^\d{1,6}$/.test(x)) {
      res.status(400).send('Invalid tile parameters');
      return;
    }
    const tileUrl = `https://server.arcgisonline.com/ArcGIS/rest/services/${servicePath}/MapServer/tile/${z}/${y}/${x}`;
    try {
      const upstream = await fetch(tileUrl, { signal: AbortSignal.timeout(6000) });
      if (!upstream.ok) {
        res.status(upstream.status).send('Tile unavailable');
        return;
      }
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.setHeader('Content-Type', upstream.headers.get('content-type') || 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.send(buf);
    } catch {
      res.status(502).send('Tile proxy error');
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build not found');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Tsunami Guard server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
