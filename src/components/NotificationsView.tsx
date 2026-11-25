import { Bell, CheckCircle2, Play, Radio, Volume2, VolumeX, AlertTriangle } from 'lucide-react';
import {
  SEVERITY_META,
  type AgencyFeedStatus,
  type NotificationSettings,
  type SeverityLevel,
} from '../types/tsunami';
import { playSeverityAlertSound } from '../utils/audioAlert';

interface NotificationsViewProps {
  settings: NotificationSettings;
  onUpdateSettings: (next: NotificationSettings) => void;
  agencies: AgencyFeedStatus[];
  onTriggerTestAlert: (severity: SeverityLevel) => void;
}

export function NotificationsView({
  settings,
  onUpdateSettings,
  agencies,
  onTriggerTestAlert,
}: NotificationsViewProps) {
  const browserSupported = typeof window !== 'undefined' && 'Notification' in window;
  const permission = browserSupported ? Notification.permission : 'denied';

  const handleToggleBrowserPush = async () => {
    if (!browserSupported) return;
    if (!settings.browserPushEnabled && Notification.permission !== 'granted') {
      const result = await Notification.requestPermission();
      if (result === 'granted') {
        onUpdateSettings({ ...settings, browserPushEnabled: true });
      }
    } else {
      onUpdateSettings({ ...settings, browserPushEnabled: !settings.browserPushEnabled });
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Audio & Visual Notification Controls */}
      <div className="lg:col-span-7 border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] p-5 space-y-6">
        <div className="border-b border-slate-200 dark:border-slate-800 pb-3">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Notificaciones Visuales y Auditivas
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Configura las señales acústicas sintetizadas y alertas visuales ante la llegada de nuevos boletines internacionales.
          </p>
        </div>

        {/* Auditory Settings */}
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              {settings.audioEnabled ? (
                <Volume2 className="w-4 h-4 text-sky-600 dark:text-sky-400" />
              ) : (
                <VolumeX className="w-4 h-4 text-slate-400" />
              )}
              <div>
                <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  Alertas Auditivas (Web Audio)
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Tonos marítimos diferenciados según nivel de riesgo del boletín.
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                onUpdateSettings({ ...settings, audioEnabled: !settings.audioEnabled })
              }
              className={`px-3 py-1.5 text-xs font-medium border transition-colors cursor-pointer ${
                settings.audioEnabled
                  ? 'bg-sky-600 text-white border-sky-600'
                  : 'bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
              }`}
            >
              {settings.audioEnabled ? 'Activado' : 'Silenciado'}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <div>
              <label
                htmlFor="audio-volume"
                className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300 mb-1.5"
              >
                <span>Volumen de Alarma</span>
                <span className="font-mono tabular-nums">{Math.round(settings.volume * 100)}%</span>
              </label>
              <input
                id="audio-volume"
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                value={settings.volume}
                onChange={(e) =>
                  onUpdateSettings({ ...settings, volume: parseFloat(e.target.value) })
                }
                className="w-full accent-sky-600"
              />
            </div>

            <div>
              <label
                htmlFor="min-audio-severity"
                className="block text-xs text-slate-600 dark:text-slate-300 mb-1.5"
              >
                Umbral Mínimo para Sonido
              </label>
              <select
                id="min-audio-severity"
                value={settings.minAudioSeverity}
                onChange={(e) =>
                  onUpdateSettings({
                    ...settings,
                    minAudioSeverity: e.target.value as SeverityLevel,
                  })
                }
                className="w-full px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
              >
                <option value="information">Todos (desde Boletín Informativo)</option>
                <option value="advisory">Aviso o superior</option>
                <option value="watch">Vigilancia o superior</option>
                <option value="warning">Solo Alerta Roja (Warning)</option>
              </select>
            </div>
          </div>

          {/* Sound Calibration Test Buttons */}
          <div className="pt-2">
            <div className="text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
              Probar Señal Acústica por Severidad
            </div>
            <div className="flex flex-wrap gap-2">
              {(['warning', 'watch', 'advisory', 'information'] as SeverityLevel[]).map((lvl) => {
                const meta = SEVERITY_META[lvl];
                return (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => playSeverityAlertSound(lvl, settings.volume)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border ${meta.bgClass} ${meta.textClass} ${meta.borderClass} hover:opacity-85 transition-opacity cursor-pointer`}
                  >
                    <Play className="w-3 h-3" />
                    <span>{meta.shortLabel}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Visual & Polling Settings */}
        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
          <div className="text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Notificaciones Visuales y Frecuencia de Consulta
          </div>

          <label className="flex items-center justify-between gap-3 py-1.5 cursor-pointer">
            <div>
              <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                Banner Superior de Alerta Entrante
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Muestra una franja de alta visibilidad con acceso directo al evento.
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.visualBannerEnabled}
              onChange={(e) =>
                onUpdateSettings({ ...settings, visualBannerEnabled: e.target.checked })
              }
              className="w-4 h-4 accent-sky-600"
            />
          </label>

          <label className="flex items-center justify-between gap-3 py-1.5 cursor-pointer">
            <div>
              <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                Destello Perimetral para Alerta Roja
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Resalta brevemente los bordes del visor ante eventos de nivel Alerta (Warning).
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.visualFlashEnabled}
              onChange={(e) =>
                onUpdateSettings({ ...settings, visualFlashEnabled: e.target.checked })
              }
              className="w-4 h-4 accent-sky-600"
            />
          </label>

          <div className="flex items-center justify-between gap-3 py-1.5">
            <div>
              <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                Notificaciones de Escritorio (Navegador)
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Estado del permiso: <span className="font-mono">{permission}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleToggleBrowserPush}
              disabled={!browserSupported}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50"
            >
              <Bell className="w-3.5 h-3.5" />
              <span>{settings.browserPushEnabled ? 'Desactivar' : 'Habilitar'}</span>
            </button>
          </div>

          <div className="flex items-center justify-between gap-3 pt-1">
            <label
              htmlFor="polling-interval"
              className="text-sm font-medium text-slate-900 dark:text-slate-100"
            >
              Intervalo de Sondeo Automático
            </label>
            <select
              id="polling-interval"
              value={settings.pollingIntervalSec}
              onChange={(e) =>
                onUpdateSettings({
                  ...settings,
                  pollingIntervalSec: Number(e.target.value),
                })
              }
              className="px-2.5 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
            >
              <option value={30}>Cada 30 segundos</option>
              <option value={60}>Cada 60 segundos</option>
              <option value={120}>Cada 2 minutos</option>
              <option value={300}>Cada 5 minutos</option>
              <option value={0}>Solo manual</option>
            </select>
          </div>
        </div>

        {/* Test Alert Simulator */}
        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
          <div className="text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Simulacro de Alerta en Tiempo Real
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Dispara un evento de prueba etiquetado como simulacro para verificar el comportamiento completo de las notificaciones visuales y auditivas.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onTriggerTestAlert('warning')}
              className="px-3 py-2 text-xs font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors cursor-pointer"
            >
              Simular ▲ Alerta de Tsunami
            </button>
            <button
              type="button"
              onClick={() => onTriggerTestAlert('watch')}
              className="px-3 py-2 text-xs font-semibold bg-orange-600 text-white hover:bg-orange-700 transition-colors cursor-pointer"
            >
              Simular ◆ Vigilancia
            </button>
            <button
              type="button"
              onClick={() => onTriggerTestAlert('advisory')}
              className="px-3 py-2 text-xs font-semibold bg-amber-600 text-white hover:bg-amber-700 transition-colors cursor-pointer"
            >
              Simular ● Aviso Costero
            </button>
          </div>
        </div>
      </div>

      {/* Right Column: International Agency Feeds Status */}
      <div className="lg:col-span-5 border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] p-5 space-y-4">
        <div className="border-b border-slate-200 dark:border-slate-800 pb-3 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Agencias Internacionales Conectadas
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Fuentes oficiales consultadas en tiempo real desde el servidor.
            </p>
          </div>
          <Radio className="w-4 h-4 text-sky-600 dark:text-sky-400" />
        </div>

        <div className="divide-y divide-slate-200 dark:divide-slate-800">
          {agencies.map((ag) => (
            <div key={ag.code} className="py-3 flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {ag.name}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {ag.regionCoverage}
                </div>
              </div>
              <div className="text-right shrink-0">
                {ag.ok ? (
                  <div className="inline-flex items-center gap-1 text-xs font-mono text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{ag.count} reg.</span>
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-1 text-xs font-mono text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Sin respuesta</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
