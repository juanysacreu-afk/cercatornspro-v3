
export interface Shift {
  id: string;
  servei: string;
  inici_torn: string;
  final_torn: string;
  duracio: string;
  dependencia: string;
  circulations: CirculationRef[];
}

export interface CirculationRef {
  id: string;
  linia: string;
  inici: string;
  final: string;
  sortida: string;
  arribada: string;
  cicle?: string;
  observacions?: string;
}

export interface Circulation {
  id: string;
  linia: string;
  inici: string;
  via_inici: string;
  sortida: string;
  final: string;
  via_final: string;
  arribada: string;
  estacions: StationStop[];
}

export interface StationStop {
  nom: string;
  arribada: string;
  sortida: string;
  via: string;
  hora?: string;
}

export interface DailyAssignment {
  id: number;
  torn: string;
  hora_inici: string;
  hora_fi: string;
  empleat_id: string;
  nom: string;
  cognoms: string;
  observacions: string;
  rango_horario_extra: string;
  created_at: string;
  data_servei?: string;
  abs_parc_c?: string;
  dta?: string;
  dpa?: string;
  tipus_torn?: string;
}

export interface PhonebookEntry {
  nomina: string;
  nom: string;
  cognom1: string;
  cognom2: string;
  phones: string[];
}

export interface Assignment {
  cycle_id: string;
  train_number: string;
  created_at: string;
}

export enum AppTab {
  Dashboard = 'dashboard',
  Cercar = 'cercar',
  Organitza = 'organitza',
  Incidencia = 'incidencia',
  Cicles = 'cicles',
  Mensajeria = 'mensajeria'
}

export enum SearchType {
  Torn = 'torn',
  Maquinista = 'maquinista',
  Circulacio = 'circulacio',
  Estacio = 'estacio',
  Cicle = 'cicle'
}

export enum OrganizeType {
  Comparador = 'comparador',
  Maquinista = 'maquinista',
  Incidencia = 'incidencia',
  Malla = 'malla'
}

// ──────────────────────────────────────────────
// Map & Live Data
// ──────────────────────────────────────────────

/** Mapa interactivo: personal (maquinista en tren o reposo) */
export interface LivePersonnel {
  type: 'TRAIN' | 'REST';
  id: string;
  linia: string;
  stationId: string;
  color: string;
  driver?: string;
  driverName?: string;
  driverSurname?: string;
  torn?: string;
  shiftStart?: string;
  shiftEnd?: string;
  shiftStartMin?: number;
  shiftEndMin?: number;
  shiftDep?: string;
  servei?: string;
  phones?: string[];
  inici?: string;
  final?: string;
  via_inici?: string;
  via_final?: string;
  horaPas?: string;
  x: number;
  y: number;
  visualOffset?: number;
  nextStationId?: string;
  isMoving?: boolean;
  startTimeMin?: number;
  endTimeMin?: number;
  progress?: number;
}

/** Nodo de estación para el mapa SVG */
export interface MapStation {
  id: string;
  label: string;
  x: number;
  y: number;
  type?: 'depot' | 'station';
}

/** Segmento entre dos estaciones en el mapa SVG */
export interface MapSegment {
  from: string;
  to: string;
  path: string;
}

// ──────────────────────────────────────────────
// GeoTren (posiciones en tiempo real desde SIRTRAN)
// ──────────────────────────────────────────────

export interface GeoTrenPoint {
  id: string;
  lin: string;
  estacionat_a?: string;
  proper_parades?: Array<{
    parada: string;
    hora_prevista?: string;
  }>;
  retard?: number;
}

// ──────────────────────────────────────────────
// Malla Real (gráfico de circulaciones)
// ──────────────────────────────────────────────

export interface MallaCirculation {
  id: string;
  torn: string;
  linia: string;
  sortida: string;
  arribada: string;
  inici?: string;
  final?: string;
  originId: string;
  destId: string;
  train?: string;
  servei?: string;
}

// ──────────────────────────────────────────────
// Pla de Servei Alternatiu
// ──────────────────────────────────────────────

/** Resultado de detección de islas/ramas tras cortes */
export interface IslandResult {
  id: string;
  stations: Set<string>;
  supportedLines: string[];
  personnel: LivePersonnel[];
}

/** Circulación generada del servei alternatiu */
export interface AltServiceCirculation {
  id: string;
  linia: string;
  sortida: string;
  arribada: string;
  origin: string;
  dest: string;
  originId: string;
  destId: string;
  train?: string;
  torn?: string;
  servei?: string;
}

// ──────────────────────────────────────────────
// Dipòsits
// ──────────────────────────────────────────────

export interface DepotCapacity {
  u4: number;
  u3: number;
  total: number;
  label: string;
}

export interface ParkedUnit {
  id?: string;
  depot_id: string;
  track: string;
  position?: number;
  unit_type?: 'u4' | 'u3';
  unit_number: string;
  label?: string;
}

// ──────────────────────────────────────────────
// Reserves
// ──────────────────────────────────────────────

export interface ReserveShift {
  id: string;
  loc: string;
  start: string;
  end: string;
}

// ──────────────────────────────────────────────
// Vista d'Incidència
// ──────────────────────────────────────────────

export interface IncidenciaViewProps {
  showSecretMenu: boolean;
  parkedUnits: ParkedUnit[];
  onParkedUnitsChange: () => Promise<void>;
  isPrivacyMode: boolean;
}

export type IncidenciaMode = 'INIT' | 'MAQUINISTA' | 'LINIA' | 'PER_TORN';

/** IDs de diagramas de estaciones/depósitos */
export type DiagramId =
  | 'PC' | 'PR' | 'GR' | 'PM' | 'BN' | 'TB' | 'SR'
  | 'RE_ST' | 'RE_DEPOT' | 'RB_DEPOT' | 'NA_DEPOT' | 'PN_DEPOT';

// ──────────────────────────────────────────────
// Enriched Data (from fetchFullTurns / hooks)
// ──────────────────────────────────────────────

/** Driver information enriched from daily_assignments + agents */
export interface EnrichedDriver {
  nom: string;
  cognoms: string;
  nomina: string;
  phones: string[];
  email?: string | null;
  observacions: string;
  abs_parc_c?: string;
  dta?: string;
  dpa?: string;
  tipus_torn?: string;
  realTornId?: string | null;
}

/** Circulation detail enriched with machinist-specific info */
export interface EnrichedCirculation {
  id: string;
  codi: string;
  realCodi?: string | null;
  linia: string;
  inici: string;
  final: string;
  sortida: string;
  arribada: string;
  machinistInici?: string;
  machinistFinal?: string;
  cicle?: string | null;
  train?: string | null;
  via_inici?: string;
  via_final?: string;
  estacions?: StationStop[];
  observacions?: string;
}

/** Shift enriched with driver info and full circulation details */
export interface EnrichedShift {
  id: string;
  servei: string;
  inici_torn: string;
  final_torn: string;
  duracio?: string;
  dependencia: string;
  circulations: CirculationRef[];
  isVirtual?: boolean;
  drivers: EnrichedDriver[];
  fullCirculations: EnrichedCirculation[];
  /** Used for adjacent results — the code of the adjacent circ */
  adjacentCode?: string;
}

/** Supabase circulation row (raw from `circulations` table) */
export interface CirculationDetail {
  id: string;
  linia: string;
  inici: string;
  via_inici: string;
  sortida: string;
  final: string;
  via_final: string;
  arribada: string;
  estacions?: StationStop[];
}

/** Island division for personnel during incidents */
export interface DividedPersonnelIsland {
  list: LivePersonnel[];
  stations: Set<string>;
  isUnified: boolean;
  label: string;
}

/** Result of a resting candidate analysis */
export interface RestingResult extends EnrichedShift {
  restSeg: { codi: string; start: number; end: number };
  availableTime: number;
  conflictMinutes: number;
  nextCirculation: (EnrichedCirculation & { start: number; end: number }) | null;
  returnStatus: 'unknown' | 'same_station' | 'ok' | 'no_route' | 'too_late';
  returnCirc: CirculationDetail | null;
  isEndOfShift: boolean;
}

/** Result of an extensible candidate analysis */
export interface ExtensibleResult extends EnrichedShift {
  extData: {
    originalDuration: number;
    extraNeeded: number;
    estimatedReturn: number;
  };
}

/** A single intercept option within a reserve intercept result */
export interface InterceptOption {
  type: 'direct' | 'travel';
  station: string;
  reserveId: string;
  interceptTime: string;
  reserveBase: string;
  travelFrom?: string;
  travelTime?: number;
  margin: number;
  isOverLimit: boolean;
  actualEndTime: string;
  returnCirc: { id: string; start: string; end: string } | null;
  driverReturnCirc: { id: string; start: string; end: string } | null;
}

/** Reserve intercept result with options */
export interface ReserveInterceptResult extends EnrichedShift {
  resOptions: InterceptOption[];
}

/** Adjacent results (anterior/posterior viatger search) */
export interface AdjacentResults {
  anterior: EnrichedShift[];
  posterior: EnrichedShift[];
}
