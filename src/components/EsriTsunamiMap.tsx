import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Layers, Crosshair, Waves, Radio } from 'lucide-react';
import { SEVERITY_META, type EsriLayerId, type TsunamiEvent } from '../types/tsunami';
import { formatCoordinates, formatLocalDateTime } from '../utils/formatters';

interface EsriTsunamiMapProps {
  events: TsunamiEvent[];
  selectedEvent: TsunamiEvent | null;
  onSelectEvent: (ev: TsunamiEvent) => void;
  esriLayer: EsriLayerId;
  onChangeEsriLayer: (layer: EsriLayerId) => void;
  isDark: boolean;
}

const ESRI_BASEMAPS: Record<
  EsriLayerId,
  { label: string; url: string; refUrl?: string; attribution: string }
> = {
  ocean: {
    label: 'Esri Océano (Batimetría)',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}',
    refUrl: 'https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Reference/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Esri, GEBCO, NOAA, National Geographic',
  },
  imagery: {
    label: 'Esri Satélite (Imagery)',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    refUrl: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Esri, Maxar, Earthstar Geographics',
  },
  'dark-gray': {
    label: 'Esri Gris Oscuro',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    refUrl: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Esri, HERE, Garmin, OpenStreetMap',
  },
  'light-gray': {
    label: 'Esri Gris Claro',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    refUrl: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Esri, HERE, Garmin, OpenStreetMap',
  },
  topo: {
    label: 'Esri Topográfico',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Esri, HERE, Garmin, FAO, NOAA, USGS',
  },
  natgeo: {
    label: 'Esri National Geographic',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/NatGeo_World_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Esri, National Geographic, Garmin, UNEP-WCMC',
  },
};

// Key NOAA DART deep-ocean tsunami detection buoys (real coordinates)
const DART_STATIONS: { id: string; name: string; lat: number; lon: number }[] = [
  { id: '46404', name: 'DART 46404 · Astoria, OR', lat: 45.85, lon: -128.78 },
  { id: '46409', name: 'DART 46409 · Kodiak, AK', lat: 55.3, lon: -148.5 },
  { id: '51407', name: 'DART 51407 · Hawaii', lat: 19.59, lon: -156.52 },
  { id: '52402', name: 'DART 52402 · Saipan', lat: 11.88, lon: 154.12 },
  { id: '21418', name: 'DART 21418 · NE Tokio', lat: 38.71, lon: 148.69 },
  { id: '32412', name: 'DART 32412 · Lima, Perú', lat: -17.98, lon: -86.33 },
  { id: '32402', name: 'DART 32402 · Caldera, Chile', lat: -26.74, lon: -73.98 },
  { id: '55012', name: 'DART 55012 · Mar de Coral', lat: -15.66, lon: 158.45 },
  { id: '41424', name: 'DART 41424 · Atlántico Sur EE.UU.', lat: 32.91, lon: -72.46 },
  { id: '42407', name: 'DART 42407 · Mar Caribe', lat: 15.26, lon: -68.24 },
];

// Simplified Pacific Ring of Fire / major tsunamigenic subduction trenches
const SUBDUCTION_ARCS: [number, number][][] = [
  [
    [-55, -75], [-40, -75], [-20, -71], [-5, -81], [8, -84], [16, -98], [20, -106],
  ],
  [
    [50, -178], [54, -162], [59, -148], [56, -136], [48, -126], [40, -125],
  ],
  [
    [52, 160], [45, 151], [38, 144], [30, 142], [22, 144], [13, 145],
  ],
  [
    [24, 123], [14, 127], [4, 128], [-6, 104], [-10, 118], [-8, 130],
  ],
  [
    [-15, -173], [-22, -175], [-32, -178], [-42, 175], [-49, 165],
  ],
];

export function EsriTsunamiMap({
  events,
  selectedEvent,
  onSelectEvent,
  esriLayer,
  onChangeEsriLayer,
}: EsriTsunamiMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const baseLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const ringsLayerRef = useRef<L.LayerGroup | null>(null);
  const dartLayerRef = useRef<L.LayerGroup | null>(null);

  const [showPropagationRings, setShowPropagationRings] = useState(true);
  const [showDartAndTrenches, setShowDartAndTrenches] = useState(true);
  const [cursorCoords, setCursorCoords] = useState<{ lat: number; lon: number } | null>(null);

  // Initialize Leaflet Map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [10, 165],
      zoom: 2,
      minZoom: 2,
      maxZoom: 12,
      worldCopyJump: true,
      zoomControl: false,
    });

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    baseLayerGroupRef.current = L.layerGroup().addTo(map);
    dartLayerRef.current = L.layerGroup().addTo(map);
    ringsLayerRef.current = L.layerGroup().addTo(map);
    markersLayerRef.current = L.layerGroup().addTo(map);

    map.on('mousemove', (e: L.LeafletMouseEvent) => {
      const wrappedLng = ((((e.latlng.lng + 180) % 360) + 360) % 360) - 180;
      setCursorCoords({ lat: e.latlng.lat, lon: wrappedLng });
    });
    map.on('mouseout', () => setCursorCoords(null));

    mapRef.current = map;

    const observer = new ResizeObserver(() => {
      map.invalidateSize();
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update Esri Basemap Layer
  useEffect(() => {
    const group = baseLayerGroupRef.current;
    if (!group) return;
    group.clearLayers();

    const cfg = ESRI_BASEMAPS[esriLayer];
    L.tileLayer(cfg.url, {
      attribution: cfg.attribution,
      maxZoom: 16,
    }).addTo(group);

    if (cfg.refUrl) {
      L.tileLayer(cfg.refUrl, {
        maxZoom: 16,
        opacity: 0.9,
      }).addTo(group);
    }
  }, [esriLayer]);

  // Update DART Stations & Subduction Trenches Overlay
  useEffect(() => {
    const group = dartLayerRef.current;
    if (!group) return;
    group.clearLayers();
    if (!showDartAndTrenches) return;

    SUBDUCTION_ARCS.forEach((coords) => {
      L.polyline(coords, {
        color: '#0EA5E9',
        weight: 1.5,
        opacity: 0.45,
        dashArray: '4 6',
      }).addTo(group);
    });

    DART_STATIONS.forEach((station) => {
      const marker = L.circleMarker([station.lat, station.lon], {
        radius: 4,
        color: '#0284C7',
        weight: 1.5,
        fillColor: '#38BDF8',
        fillOpacity: 0.85,
      });
      marker.bindTooltip(`${station.name}`, { direction: 'top', opacity: 0.9 });
      marker.addTo(group);
    });
  }, [showDartAndTrenches]);

  // Update Event Markers
  useEffect(() => {
    const group = markersLayerRef.current;
    if (!group) return;
    group.clearLayers();

    // Render oldest/lowest severity first so critical alerts sit on top
    const ordered = [...events].sort(
      (a, b) => SEVERITY_META[a.severity].rank - SEVERITY_META[b.severity].rank
    );

    ordered.forEach((ev) => {
      const meta = SEVERITY_META[ev.severity];
      const isSelected = selectedEvent?.id === ev.id;
      const baseRadius = ev.magnitude ? Math.max(5, Math.min(13, (ev.magnitude - 4.2) * 2.7)) : 7;

      const marker = L.circleMarker([ev.latitude, ev.longitude], {
        radius: isSelected ? baseRadius + 4 : baseRadius,
        color: isSelected ? '#FFFFFF' : meta.hex,
        weight: isSelected ? 3 : 1.5,
        fillColor: meta.hex,
        fillOpacity: isSelected ? 0.95 : 0.72,
      });

      const magText = ev.magnitude !== null ? `M ${ev.magnitude.toFixed(1)}` : 'Boletín';
      marker.bindTooltip(
        `<div style="font-family: 'DM Sans', sans-serif; font-size: 12px;">
          <strong style="color:${meta.hex}">${meta.glyph} ${meta.shortLabel}</strong> · ${ev.agency}<br/>
          <span>${ev.title}</span><br/>
          <span style="font-family:'JetBrains Mono',monospace;font-size:11px;">${magText} · ${formatLocalDateTime(ev.issuedAt)}</span>
        </div>`,
        { direction: 'top', opacity: 0.96 }
      );

      marker.on('click', () => onSelectEvent(ev));
      marker.addTo(group);
    });
  }, [events, selectedEvent, onSelectEvent]);

  // Update Concentric Tsunami Propagation Rings & Fly To Selected Event
  useEffect(() => {
    const ringsGroup = ringsLayerRef.current;
    const map = mapRef.current;
    if (!ringsGroup || !map) return;

    ringsGroup.clearLayers();

    if (!selectedEvent) return;

    if (showPropagationRings) {
      const sev = SEVERITY_META[selectedEvent.severity];
      const radiiMeters = [500_000, 1_500_000, 3_000_000];
      radiiMeters.forEach((radius, i) => {
        L.circle([selectedEvent.latitude, selectedEvent.longitude], {
          radius,
          color: sev.hex,
          weight: i === 0 ? 1.8 : 1.2,
          opacity: 0.75 - i * 0.2,
          fillColor: sev.hex,
          fillOpacity: i === 0 ? 0.08 : 0.02,
          dashArray: i === 0 ? undefined : '6 6',
          interactive: false,
        }).addTo(ringsGroup);
      });
    }

    map.flyTo([selectedEvent.latitude, selectedEvent.longitude], Math.max(map.getZoom(), 4), {
      duration: 0.65,
    });
  }, [selectedEvent, showPropagationRings]);

  const handleRecenter = () => {
    if (!mapRef.current || !selectedEvent) return;
    mapRef.current.flyTo([selectedEvent.latitude, selectedEvent.longitude], 5, { duration: 0.5 });
  };

  return (
    <div className="relative w-full h-full min-h-[380px] overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-900">
      <div ref={containerRef} className="w-full h-full cursor-crosshair z-0" />

      {/* Top-Left Esri Layer Selector HUD */}
      <div className="absolute top-3 left-3 z-[400] flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 shadow-sm">
          <Layers className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
          <label htmlFor="esri-layer-select" className="sr-only">
            Capa Cartográfica Esri
          </label>
          <select
            id="esri-layer-select"
            value={esriLayer}
            onChange={(e) => onChangeEsriLayer(e.target.value as EsriLayerId)}
            className="bg-transparent text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none cursor-pointer"
          >
            {Object.entries(ESRI_BASEMAPS).map(([id, cfg]) => (
              <option key={id} value={id} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
                {cfg.label}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={() => setShowPropagationRings((v) => !v)}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            showPropagationRings
              ? 'bg-sky-600 text-white border-sky-600'
              : 'bg-white/95 dark:bg-slate-900/95 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Waves className="w-3.5 h-3.5" />
          <span>Anillos de Onda</span>
        </button>

        <button
          type="button"
          onClick={() => setShowDartAndTrenches((v) => !v)}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            showDartAndTrenches
              ? 'bg-sky-600 text-white border-sky-600'
              : 'bg-white/95 dark:bg-slate-900/95 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Radio className="w-3.5 h-3.5" />
          <span>Boyas DART y Fosas</span>
        </button>

        {selectedEvent && (
          <button
            type="button"
            onClick={handleRecenter}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-white/95 dark:bg-slate-900/95 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Crosshair className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
            <span>Centrar Epicentro</span>
          </button>
        )}
      </div>

      {/* Bottom-Left Coordinate & Legend Readout */}
      <div className="absolute bottom-3 left-3 z-[400] flex flex-wrap items-center gap-3 bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-[11px] font-mono tabular-nums text-slate-700 dark:text-slate-300">
        <span>
          {cursorCoords
            ? `CURSOR: ${formatCoordinates(cursorCoords.lat, cursorCoords.lon)}`
            : selectedEvent
            ? `EPICENTRO: ${formatCoordinates(selectedEvent.latitude, selectedEvent.longitude)}`
            : 'MAPA GLOBAL ESRI'}
        </span>
        <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">|</span>
        <span className="flex items-center gap-2.5">
          <span className="text-red-600 dark:text-red-400 font-semibold">▲ Alerta</span>
          <span className="text-orange-600 dark:text-orange-400 font-semibold">◆ Vigilancia</span>
          <span className="text-amber-600 dark:text-amber-400 font-semibold">● Aviso</span>
          <span className="text-sky-600 dark:text-sky-400 font-semibold">■ Boletín</span>
        </span>
      </div>
    </div>
  );
}
