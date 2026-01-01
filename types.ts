
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
}

export interface DailyAssignment {
  id: number;
  torn: string;
  hora_inici: string;
  hora_fi: string;
  empleat_id: string;
  nom: string;
  observacions: string;
  rango_horario_extra: string;
  created_at: string;
  data_servei?: string;
  abs_parc_c?: string;
  dta?: string;
  dpa?: string;
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
  Cercar = 'cercar',
  Organitza = 'organitza',
  Cicles = 'cicles',
  Agenda = 'agenda'
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
  CirculacioDescoberta = 'circulacio_descoberta',
  Maquinista = 'maquinista',
  Incidencia = 'incidencia'
}
