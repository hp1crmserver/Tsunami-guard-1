import { useEffect, useMemo, useState } from 'react';
import {
  FileImage,
  FileText,
  ExternalLink,
  Loader2,
  MapPin,
  Search,
  ChevronRight,
} from 'lucide-react';
import {
  SEVERITY_META,
  type AgencyCode,
  type EsriLayerId,
  type SeverityLevel,
  type TsunamiEvent,
} from '../types/tsunami';
import {
  estimateWaveTravelTimes,
  formatCoordinates,
  formatLocalDateTime,
  formatRelativeTimeEs,
  formatUtcDateTime,
} from '../utils/formatters';
import { EsriTsunamiMap } from './EsriTsunamiMap';
import { renderEventCard45 } from '../utils/canvasCard45';
import { exportSingleEventPdf } from '../utils/pdfReport';

interface MonitorViewProps {
  events: TsunamiEvent[];
  selectedEvent: TsunamiEvent | null;
  onSelectEvent: (ev: TsunamiEvent) => void;
  esriLayer: EsriLayerId;
  onChangeEsriLayer: (layer: EsriLayerId) => void;
  isDark: boolean;
  loading: boolean;
  error: string | null;
  onOpenCard45: (ev: TsunamiEvent) => void;
}

export function MonitorView({
  events,
  selectedEvent,
  onSelectEvent,
  esriLayer,
  onChangeEsriLayer,
  isDark,
  loading,
  error,
  onOpenCard45,
}: MonitorViewProps) {
  const [severityFilter, setSeverityFilter] = useState<SeverityLevel | 'ALL'>('ALL');
  const [agencyFilter, setAgencyFilter] = useState<AgencyCode | 'ALL'>('ALL');
  const [query, setQuery] = useState('');
  const [onlyTsunamiFlag, setOnlyTsunamiFlag] = useState(false);

  const [loadedBulletin, setLoadedBulletin] = useState<{ id: string; text: string } | null>(null);
  const [loadingBulletin, setLoadingBulletin] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  const filteredEvents = useMemo(() => {
    return events.filter((ev) => {
      if (severityFilter !== 'ALL' && ev.severity !== severityFilter) return false;
      if (agencyFilter !== 'ALL' && ev.agency !== agencyFilter) return false;
      if (onlyTsunamiFlag && !ev.tsunamiFlag) return false;
      if (query.trim()) {
        const q = query.toLowerCase();
        const hay = `${ev.title} ${ev.location} ${ev.region} ${ev.agency}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [events, severityFilter, agencyFilter, onlyTsunamiFlag, query]);

  useEffect(() => {
    if (!selectedEvent && filteredEvents.length > 0) {
      onSelectEvent(filteredEvents[0]);
    }
  }, [filteredEvents, selectedEvent, onSelectEvent]);

  const handleFetchBulletin = async (ev: TsunamiEvent) => {
    if (!ev.bulletinUrl) return;
    if (ev.bulletinText) {
      setLoadedBulletin({ id: ev.id, text: ev.bulletinText });
      return;
    }
    setLoadingBulletin(true);
    try {
      const res = await fetch(`api/bulletin-text?url=${encodeURIComponent(ev.bulletinUrl)}`);
      const data = await res.json();
      if (res.ok && data.text) {
        setLoadedBulletin({ id: ev.id, text: data.text });
      } else {
        setLoadedBulletin({
          id: ev.id,
          text: `No fue posible cargar el cuerpo completo desde el servidor remoto. Puede consultarlo directamente en la fuente oficial: ${ev.bulletinUrl}`,
        });
      }
    } catch {
      setLoadedBulletin({
        id: ev.id,
        text: `Error de red al obtener el boletín oficial. Enlace directo: ${ev.bulletinUrl}`,
      });
    } finally {
      setLoadingBulletin(false);
    }
  };

  const handleExportPdf = async () => {
    if (!selectedEvent) return;
    setExportingPdf(true);
    try {
      const offscreen = document.createElement('canvas');
      await renderEventCard45(offscreen, selectedEvent, {
        themeStyle: isDark ? 'ocean-dark' : 'editorial-light',
        esriLayer,
        showPropagationRings: true,
        showSummary: true,
      });
      const dataUrl = offscreen.toDataURL('image/png');
      const evWithText: TsunamiEvent = {
        ...selectedEvent,
        bulletinText:
          selectedEvent.bulletinText ||
          (loadedBulletin?.id === selectedEvent.id ? loadedBulletin.text : undefined),
      };
      exportSingleEventPdf(evWithText, dataUrl);
    } finally {
      setExportingPdf(false);
    }
  };

  const activeBulletinText =
    selectedEvent?.bulletinText ||
    (loadedBulletin && selectedEvent && loadedBulletin.id === selectedEvent.id
      ? loadedBulletin.text
      : null);

  return (
    <div className="flex flex-col lg:flex-row gap-4 min-h-[calc(100vh-148px)]">
      {/* Left Column: Live Bulletin & Event Stream */}
      <aside className="w-full lg:w-[370px] shrink-0 flex flex-col border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A]">
        <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Flujo Internacional de Boletines
            </h2>
            <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
              {filteredEvents.length} eventos
            </span>
          </div>

          {/* Search input */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filtrar región, país o agencia..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-sky-500"
            />
          </div>

          {/* Severity quick segmented buttons */}
          <div className="flex flex-wrap items-center gap-1">
            {(['ALL', 'warning', 'watch', 'advisory', 'information'] as const).map((lvl) => {
              const active = severityFilter === lvl;
              const label = lvl === 'ALL' ? 'Todos' : SEVERITY_META[lvl].shortLabel;
              return (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setSeverityFilter(lvl)}
                  className={`px-2 py-1 text-[11px] font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'bg-sky-600 text-white border-sky-600'
                      : 'bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between gap-2 pt-0.5">
            <select
              aria-label="Filtrar por agencia"
              value={agencyFilter}
              onChange={(e) => setAgencyFilter(e.target.value as AgencyCode | 'ALL')}
              className="text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-2 py-1 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-sky-500"
            >
              <option value="ALL">Todas las Agencias</option>
              <option value="PTWC">PTWC (Pacífico NOAA)</option>
              <option value="NTWC">NTWC (Norteamérica NOAA)</option>
              <option value="NWS">NWS CAP Alerts</option>
              <option value="JMA">JMA (Japón)</option>
              <option value="USGS">USGS NEIC</option>
              <option value="EMSC">EMSC (Europa/Med)</option>
              <option value="GeoNet">GeoNet (Nueva Zelanda)</option>
            </select>

            <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={onlyTsunamiFlag}
                onChange={(e) => setOnlyTsunamiFlag(e.target.checked)}
                className="accent-sky-600"
              />
              <span>Solo alerta tsunami</span>
            </label>
          </div>
        </div>

        {/* Event list */}
        <div className="flex-1 overflow-y-auto max-h-[640px] lg:max-h-[760px] divide-y divide-slate-200 dark:divide-slate-800">
          {loading && events.length === 0 ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="space-y-2 animate-pulse">
                  <div className="h-3 w-28 bg-slate-200 dark:bg-slate-800" />
                  <div className="h-4 w-3/4 bg-slate-200 dark:bg-slate-800" />
                  <div className="h-3 w-1/2 bg-slate-200 dark:bg-slate-800" />
                </div>
              ))}
            </div>
          ) : error && events.length === 0 ? (
            <div className="p-6 text-xs text-red-600 dark:text-red-400">
              {error}
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
              No se encontraron boletines con los filtros actuales.
            </div>
          ) : (
            filteredEvents.map((ev) => {
              const sev = SEVERITY_META[ev.severity];
              const isSelected = selectedEvent?.id === ev.id;
              return (
                <button
                  key={ev.id}
                  type="button"
                  onClick={() => onSelectEvent(ev)}
                  className={`w-full text-left px-3.5 py-3 transition-colors cursor-pointer block ${
                    isSelected
                      ? 'bg-sky-50/90 dark:bg-sky-950/35'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className={`font-semibold ${sev.textClass}`}>
                      {sev.glyph} {sev.shortLabel}
                      {ev.isTestAlert ? ' (SIMULACRO)' : ''}
                    </span>
                    <span className="font-mono tabular-nums text-[11px] text-slate-500 dark:text-slate-400">
                      {formatRelativeTimeEs(ev.issuedAt)}
                    </span>
                  </div>

                  <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100 line-clamp-1">
                    {ev.title}
                  </p>

                  <div className="mt-1 flex items-center justify-between gap-2 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    <span className="truncate">
                      {ev.agency} · {ev.region}
                      {ev.magnitude !== null ? ` · M ${ev.magnitude.toFixed(1)}` : ''}
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* Right Stage: Esri Map + Event Telemetry Inspector */}
      <section className="flex-1 flex flex-col gap-4 min-w-0">
        <div className="h-[420px] lg:h-[470px]">
          <EsriTsunamiMap
            events={filteredEvents}
            selectedEvent={selectedEvent}
            onSelectEvent={onSelectEvent}
            esriLayer={esriLayer}
            onChangeEsriLayer={onChangeEsriLayer}
            isDark={isDark}
          />
        </div>

        {/* Selected Event Inspector */}
        {selectedEvent ? (
          <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] p-4 sm:p-5 space-y-4">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
              <div className="space-y-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className={`font-semibold ${SEVERITY_META[selectedEvent.severity].textClass}`}>
                    {SEVERITY_META[selectedEvent.severity].glyph}{' '}
                    {SEVERITY_META[selectedEvent.severity].label}
                  </span>
                  <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
                  <span className="font-mono text-slate-600 dark:text-slate-300">
                    {selectedEvent.agencyFullName}
                  </span>
                  <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
                  <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    {formatLocalDateTime(selectedEvent.issuedAt)}
                  </span>
                </div>
                <h2 className="text-lg sm:text-xl font-semibold text-slate-900 dark:text-slate-100 text-balance">
                  {selectedEvent.title}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Referencia UTC: {formatUtcDateTime(selectedEvent.issuedAt)} · Región:{' '}
                  {selectedEvent.region}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => onOpenCard45(selectedEvent)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-sky-600 text-white hover:bg-sky-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <FileImage className="w-3.5 h-3.5" />
                  <span>Generar Imagen 4:5</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportPdf}
                  disabled={exportingPdf}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                >
                  {exportingPdf ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <FileText className="w-3.5 h-3.5" />
                  )}
                  <span>Exportar PDF</span>
                </button>
              </div>
            </div>

            {/* 4-column tabular telemetry strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
              <div>
                <div className="text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Magnitud
                </div>
                <div className="mt-0.5 text-xl font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                  {selectedEvent.magnitude !== null ? selectedEvent.magnitude.toFixed(1) : 'N/D'}
                  {selectedEvent.magnitudeType && (
                    <span className="text-xs font-normal text-slate-500 dark:text-slate-400 ml-1">
                      {selectedEvent.magnitudeType}
                    </span>
                  )}
                </div>
              </div>

              <div>
                <div className="text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Profundidad Focal
                </div>
                <div className="mt-0.5 text-xl font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                  {selectedEvent.depthKm !== null ? selectedEvent.depthKm.toFixed(1) : '—'}
                  <span className="text-xs font-normal text-slate-500 dark:text-slate-400 ml-1">
                    km
                  </span>
                </div>
              </div>

              <div>
                <div className="text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Epicentro
                </div>
                <div className="mt-1 text-sm font-mono font-medium tabular-nums text-slate-900 dark:text-slate-100 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
                  <span>{formatCoordinates(selectedEvent.latitude, selectedEvent.longitude)}</span>
                </div>
              </div>

              <div>
                <div className="text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Propagación Est. (1,500 km)
                </div>
                <div className="mt-1 text-sm font-mono font-medium tabular-nums text-slate-900 dark:text-slate-100">
                  {estimateWaveTravelTimes(selectedEvent)[1].etaHours} en cuenca profunda
                </div>
              </div>
            </div>

            {/* Summary & Official Agency Bulletin */}
            <div className="space-y-3">
              <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                {selectedEvent.summary}
              </p>

              <div className="flex flex-wrap items-center gap-3">
                {selectedEvent.bulletinUrl && (
                  <>
                    {(selectedEvent.bulletinUrl.startsWith('https://www.tsunami.gov/') ||
                      selectedEvent.bulletinUrl.startsWith('https://www.jma.go.jp/') ||
                      selectedEvent.bulletinUrl.startsWith('https://api.weather.gov/')) &&
                      !activeBulletinText && (
                        <button
                          type="button"
                          onClick={() => handleFetchBulletin(selectedEvent)}
                          disabled={loadingBulletin}
                          className="text-xs font-medium text-sky-600 dark:text-sky-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
                        >
                          {loadingBulletin && <Loader2 className="w-3 h-3 animate-spin" />}
                          <span>Cargar texto íntegro del boletín oficial</span>
                        </button>
                      )}

                    <a
                      href={selectedEvent.bulletinUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 inline-flex items-center gap-1"
                    >
                      <span>Ver documento en agencia origen</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </>
                )}
              </div>

              {activeBulletinText && (
                <pre className="mt-2 p-3 text-xs font-mono leading-relaxed bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-300 overflow-x-auto max-h-56 whitespace-pre-wrap">
                  {activeBulletinText}
                </pre>
              )}
            </div>
          </div>
        ) : (
          <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            Seleccione un evento en la lista o en el mapa Esri para inspeccionar su telemetría y boletín oficial.
          </div>
        )}
      </section>
    </div>
  );
}
