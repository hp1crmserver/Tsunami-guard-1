import { useMemo, useState } from 'react';
import {
  ArrowUpDown,
  FileImage,
  FileText,
  FilterX,
  MapPin,
  Search,
} from 'lucide-react';
import {
  OCEAN_REGIONS,
  SEVERITY_META,
  type AgencyCode,
  type HistoryFilters,
  type OceanRegion,
  type SeverityLevel,
  type TsunamiEvent,
} from '../types/tsunami';
import {
  formatCoordinates,
  formatLocalDateInput,
  formatLocalDateTime,
  getLocalTimeZoneShort,
} from '../utils/formatters';
import { exportHistoryPdf, exportSingleEventPdf } from '../utils/pdfReport';
import { exportHistorySummaryPng } from '../utils/historyImageExport';

interface HistoryViewProps {
  events: TsunamiEvent[];
  loading: boolean;
  isDark: boolean;
  onInspectOnMap: (ev: TsunamiEvent) => void;
  onOpenCard45: (ev: TsunamiEvent) => void;
}

type SortKey = 'issuedAt' | 'severity' | 'magnitude' | 'agency';

export function HistoryView({
  events,
  loading,
  isDark,
  onInspectOnMap,
  onOpenCard45,
}: HistoryViewProps) {
  const [filters, setFilters] = useState<HistoryFilters>({
    search: '',
    dateFrom: '',
    dateTo: '',
    region: 'ALL',
    severities: ['warning', 'watch', 'advisory', 'information'],
    agency: 'ALL',
  });

  const [sortKey, setSortKey] = useState<SortKey>('issuedAt');
  const [sortAsc, setSortAsc] = useState(false);

  const toggleSeverity = (sev: SeverityLevel) => {
    setFilters((prev) => {
      const exists = prev.severities.includes(sev);
      if (exists && prev.severities.length === 1) return prev; // Keep at least 1 active
      return {
        ...prev,
        severities: exists
          ? prev.severities.filter((s) => s !== sev)
          : [...prev.severities, sev],
      };
    });
  };

  const applyDatePreset = (days: number | null) => {
    if (days === null) {
      setFilters((prev) => ({ ...prev, dateFrom: '', dateTo: '' }));
      return;
    }
    const now = new Date();
    const past = new Date(now.getTime() - days * 86_400_000);
    setFilters((prev) => ({
      ...prev,
      dateFrom: formatLocalDateInput(past),
      dateTo: formatLocalDateInput(now),
    }));
  };

  const resetFilters = () => {
    setFilters({
      search: '',
      dateFrom: '',
      dateTo: '',
      region: 'ALL',
      severities: ['warning', 'watch', 'advisory', 'information'],
      agency: 'ALL',
    });
  };

  const filteredEvents = useMemo(() => {
    const fromMs = filters.dateFrom ? new Date(`${filters.dateFrom}T00:00:00`).getTime() : null;
    const toMs = filters.dateTo ? new Date(`${filters.dateTo}T23:59:59`).getTime() : null;
    const q = filters.search.trim().toLowerCase();

    const list = events.filter((ev) => {
      if (!filters.severities.includes(ev.severity)) return false;
      if (filters.region !== 'ALL' && ev.region !== filters.region) return false;
      if (filters.agency !== 'ALL' && ev.agency !== filters.agency) return false;

      const t = new Date(ev.issuedAt).getTime();
      if (fromMs !== null && t < fromMs) return false;
      if (toMs !== null && t > toMs) return false;

      if (q) {
        const hay = `${ev.id} ${ev.title} ${ev.location} ${ev.region} ${ev.agency} ${ev.summary}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    list.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'issuedAt') {
        cmp = new Date(a.issuedAt).getTime() - new Date(b.issuedAt).getTime();
      } else if (sortKey === 'severity') {
        cmp = SEVERITY_META[a.severity].rank - SEVERITY_META[b.severity].rank;
      } else if (sortKey === 'magnitude') {
        cmp = (a.magnitude ?? -1) - (b.magnitude ?? -1);
      } else if (sortKey === 'agency') {
        cmp = a.agency.localeCompare(b.agency);
      }
      return sortAsc ? cmp : -cmp;
    });

    return list;
  }, [events, filters, sortKey, sortAsc]);

  const counts = useMemo(() => {
    return {
      warning: filteredEvents.filter((e) => e.severity === 'warning').length,
      watch: filteredEvents.filter((e) => e.severity === 'watch').length,
      advisory: filteredEvents.filter((e) => e.severity === 'advisory').length,
      information: filteredEvents.filter((e) => e.severity === 'information').length,
    };
  }, [filteredEvents]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Filter Toolbar */}
      <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] p-4 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Historial de Alertas, Avisos y Boletines
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Registro consolidado de boletines emitidos y eventos sísmicos oceánicos con evaluación de riesgo de tsunami.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => exportHistoryPdf(filteredEvents, filters)}
              disabled={filteredEvents.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-sky-600 text-white hover:bg-sky-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Exportar Reporte PDF</span>
            </button>
            <button
              type="button"
              onClick={() => exportHistorySummaryPng(filteredEvents, filters, isDark)}
              disabled={filteredEvents.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
            >
              <FileImage className="w-3.5 h-3.5" />
              <span>Exportar Imagen PNG</span>
            </button>
          </div>
        </div>

        {/* Filter Controls Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
          {/* Text Search */}
          <div>
            <label className="block text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
              Búsqueda
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={filters.search}
                onChange={(e) => setFilters((p) => ({ ...p, search: e.target.value }))}
                placeholder="Lugar, ID o descripción..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-sky-500"
              />
            </div>
          </div>

          {/* Date Range */}
          <div>
            <label className="block text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
              Rango de Fechas ({getLocalTimeZoneShort()})
            </label>
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                aria-label="Fecha desde"
                value={filters.dateFrom}
                onChange={(e) => setFilters((p) => ({ ...p, dateFrom: e.target.value }))}
                className="w-full px-2 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-sky-500"
              />
              <span className="text-slate-400 text-xs">–</span>
              <input
                type="date"
                aria-label="Fecha hasta"
                value={filters.dateTo}
                onChange={(e) => setFilters((p) => ({ ...p, dateTo: e.target.value }))}
                className="w-full px-2 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-sky-500"
              />
            </div>
          </div>

          {/* Region */}
          <div>
            <label
              htmlFor="history-region"
              className="block text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1"
            >
              Región Oceánica
            </label>
            <select
              id="history-region"
              value={filters.region}
              onChange={(e) =>
                setFilters((p) => ({ ...p, region: e.target.value as OceanRegion | 'ALL' }))
              }
              className="w-full px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-sky-500"
            >
              <option value="ALL">Todas las Regiones</option>
              {OCEAN_REGIONS.map((reg) => (
                <option key={reg} value={reg}>
                  {reg}
                </option>
              ))}
            </select>
          </div>

          {/* Agency */}
          <div>
            <label
              htmlFor="history-agency"
              className="block text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1"
            >
              Agencia Internacional
            </label>
            <select
              id="history-agency"
              value={filters.agency}
              onChange={(e) =>
                setFilters((p) => ({ ...p, agency: e.target.value as AgencyCode | 'ALL' }))
              }
              className="w-full px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-sky-500"
            >
              <option value="ALL">Todas las Agencias</option>
              <option value="PTWC">PTWC (Pacific Tsunami Warning Center)</option>
              <option value="NTWC">NTWC (National Tsunami Warning Center)</option>
              <option value="NWS">NWS (CAP Alerts)</option>
              <option value="JMA">JMA (Japan Meteorological Agency)</option>
              <option value="USGS">USGS (NEIC Global)</option>
              <option value="EMSC">EMSC (Euro-Mediterráneo)</option>
              <option value="GeoNet">GeoNet (Nueva Zelanda)</option>
            </select>
          </div>
        </div>

        {/* Severity Multi-Toggle & Date Presets */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 mr-1">
              Severidad:
            </span>
            {(['warning', 'watch', 'advisory', 'information'] as SeverityLevel[]).map((sev) => {
              const meta = SEVERITY_META[sev];
              const active = filters.severities.includes(sev);
              return (
                <button
                  key={sev}
                  type="button"
                  onClick={() => toggleSeverity(sev)}
                  className={`px-2.5 py-1 text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? `${meta.bgClass} ${meta.textClass} ${meta.borderClass}`
                      : 'bg-slate-50 dark:bg-slate-900 text-slate-400 border-slate-200 dark:border-slate-800 hover:text-slate-600 dark:hover:text-slate-300'
                  }`}
                >
                  {meta.glyph} {meta.shortLabel}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 mr-1">
              Rápido:
            </span>
            {[
              { label: '24 h', days: 1 },
              { label: '7 días', days: 7 },
              { label: '30 días', days: 30 },
              { label: '1 año', days: 365 },
              { label: 'Todo', days: null },
            ].map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => applyDatePreset(p.days)}
                className="px-2 py-1 text-xs border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
              >
                {p.label}
              </button>
            ))}

            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 cursor-pointer"
            >
              <FilterX className="w-3.5 h-3.5" />
              <span>Limpiar</span>
            </button>
          </div>
        </div>
      </div>

      {/* Summary Counts Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-slate-800">
        <div className="px-4 py-3">
          <div className="text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Total Filtrados
          </div>
          <div className="text-2xl font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
            {filteredEvents.length}
          </div>
        </div>
        {(['warning', 'watch', 'advisory', 'information'] as SeverityLevel[]).map((s) => (
          <div key={s} className="px-4 py-3">
            <div className={`text-[11px] font-mono uppercase tracking-wider ${SEVERITY_META[s].textClass}`}>
              {SEVERITY_META[s].glyph} {SEVERITY_META[s].shortLabel}
            </div>
            <div className="text-2xl font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {counts[s]}
            </div>
          </div>
        ))}
      </div>

      {/* High-Density Data Table */}
      <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <th className="py-2.5 px-3.5 whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => handleSort('issuedAt')}
                  className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
                >
                  <span>Fecha / Hora ({getLocalTimeZoneShort()})</span>
                  <ArrowUpDown className="w-3 h-3" />
                </button>
              </th>
              <th className="py-2.5 px-3.5 whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => handleSort('severity')}
                  className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
                >
                  <span>Nivel de Riesgo</span>
                  <ArrowUpDown className="w-3 h-3" />
                </button>
              </th>
              <th className="py-2.5 px-3.5 whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => handleSort('agency')}
                  className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
                >
                  <span>Agencia</span>
                  <ArrowUpDown className="w-3 h-3" />
                </button>
              </th>
              <th className="py-2.5 px-3.5 text-right whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => handleSort('magnitude')}
                  className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
                >
                  <span>Mag.</span>
                  <ArrowUpDown className="w-3 h-3" />
                </button>
              </th>
              <th className="py-2.5 px-3.5 text-right whitespace-nowrap">Prof.</th>
              <th className="py-2.5 px-3.5 whitespace-nowrap">Región</th>
              <th className="py-2.5 px-3.5">Ubicación / Evento</th>
              <th className="py-2.5 px-3.5 whitespace-nowrap">Coordenadas</th>
              <th className="py-2.5 px-3.5 text-right whitespace-nowrap">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
            {loading && events.length === 0 ? (
              Array.from({ length: 8 }).map((_, idx) => (
                <tr key={idx} className="animate-pulse">
                  <td colSpan={9} className="py-3 px-3.5">
                    <div className="h-4 bg-slate-200 dark:bg-slate-800 w-full" />
                  </td>
                </tr>
              ))
            ) : filteredEvents.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-10 px-4 text-center text-slate-500 dark:text-slate-400">
                  No hay eventos registrados que coincidan con los filtros seleccionados.
                </td>
              </tr>
            ) : (
              filteredEvents.map((ev) => {
                const sev = SEVERITY_META[ev.severity];
                return (
                  <tr
                    key={ev.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-2.5 px-3.5 font-mono tabular-nums text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      {formatLocalDateTime(ev.issuedAt, false)}
                    </td>
                    <td className={`py-2.5 px-3.5 font-semibold whitespace-nowrap ${sev.textClass}`}>
                      {sev.glyph} {sev.shortLabel}
                    </td>
                    <td className="py-2.5 px-3.5 font-mono text-slate-800 dark:text-slate-200 whitespace-nowrap">
                      {ev.agency}
                    </td>
                    <td className="py-2.5 px-3.5 font-mono tabular-nums text-right font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                      {ev.magnitude !== null ? ev.magnitude.toFixed(1) : '—'}
                    </td>
                    <td className="py-2.5 px-3.5 font-mono tabular-nums text-right text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {ev.depthKm !== null ? `${ev.depthKm.toFixed(0)} km` : '—'}
                    </td>
                    <td className="py-2.5 px-3.5 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {ev.region}
                    </td>
                    <td className="py-2.5 px-3.5 text-slate-900 dark:text-slate-100 max-w-[260px] truncate">
                      {ev.title}
                    </td>
                    <td className="py-2.5 px-3.5 font-mono tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {formatCoordinates(ev.latitude, ev.longitude)}
                    </td>
                    <td className="py-2.5 px-3.5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onInspectOnMap(ev)}
                          title="Ver en Mapa Esri"
                          className="p-1.5 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer"
                        >
                          <MapPin className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenCard45(ev)}
                          title="Generar Imagen 4:5"
                          className="p-1.5 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-sky-600 dark:text-sky-400 cursor-pointer"
                        >
                          <FileImage className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => exportSingleEventPdf(ev)}
                          title="Exportar PDF del Evento"
                          className="p-1.5 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer"
                        >
                          <FileText className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
