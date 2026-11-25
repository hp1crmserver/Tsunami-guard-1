export type SeverityLevel = 'warning' | 'watch' | 'advisory' | 'information';

export type AgencyCode = 'PTWC' | 'NTWC' | 'NWS' | 'JMA' | 'USGS' | 'EMSC' | 'GeoNet';

export type OceanRegion =
  | 'Pacífico Norte'
  | 'Pacífico Sur'
  | 'Sudamérica'
  | 'Japón y Kuriles'
  | 'Indonesia e Índico'
  | 'Caribe y Atlántico'
  | 'Mediterráneo'
  | 'Oceanía'
  | 'Global';

export type ThemeMode = 'light' | 'dark' | 'system';

export type EsriLayerId =
  | 'ocean'
  | 'imagery'
  | 'dark-gray'
  | 'light-gray'
  | 'topo'
  | 'natgeo';

export interface TsunamiEvent {
  id: string;
  title: string;
  agency: AgencyCode;
  agencyFullName: string;
  bulletinType: string;
  severity: SeverityLevel;
  region: OceanRegion;
  location: string;
  latitude: number;
  longitude: number;
  depthKm: number | null;
  magnitude: number | null;
  magnitudeType: string | null;
  issuedAt: string;
  tsunamiFlag: boolean;
  summary: string;
  bulletinUrl?: string;
  bulletinText?: string;
  status: 'active' | 'historical';
  isTestAlert?: boolean;
}

export interface AgencyFeedStatus {
  code: AgencyCode;
  name: string;
  regionCoverage: string;
  ok: boolean;
  count: number;
  error?: string;
}

export interface TsunamiFeedResponse {
  events: TsunamiEvent[];
  agencies: AgencyFeedStatus[];
  fetchedAt: string;
}

export interface HistoryFilters {
  search: string;
  dateFrom: string;
  dateTo: string;
  region: OceanRegion | 'ALL';
  severities: SeverityLevel[];
  agency: AgencyCode | 'ALL';
}

export interface NotificationSettings {
  audioEnabled: boolean;
  volume: number;
  minAudioSeverity: SeverityLevel;
  visualBannerEnabled: boolean;
  visualFlashEnabled: boolean;
  browserPushEnabled: boolean;
  pollingIntervalSec: number;
}

export const SEVERITY_META: Record<
  SeverityLevel,
  {
    label: string;
    shortLabel: string;
    glyph: string;
    rank: number;
    description: string;
    textClass: string;
    bgClass: string;
    borderClass: string;
    hex: string;
  }
> = {
  warning: {
    label: 'Alerta de Tsunami',
    shortLabel: 'Alerta',
    glyph: '▲',
    rank: 4,
    description: 'Inundación costera peligrosa inminente o en curso. Requiere evacuación inmediata.',
    textClass: 'text-red-700 dark:text-red-400',
    bgClass: 'bg-red-500/10 dark:bg-red-500/15',
    borderClass: 'border-red-500/30 dark:border-red-500/40',
    hex: '#DC2626',
  },
  watch: {
    label: 'Vigilancia de Tsunami',
    shortLabel: 'Vigilancia',
    glyph: '◆',
    rank: 3,
    description: 'Evento sísmico potencialmente tsunamigénico bajo evaluación activa.',
    textClass: 'text-orange-700 dark:text-orange-400',
    bgClass: 'bg-orange-500/10 dark:bg-orange-500/15',
    borderClass: 'border-orange-500/30 dark:border-orange-500/40',
    hex: '#EA580C',
  },
  advisory: {
    label: 'Aviso de Tsunami',
    shortLabel: 'Aviso',
    glyph: '●',
    rank: 2,
    description: 'Corrientes fuertes y olas peligrosas en zonas costeras y puertos.',
    textClass: 'text-amber-700 dark:text-amber-400',
    bgClass: 'bg-amber-500/10 dark:bg-amber-500/15',
    borderClass: 'border-amber-500/30 dark:border-amber-500/40',
    hex: '#D97706',
  },
  information: {
    label: 'Boletín Informativo',
    shortLabel: 'Boletín',
    glyph: '■',
    rank: 1,
    description: 'Evaluación emitida sin amenaza de tsunami destructivo generalizado.',
    textClass: 'text-sky-700 dark:text-sky-400',
    bgClass: 'bg-sky-500/10 dark:bg-sky-500/15',
    borderClass: 'border-sky-500/30 dark:border-sky-500/40',
    hex: '#0284C7',
  },
};

export const OCEAN_REGIONS: OceanRegion[] = [
  'Pacífico Norte',
  'Pacífico Sur',
  'Sudamérica',
  'Japón y Kuriles',
  'Indonesia e Índico',
  'Caribe y Atlántico',
  'Mediterráneo',
  'Oceanía',
  'Global',
];
