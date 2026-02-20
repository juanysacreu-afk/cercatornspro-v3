import Dexie, { type EntityTable } from 'dexie';

interface Shift {
    id: string;
    servei: string;
    circulations: any;
    inici_torn?: string;
    final_torn?: string;
    dependencia?: string;
}

interface Circulation {
    id: string;
    inici?: string;
    final?: string;
    estacions?: any;
    sortida?: string;
    arribada?: string;
    linia?: string;
    via_inici?: string;
    via_final?: string;
}

interface Assignment {
    torn: string;
    empleat_id: string;
    nom: string;
    cognoms: string;
    observacions?: string;
    dta?: string;
    dpa?: string;
    tipus_torn?: string;
    abs_parc_c?: number;
}

interface CycleAssignment {
    cycle_id: string;
    train_number: string;
    updated_at?: string;
}

export const db = new Dexie('CercatornsOfflineDB') as Dexie & {
    shifts: EntityTable<Shift, 'id'>;
    circulations: EntityTable<Circulation, 'id'>;
    daily_assignments: EntityTable<Assignment, 'torn'>;
    assignments: EntityTable<CycleAssignment, 'cycle_id'>;
};

// Schma version 1
db.version(1).stores({
    shifts: 'id, servei', // Primary key and indexed props
    circulations: 'id', // Primary key
    daily_assignments: 'torn, empleat_id, nom, cognoms', // Primary key and indexes
    assignments: 'cycle_id, train_number'
});
