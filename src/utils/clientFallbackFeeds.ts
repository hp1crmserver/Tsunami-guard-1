import type {
  AgencyFeedStatus,
  OceanRegion,
  SeverityLevel,
  TsunamiEvent,
  TsunamiFeedResponse,
} from '../types/tsunami';

function inferOceanRegion(lat: number, lon: number, place = ''): OceanRegion {
  const p = place.toLowerCase();
  if (
    p.includes('japan') ||
    p.includes('kanto') ||
    p.includes('hokkaido') ||
    p.includes('honshu') ||
    p.includes('kuril') ||
    (lat >= 24 && lat <= 50 && lon >= 125 && lon <= 156)
  ) {
    return 'Japón y Kuriles';
  }
  if (
    p.includes('chile') ||
    p.includes('peru') ||
    p.includes('ecuador') ||
    p.includes('colombia') ||
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
    (lat >= -55 && lat <= 0 && (lon >= 140 || lon <= -165))
  ) {
    return 'Oceanía';
  }
  if (
    p.includes('indonesia') ||
    p.includes('sumatra') ||
    p.includes('java') ||
    p.includes('philippines') ||
    (lat >= -20 && lat <= 22 && lon >= 55 && lon <= 135)
  ) {
    return 'Indonesia e Índico';
  }
  if (
    p.includes('mediterranean') ||
    p.includes('greece') ||
    p.includes('turkey') ||
    p.includes('italy') ||
    (lat >= 30 && lat <= 46 && lon >= -6 && lon <= 42)
  ) {
    return 'Mediterráneo';
  }
  if (
    p.includes('caribbean') ||
    p.includes('puerto rico') ||
    p.includes('atlantic') ||
    (lon >= -88 && lon <= -5 && lat >= -62 && lat <= 68)
  ) {
    return 'Caribe y Atlántico';
  }
  if (lat >= 0 && (lon >= 120 || lon <= -100)) return 'Pacífico Norte';
  if (lat < 0 && (lon >= 120 || lon <= -68)) return 'Pacífico Sur';
  return 'Global';
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

export async function fetchDirectCorsFeeds(): Promise<TsunamiFeedResponse> {
  const agencies: AgencyFeedStatus[] = [];
  const allEvents: TsunamiEvent[] = [];

  // 1. USGS
  try {
    const oneYearAgo = new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString().split('T')[0];
    const r = await fetch(
      `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&minmagnitude=6.0&starttime=${oneYearAgo}&limit=100`
    );
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    const features = Array.isArray(data.features) ? data.features : [];
    for (const f of features) {
      const p = f.properties || {};
      const coords = f.geometry?.coordinates;
      if (!Array.isArray(coords) || coords.length < 2) continue;
      const lon = Number(coords[0]);
      const lat = Number(coords[1]);
      const depth = coords[2] != null ? Math.round(Number(coords[2]) * 10) / 10 : null;
      const mag = p.mag != null ? Number(p.mag) : null;
      const tsunamiFlag = p.tsunami === 1;
      const place = String(p.place || 'Océano Abierto');
      let severity: SeverityLevel = 'information';
      if (tsunamiFlag && mag !== null && mag >= 7.6) severity = 'warning';
      else if (tsunamiFlag && mag !== null && mag >= 7.0) severity = 'watch';
      else if (tsunamiFlag) severity = 'advisory';
      else if (mag !== null && mag >= 7.0) severity = 'watch';

      allEvents.push({
        id: `usgs-${f.id}`,
        title: place,
        agency: 'USGS',
        agencyFullName: 'U.S. Geological Survey (NEIC)',
        bulletinType: tsunamiFlag ? 'Evaluación Tsunamigénica' : 'Monitoreo Sísmico Oceánico',
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
        summary: `Registro USGS NEIC M${mag?.toFixed(1) ?? '?'} en ${place}. Profundidad: ${depth ?? '?'} km.`,
        bulletinUrl: p.url,
        status: tsunamiFlag && Date.now() - Number(p.time || 0) < 172_800_000 ? 'active' : 'historical',
      });
    }
    agencies.push({
      code: 'USGS',
      name: 'USGS National Earthquake Information Center',
      regionCoverage: 'Cobertura Sísmica y Tsunamigénica Global',
      ok: true,
      count: features.length,
    });
  } catch (e: any) {
    agencies.push({
      code: 'USGS',
      name: 'USGS National Earthquake Information Center',
      regionCoverage: 'Global',
      ok: false,
      count: 0,
      error: e?.message,
    });
  }

  // 2. JMA
  try {
    const r = await fetch('https://www.jma.go.jp/bosai/tsunami/data/list.json');
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const list = await r.json();
    const items = Array.isArray(list) ? list.slice(0, 20) : [];
    let count = 0;
    for (const item of items) {
      const coords = item.cod ? parseIso6709(String(item.cod)) : null;
      if (!coords) continue;
      count++;
      const enTitle = String(item.en_ttl || item.ttl || 'Tsunami Forecast');
      const enPlace = String(item.en_anm || item.anm || 'Japan Region');
      const mag = item.mag ? parseFloat(String(item.mag)) : null;
      allEvents.push({
        id: `jma-${item.eid || item.ctt}`,
        title: `${enPlace} (${enTitle})`,
        agency: 'JMA',
        agencyFullName: 'Japan Meteorological Agency (JMA)',
        bulletinType: enTitle,
        severity: 'information',
        region: 'Japón y Kuriles',
        location: enPlace,
        latitude: coords.lat,
        longitude: coords.lon,
        depthKm: coords.depthKm,
        magnitude: Number.isNaN(mag as number) ? null : mag,
        magnitudeType: mag ? 'Mj' : null,
        issuedAt: new Date(item.rdt || item.at || Date.now()).toISOString(),
        tsunamiFlag: true,
        summary: `Boletín oficial JMA (${enTitle}) para ${enPlace}.`,
        bulletinUrl: item.json ? `https://www.jma.go.jp/bosai/tsunami/data/${item.json}` : undefined,
        status: 'historical',
      });
    }
    agencies.push({
      code: 'JMA',
      name: 'Japan Meteorological Agency (JMA)',
      regionCoverage: 'Japón y Pacífico Noroeste',
      ok: true,
      count,
    });
  } catch (e: any) {
    agencies.push({
      code: 'JMA',
      name: 'Japan Meteorological Agency (JMA)',
      regionCoverage: 'Japón y Pacífico Noroeste',
      ok: false,
      count: 0,
      error: e?.message,
    });
  }

  // 3. EMSC
  try {
    const r = await fetch('https://www.seismicportal.eu/fdsnws/event/1/query?format=json&minmag=5.8&limit=25');
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    const features = Array.isArray(data.features) ? data.features : [];
    for (const f of features) {
      const p = f.properties || {};
      const coords = f.geometry?.coordinates;
      if (!Array.isArray(coords) || coords.length < 2) continue;
      const lon = Number(coords[0]);
      const lat = Number(coords[1]);
      const mag = p.mag != null ? Number(p.mag) : null;
      const depth = p.depth != null ? Math.round(Math.abs(Number(p.depth)) * 10) / 10 : null;
      const place = String(p.flynn_region || 'Global');
      const severity: SeverityLevel = mag && mag >= 7.2 ? 'watch' : mag && mag >= 6.6 ? 'advisory' : 'information';
      allEvents.push({
        id: `emsc-${f.id || p.source_id}`,
        title: place,
        agency: 'EMSC',
        agencyFullName: 'European-Mediterranean Seismological Centre (EMSC)',
        bulletinType: 'Boletín Sísmico NEAMTWS',
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
        summary: `Registro EMSC M${mag?.toFixed(1) ?? '?'} en ${place}.`,
        status: 'historical',
      });
    }
    agencies.push({
      code: 'EMSC',
      name: 'EMSC / CSEM',
      regionCoverage: 'Mediterráneo, Atlántico y Global',
      ok: true,
      count: features.length,
    });
  } catch (e: any) {
    agencies.push({
      code: 'EMSC',
      name: 'EMSC / CSEM',
      regionCoverage: 'Mediterráneo, Atlántico y Global',
      ok: false,
      count: 0,
      error: e?.message,
    });
  }

  // 4. GeoNet
  try {
    const r = await fetch('https://api.geonet.org.nz/quake?MMI=5');
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    const features = Array.isArray(data.features) ? data.features : [];
    let count = 0;
    for (const f of features.slice(0, 20)) {
      const p = f.properties || {};
      const coords = f.geometry?.coordinates;
      const mag = Number(p.magnitude || 0);
      if (!Array.isArray(coords) || coords.length < 2 || mag < 5.0) continue;
      count++;
      const place = String(p.locality || 'New Zealand Region');
      allEvents.push({
        id: `geonet-${p.publicID}`,
        title: place,
        agency: 'GeoNet',
        agencyFullName: 'GeoNet / GNS Science New Zealand',
        bulletinType: 'Boletín Pacífico Sur (GeoNet)',
        severity: mag >= 7.0 ? 'watch' : mag >= 6.2 ? 'advisory' : 'information',
        region: 'Oceanía',
        location: place,
        latitude: Number(Number(coords[1]).toFixed(3)),
        longitude: Number(Number(coords[0]).toFixed(3)),
        depthKm: p.depth != null ? Math.round(Number(p.depth) * 10) / 10 : null,
        magnitude: Number(mag.toFixed(1)),
        magnitudeType: 'M',
        issuedAt: new Date(p.time || Date.now()).toISOString(),
        tsunamiFlag: mag >= 6.5,
        summary: `Monitoreo GeoNet Pacífico Sur: M${mag.toFixed(1)} (${place}).`,
        bulletinUrl: `https://www.geonet.org.nz/earthquake/${p.publicID}`,
        status: 'historical',
      });
    }
    agencies.push({
      code: 'GeoNet',
      name: 'GeoNet New Zealand',
      regionCoverage: 'Nueva Zelanda y Pacífico Sur',
      ok: true,
      count,
    });
  } catch (e: any) {
    agencies.push({
      code: 'GeoNet',
      name: 'GeoNet New Zealand',
      regionCoverage: 'Nueva Zelanda y Pacífico Sur',
      ok: false,
      count: 0,
      error: e?.message,
    });
  }

  allEvents.sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime());

  return {
    events: allEvents,
    agencies,
    fetchedAt: new Date().toISOString(),
  };
}
