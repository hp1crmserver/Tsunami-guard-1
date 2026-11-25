import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Monitor,
  Moon,
  RefreshCw,
  Sun,
  Volume2,
  VolumeX,
  X,
  AlertTriangle,
  MapPin,
  Waves,
} from 'lucide-react';
import {
  SEVERITY_META,
  type AgencyFeedStatus,
  type EsriLayerId,
  type NotificationSettings,
  type SeverityLevel,
  type ThemeMode,
  type TsunamiEvent,
  type TsunamiFeedResponse,
} from './types/tsunami';
import { playSeverityAlertSound } from './utils/audioAlert';
import { formatLocalDateTime, getLocalTimeZoneLabel } from './utils/formatters';
import { fetchDirectCorsFeeds } from './utils/clientFallbackFeeds';
import { MonitorView } from './components/MonitorView';
import { HistoryView } from './components/HistoryView';
import { CardGenerator45View } from './components/CardGenerator45View';
import { NotificationsView } from './components/NotificationsView';

type ActiveTab = 'monitor' | 'history' | 'card45' | 'notifications';

const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  audioEnabled: true,
  volume: 0.7,
  minAudioSeverity: 'advisory',
  visualBannerEnabled: true,
  visualFlashEnabled: true,
  browserPushEnabled: false,
  pollingIntervalSec: 60,
};

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('monitor');

  // Theme state: 'light' | 'dark' | 'system'
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('marealerta-theme');
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
    return 'system';
  });

  const [systemDark, setSystemDark] = useState<boolean>(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : true
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const isDark = themeMode === 'dark' || (themeMode === 'system' && systemDark);

  useEffect(() => {
    localStorage.setItem('marealerta-theme', themeMode);
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [themeMode, isDark]);

  // Notification settings
  const [notifSettings, setNotifSettings] = useState<NotificationSettings>(() => {
    try {
      const saved = localStorage.getItem('marealerta-notif');
      if (saved) return { ...DEFAULT_NOTIFICATION_SETTINGS, ...JSON.parse(saved) };
    } catch {
      // ignore
    }
    return DEFAULT_NOTIFICATION_SETTINGS;
  });

  useEffect(() => {
    localStorage.setItem('marealerta-notif', JSON.stringify(notifSettings));
  }, [notifSettings]);

  // Esri map layer (defaults cleanly based on polarity if user hasn't picked one)
  const [esriLayer, setEsriLayer] = useState<EsriLayerId>('ocean');

  // Data state
  const [events, setEvents] = useState<TsunamiEvent[]>([]);
  const [agencies, setAgencies] = useState<AgencyFeedStatus[]>([]);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<TsunamiEvent | null>(null);

  // Incoming visual/audio alert banner state
  const [alertBannerEvent, setAlertBannerEvent] = useState<TsunamiEvent | null>(null);
  const [flashTriggerKey, setFlashTriggerKey] = useState<number>(0);

  const seenEventIdsRef = useRef<Set<string>>(new Set());
  const initialLoadDoneRef = useRef<boolean>(false);

  const dispatchIncomingNotification = useCallback(
    (ev: TsunamiEvent) => {
      const evRank = SEVERITY_META[ev.severity].rank;
      const minRank = SEVERITY_META[notifSettings.minAudioSeverity].rank;

      if (notifSettings.audioEnabled && evRank >= minRank) {
        playSeverityAlertSound(ev.severity, notifSettings.volume);
      }

      if (notifSettings.visualBannerEnabled) {
        setAlertBannerEvent(ev);
      }

      if (notifSettings.visualFlashEnabled && ev.severity === 'warning') {
        setFlashTriggerKey((k) => k + 1);
      }

      if (
        notifSettings.browserPushEnabled &&
        typeof window !== 'undefined' &&
        'Notification' in window &&
        Notification.permission === 'granted'
      ) {
        new Notification(`${SEVERITY_META[ev.severity].label} · ${ev.agency}`, {
          body: `${ev.title}${ev.magnitude ? ` (M ${ev.magnitude.toFixed(1)})` : ''}`,
        });
      }
    },
    [notifSettings]
  );

  const fetchFeeds = useCallback(
    async (force = false) => {
      if (force) setRefreshing(true);
      try {
        let data: TsunamiFeedResponse;
        const res = await fetch(`api/tsunami-events${force ? '?force=1' : ''}`);
        const contentType = res.headers.get('content-type') || '';
        if (res.ok && contentType.includes('application/json')) {
          data = await res.json();
        } else {
          // Static hosting / GitHub Pages fallback using CORS-enabled public feeds
          data = await fetchDirectCorsFeeds();
        }

        setEvents((prev) => {
          // Keep any active simulated test alerts at the top during the session
          const testAlerts = prev.filter((e) => e.isTestAlert);
          return [...testAlerts, ...data.events];
        });
        setAgencies(data.agencies);
        setFetchedAt(data.fetchedAt);
        setError(null);

        if (!initialLoadDoneRef.current) {
          data.events.forEach((e) => seenEventIdsRef.current.add(e.id));
          initialLoadDoneRef.current = true;
          // If there is a real active Warning/Watch on initial load, surface banner softly
          const activeCritical = data.events.find(
            (e) => e.status === 'active' && (e.severity === 'warning' || e.severity === 'watch')
          );
          if (activeCritical) {
            setAlertBannerEvent(activeCritical);
          }
        } else {
          // Check for brand-new events arriving during live polling
          const newlyArrived = data.events.filter((e) => !seenEventIdsRef.current.has(e.id));
          newlyArrived.forEach((e) => seenEventIdsRef.current.add(e.id));
          if (newlyArrived.length > 0) {
            // Notify on highest severity new arrival
            const topNew = [...newlyArrived].sort(
              (a, b) => SEVERITY_META[b.severity].rank - SEVERITY_META[a.severity].rank
            )[0];
            dispatchIncomingNotification(topNew);
          }
        }
      } catch (err: any) {
        setError(err?.message || 'No se pudieron obtener los boletines internacionales');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [dispatchIncomingNotification]
  );

  useEffect(() => {
    fetchFeeds(false);
  }, [fetchFeeds]);

  useEffect(() => {
    if (!notifSettings.pollingIntervalSec || notifSettings.pollingIntervalSec <= 0) return;
    const timer = window.setInterval(() => {
      fetchFeeds(false);
    }, notifSettings.pollingIntervalSec * 1000);
    return () => window.clearInterval(timer);
  }, [notifSettings.pollingIntervalSec, fetchFeeds]);

  const handleTriggerTestAlert = (severity: SeverityLevel) => {
    const testEv: TsunamiEvent = {
      id: `simulacro-${Date.now()}`,
      title: 'SIMULACRO DE PRUEBA — Costa Sur de Chile / Pacífico Sudeste',
      agency: 'PTWC',
      agencyFullName: 'Pacific Tsunami Warning Center (Simulacro)',
      bulletinType: `${SEVERITY_META[severity].label} [Simulacro]`,
      severity,
      region: 'Sudamérica',
      location: 'Océano Pacífico frente a Biobío / Valparaíso (Simulacro)',
      latitude: -36.52,
      longitude: -73.85,
      depthKm: 18.0,
      magnitude: severity === 'warning' ? 8.1 : severity === 'watch' ? 7.4 : 6.8,
      magnitudeType: 'Mwp',
      issuedAt: new Date().toISOString(),
      tsunamiFlag: true,
      summary:
        'Evento de simulacro generado localmente para verificar alertas visuales, banner superior, destello perimetral y señal acústica Web Audio.',
      status: 'active',
      isTestAlert: true,
    };

    setEvents((prev) => [testEv, ...prev]);
    setSelectedEvent(testEv);
    dispatchIncomingNotification(testEv);
  };

  const activeAlertsCount = useMemo(
    () => events.filter((e) => e.status === 'active' || e.tsunamiFlag).length,
    [events]
  );

  const handleInspectOnMap = (ev: TsunamiEvent) => {
    setSelectedEvent(ev);
    setActiveTab('monitor');
  };

  const handleOpenCard45 = (ev: TsunamiEvent) => {
    setSelectedEvent(ev);
    setActiveTab('card45');
  };

  return (
    <div
      key={flashTriggerKey > 0 ? `flash-${flashTriggerKey}` : 'root'}
      className={`min-h-screen flex flex-col bg-slate-50 dark:bg-[#070B12] text-slate-900 dark:text-slate-100 ${
        flashTriggerKey > 0 ? 'animate-alert-flash' : ''
      }`}
    >
      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B111C] sticky top-0 z-50">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-8 bg-[#bcf0ff]">
          {/* Zone 1: Brand Wordmark with representative icon and version */}
          <a
            href="#monitor"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('monitor');
            }}
            className="inline-flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            <span className="inline-flex items-center justify-center w-7 h-7 bg-sky-700 text-white shrink-0">
              <Waves className="w-4 h-4" />
            </span>
            <span>Tsunami Guard</span>
            <span className="text-[11px] font-mono font-medium text-slate-700 ml-0.5">
              v1.0.0
            </span>
          </a>

          {/* Zone 2: 4 single-line Navigation Links */}
          <nav className="flex items-center gap-5 sm:gap-7 overflow-x-auto text-sm font-medium">
            {[
              { id: 'monitor', label: 'Monitor en Vivo' },
              { id: 'history', label: 'Historial' },
              { id: 'card45', label: 'Imagen 4:5' },
              { id: 'notifications', label: 'Notificaciones' },
            ].map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id as ActiveTab)}
                  className={`py-4 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'border-sky-600 text-sky-600 dark:border-sky-400 dark:text-sky-400'
                      : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: 1 Primary Action */}
          <div className="shrink-0">
            <button
              type="button"
              onClick={() => fetchFeeds(true)}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium bg-sky-600 text-white hover:bg-sky-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span>Actualizar</span>
            </button>
          </div>
        </div>
      </header>

      {/* Workspace Telemetry & Theme Utility Ribbon */}
      <div className="border-b border-slate-200 dark:border-slate-800 bg-slate-100/80 dark:bg-[#0D1422]">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-3 text-slate-600 dark:text-slate-300 font-mono tabular-nums">
            {notifSettings.pollingIntervalSec > 0 && (
              <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>Sondeo {notifSettings.pollingIntervalSec}s</span>
              </span>
            )}
            <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
            <span>
              Agencias activas: {agencies.filter((a) => a.ok).length}/{agencies.length || 7}
            </span>
            <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
            <span>Eventos con evaluación tsunami: {activeAlertsCount}</span>
            <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
            <span>Zona: {getLocalTimeZoneLabel()}</span>
            {fetchedAt && (
              <>
                <span aria-hidden="true" className="text-slate-300 dark:text-slate-700 hidden sm:inline">·</span>
                <span className="hidden sm:inline text-slate-500 dark:text-slate-400">
                  Última lectura: {formatLocalDateTime(fetchedAt)}
                </span>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Quick Sound Mute/Unmute */}
            <button
              type="button"
              onClick={() =>
                setNotifSettings((p) => ({ ...p, audioEnabled: !p.audioEnabled }))
              }
              title={notifSettings.audioEnabled ? 'Silenciar alertas auditivas' : 'Activar alertas auditivas'}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {notifSettings.audioEnabled ? (
                <Volume2 className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
              ) : (
                <VolumeX className="w-3.5 h-3.5 text-slate-400" />
              )}
              <span>{notifSettings.audioEnabled ? 'Audio activo' : 'Silenciado'}</span>
            </button>

            {/* Quick Test Alert */}
            <button
              type="button"
              onClick={() => handleTriggerTestAlert('warning')}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-red-300 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/50 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Simulacro Alerta</span>
            </button>

            {/* Theme Mode Selector: Claro / Oscuro / Sistema */}
            <div
              role="group"
              aria-label="Modo de color"
              className="inline-flex items-center border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-0.5"
            >
              {[
                { id: 'light', label: 'Claro', Icon: Sun },
                { id: 'dark', label: 'Oscuro', Icon: Moon },
                { id: 'system', label: 'Sistema', Icon: Monitor },
              ].map(({ id, label, Icon }) => {
                const active = themeMode === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setThemeMode(id as ThemeMode)}
                    className={`inline-flex items-center gap-1 px-2 py-1 text-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      active
                        ? 'bg-sky-600 text-white'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <Icon className="w-3 h-3" />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Incoming Visual Alert Notification Banner */}
      {alertBannerEvent && notifSettings.visualBannerEnabled && (
        <div
          role="alert"
          className="border-b border-red-500/40 bg-red-600 text-white"
        >
          <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <div className="text-xs sm:text-sm font-medium truncate">
                <span className="font-mono font-bold mr-2">
                  [{SEVERITY_META[alertBannerEvent.severity].shortLabel.toUpperCase()}]
                </span>
                <span>
                  {alertBannerEvent.agency} — {alertBannerEvent.title}
                  {alertBannerEvent.magnitude !== null
                    ? ` (M ${alertBannerEvent.magnitude.toFixed(1)})`
                    : ''}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  handleInspectOnMap(alertBannerEvent);
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-white text-red-700 hover:bg-red-50 cursor-pointer"
              >
                <MapPin className="w-3.5 h-3.5" />
                <span>Ver en Mapa</span>
              </button>
              <button
                type="button"
                onClick={() => setAlertBannerEvent(null)}
                aria-label="Cerrar notificación"
                className="p-1 hover:bg-red-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Container */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-4">
        {activeTab === 'monitor' && (
          <MonitorView
            events={events}
            selectedEvent={selectedEvent}
            onSelectEvent={setSelectedEvent}
            esriLayer={esriLayer}
            onChangeEsriLayer={setEsriLayer}
            isDark={isDark}
            loading={loading}
            error={error}
            onOpenCard45={handleOpenCard45}
          />
        )}

        {activeTab === 'history' && (
          <HistoryView
            events={events}
            loading={loading}
            isDark={isDark}
            onInspectOnMap={handleInspectOnMap}
            onOpenCard45={handleOpenCard45}
          />
        )}

        {activeTab === 'card45' && (
          <CardGenerator45View
            events={events}
            selectedEvent={selectedEvent}
            onSelectEvent={setSelectedEvent}
            defaultEsriLayer={esriLayer}
            isDark={isDark}
          />
        )}

        {activeTab === 'notifications' && (
          <NotificationsView
            settings={notifSettings}
            onUpdateSettings={setNotifSettings}
            agencies={agencies}
            onTriggerTestAlert={handleTriggerTestAlert}
          />
        )}
      </main>
    </div>
  );
}
