import { useEffect, useRef, useState } from 'react';
import { Download, FileText, Loader2, RefreshCw } from 'lucide-react';
import {
  SEVERITY_META,
  type EsriLayerId,
  type TsunamiEvent,
} from '../types/tsunami';
import {
  renderEventCard45,
  type CardThemeStyle,
} from '../utils/canvasCard45';
import { formatLocalDateTime } from '../utils/formatters';
import { exportSingleEventPdf } from '../utils/pdfReport';

interface CardGenerator45ViewProps {
  events: TsunamiEvent[];
  selectedEvent: TsunamiEvent | null;
  onSelectEvent: (ev: TsunamiEvent) => void;
  defaultEsriLayer: EsriLayerId;
  isDark: boolean;
}

export function CardGenerator45View({
  events,
  selectedEvent,
  onSelectEvent,
  defaultEsriLayer,
  isDark,
}: CardGenerator45ViewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [themeStyle, setThemeStyle] = useState<CardThemeStyle>(
    isDark ? 'ocean-dark' : 'editorial-light'
  );
  const [esriLayer, setEsriLayer] = useState<EsriLayerId>(defaultEsriLayer);
  const [showPropagationRings, setShowPropagationRings] = useState(true);
  const [showSummary, setShowSummary] = useState(true);
  const [customNote, setCustomNote] = useState('');
  const [rendering, setRendering] = useState(false);

  const activeEvent = selectedEvent || events[0] || null;

  const drawPreview = async () => {
    if (!canvasRef.current || !activeEvent) return;
    setRendering(true);
    try {
      await renderEventCard45(canvasRef.current, activeEvent, {
        themeStyle,
        esriLayer,
        showPropagationRings,
        showSummary,
        customNote,
      });
    } finally {
      setRendering(false);
    }
  };

  useEffect(() => {
    drawPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEvent?.id, themeStyle, esriLayer, showPropagationRings, showSummary, customNote]);

  const handleDownload = (format: 'png' | 'jpeg') => {
    if (!canvasRef.current || !activeEvent) return;
    const mime = format === 'png' ? 'image/png' : 'image/jpeg';
    const dataUrl = canvasRef.current.toDataURL(mime, 0.94);
    const link = document.createElement('a');
    link.download = `TsunamiGuard_4x5_${activeEvent.agency}_${activeEvent.id.slice(0, 14)}.${format === 'png' ? 'png' : 'jpg'}`;
    link.href = dataUrl;
    link.click();
  };

  const handleExportPdfWithCard = () => {
    if (!canvasRef.current || !activeEvent) return;
    const dataUrl = canvasRef.current.toDataURL('image/png');
    exportSingleEventPdf(activeEvent, dataUrl);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left Controls Panel */}
      <div className="lg:col-span-5 border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] p-5 space-y-5">
        <div className="border-b border-slate-200 dark:border-slate-800 pb-3">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Generador de Boletín Gráfico (Ratio 4:5)
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Renderiza una lámina de 1080 × 1350 px con mapa Esri centrado, telemetría exacta y clasificación oficial para difusión.
          </p>
        </div>

        {/* Event selector */}
        <div>
          <label
            htmlFor="card45-event-select"
            className="block text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5"
          >
            Evento Seleccionado
          </label>
          <select
            id="card45-event-select"
            value={activeEvent?.id || ''}
            onChange={(e) => {
              const found = events.find((ev) => ev.id === e.target.value);
              if (found) onSelectEvent(found);
            }}
            className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-sky-500"
          >
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                [{SEVERITY_META[ev.severity].shortLabel}] {ev.agency} · {ev.title} ({formatLocalDateTime(ev.issuedAt, false)})
              </option>
            ))}
          </select>
        </div>

        {/* Visual Theme */}
        <div>
          <span className="block text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
            Estilo Visual de la Lámina
          </span>
          <div className="grid grid-cols-3 gap-1.5">
            {[
              { id: 'ocean-dark', label: 'Oscuro Oceánico' },
              { id: 'editorial-light', label: 'Claro Editorial' },
              { id: 'high-alert', label: 'Alerta Máxima' },
            ].map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setThemeStyle(opt.id as CardThemeStyle)}
                className={`px-2.5 py-2 text-xs font-medium border transition-colors cursor-pointer ${
                  themeStyle === opt.id
                    ? 'bg-sky-600 text-white border-sky-600'
                    : 'bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Esri Layer */}
        <div>
          <label
            htmlFor="card45-esri-layer"
            className="block text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5"
          >
            Capa Cartográfica Esri en la Imagen
          </label>
          <select
            id="card45-esri-layer"
            value={esriLayer}
            onChange={(e) => setEsriLayer(e.target.value as EsriLayerId)}
            className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-sky-500"
          >
            <option value="ocean">Esri Océano (Batimetría)</option>
            <option value="imagery">Esri Satélite (Imagery)</option>
            <option value="dark-gray">Esri Gris Oscuro</option>
            <option value="light-gray">Esri Gris Claro</option>
            <option value="topo">Esri Topográfico</option>
            <option value="natgeo">Esri National Geographic</option>
          </select>
        </div>

        {/* Toggles */}
        <div className="space-y-2 pt-1">
          <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={showPropagationRings}
              onChange={(e) => setShowPropagationRings(e.target.checked)}
              className="accent-sky-600"
            />
            <span>Dibujar anillos concéntricos de propagación</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={showSummary}
              onChange={(e) => setShowSummary(e.target.checked)}
              className="accent-sky-600"
            />
            <span>Incluir bloque de resumen del boletín</span>
          </label>
        </div>

        {/* Custom Note Override */}
        <div>
          <label
            htmlFor="card45-note"
            className="block text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5"
          >
            Nota Editorial / Instrucción Costera (Opcional)
          </label>
          <textarea
            id="card45-note"
            rows={3}
            value={customNote}
            onChange={(e) => setCustomNote(e.target.value)}
            placeholder="Dejar vacío para utilizar el resumen oficial de la agencia emisora..."
            className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-sky-500"
          />
        </div>

        {/* Export Actions */}
        <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleDownload('png')}
              disabled={!activeEvent || rendering}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold bg-sky-600 text-white hover:bg-sky-700 transition-colors cursor-pointer disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Descargar PNG (4:5)</span>
            </button>
            <button
              type="button"
              onClick={() => handleDownload('jpeg')}
              disabled={!activeEvent || rendering}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Descargar JPG (4:5)</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleExportPdfWithCard}
            disabled={!activeEvent || rendering}
            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Exportar Reporte Técnico PDF (con lámina 4:5 incrustada)</span>
          </button>
        </div>
      </div>

      {/* Right Live 4:5 Canvas Preview */}
      <div className="lg:col-span-7 border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] p-5 flex flex-col items-center">
        <div className="w-full flex items-center justify-between mb-3">
          <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
            PREVISUALIZACIÓN EN VIVO · 1080 × 1350 PX (PROPORCIÓN 4:5)
          </span>
          <button
            type="button"
            onClick={drawPreview}
            disabled={rendering}
            className="inline-flex items-center gap-1 text-xs font-medium text-sky-600 dark:text-sky-400 hover:underline cursor-pointer"
          >
            {rendering ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            <span>Re-renderizar</span>
          </button>
        </div>

        <div className="w-full max-w-[460px] aspect-[4/5] border border-slate-300 dark:border-slate-700 bg-slate-950 overflow-hidden">
          <canvas
            ref={canvasRef}
            className="w-full h-full object-contain block"
          />
        </div>
      </div>
    </div>
  );
}
