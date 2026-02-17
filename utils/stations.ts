/**
 * Centralized Station Data & Utilities
 * Single source of truth for all station-related logic across the app.
 */

// ──────────────────────────────────────────────
// Station Lists by Line
// ──────────────────────────────────────────────

export const S1_STATIONS = ['PC', 'PR', 'GR', 'SG', 'MN', 'BN', 'TT', 'SR', 'PF', 'VL', 'LP', 'LF', 'VD', 'SC', 'MS', 'HG', 'RB', 'FN', 'TR', 'VP', 'EN', 'NA'];
export const S2_STATIONS = ['PC', 'PR', 'GR', 'SG', 'MN', 'BN', 'TT', 'SR', 'PF', 'VL', 'LP', 'LF', 'VD', 'SC', 'VO', 'SJ', 'BT', 'UN', 'SQ', 'CF', 'PJ', 'CT', 'NO', 'PN'];
export const L6_STATIONS = ['PC', 'PR', 'GR', 'SG', 'MN', 'BN', 'TT', 'SR'];
export const L7_STATIONS = ['PC', 'PR', 'GR', 'PM', 'PD', 'EP', 'TB'];
export const L12_STATIONS = ['SR', 'RE'];

export const LINIA_STATIONS: Record<string, string[]> = {
    'S1': S1_STATIONS,
    'S2': S2_STATIONS,
    'L6': L6_STATIONS,
    'L7': L7_STATIONS,
    'L12': L12_STATIONS,
};

/** Global ordering of all stations for malla Y-axis rendering */
export const MASTER_STATION_ORDER = [
    'PC', 'PR', 'GR', 'PM', 'PD', 'EP', 'TB',
    'SG', 'MN', 'BN', 'TT', 'SR', 'RE',
    'PF', 'VL', 'LP', 'LF', 'VD', 'SC',
    'MS', 'HG', 'RB', 'FN', 'TR', 'VP', 'EN', 'NA',
    'VO', 'SJ', 'BT', 'UN', 'SQ', 'CF', 'PJ', 'CT', 'NO', 'PN'
];

// ──────────────────────────────────────────────
// Station Name → Code Resolution
// ──────────────────────────────────────────────

/** Exact name → code mapping (used for direct lookups) */
const STATION_NAME_MAP: Record<string, string> = {
    'CATALUNYA': 'PC', 'PROVENCA': 'PR', 'GRACIA': 'GR', 'SANT GERVASI': 'SG', 'MUNTANER': 'MN',
    'LA BONANOVA': 'BN', 'LES TRES TORRES': 'TT', 'SARRIA': 'SR', 'REINA ELISENDA': 'RE', 'AV. TIBIDABO': 'TB',
    'PEU DEL FUNICULAR': 'PF', 'BAIXADOR DE VALLVIDRERA': 'VL', 'VALLVIDRERA': 'VL', 'LES PLANES': 'LP', 'LA FLORESTA': 'LF',
    'VALLDOREIX': 'VD', 'SANT CUGAT': 'SC', 'MIRA-SOL': 'MS', 'HOSPITAL GENERAL': 'HG', 'RUBI': 'RB',
    'LES FONTS': 'FN', 'TERRASSA RAMBLA': 'TR', 'VALLPARADIS': 'VP', 'ESTACIO DEL NORD': 'EN', 'NACIONS UNIDES': 'NA',
    'VOLPALLERES': 'VO', 'SANT JOAN': 'SJ', 'BELLATERRA': 'BT', 'UNIVERSITAT AUTONOMA': 'UN', 'UAB': 'UN', 'SANT QUIRZE': 'SQ',
    'CAN FEU': 'CF', 'PL. MAJOR': 'PJ', 'LA CREU ALTA': 'CT', 'SABADELL NORD': 'NO', 'PARC DEL NORD': 'PN',
    'PL. MOLINA': 'PM', 'PADUA': 'PD', 'EL PUTXET': 'EP',
    'AV TIBIDABO': 'TB', 'PLACA MOLINA': 'PM',
    // Depots
    'CAN ROCA': 'DNA', 'DIPOSIT TERRASSA': 'DNA', 'DNA': 'DNA',
    'CA N\'ORIACH': 'DPN', 'DIPOSIT SABADELL': 'DPN', 'DPN': 'DPN',
    'DIPOSIT REINA ELISENDA': 'DRE', 'DIP.RE': 'DRE', 'DRE': 'DRE',
    'CENTRE OPERACIONS RUBI': 'COR', 'TALLERS RUBI': 'COR', 'COR': 'COR',
};

/**
 * Resolves a station name (in any format) to its 2-letter code.
 * Handles accents, abbreviations, partial matches, and code inputs.
 */
export const resolveStationId = (name: string, _linia: string = ''): string => {
    if (!name) return '';
    const n = name.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

    // Direct lookup first
    if (STATION_NAME_MAP[n]) return STATION_NAME_MAP[n];

    // Terminal and critical station shortcuts
    if (n.includes('CATALUNYA') || n === 'PC') return 'PC';
    if (n.includes('SARRIA') || n === 'SR') return 'SR';
    if (n.includes('ELISENDA') || n === 'RE') return 'RE';
    if (n.includes('TIBIDABO') || n === 'TB') return 'TB';
    if (n.includes('NACIONS') || n === 'NA') return 'NA';
    if (n.includes('PARC DEL NORD') || n === 'PN') return 'PN';
    if (n.includes('NORD') && n.includes('SABADELL')) return 'NO';
    if (n.includes('NORD') && n.includes('TERRASSA')) return 'EN';

    // Iterate over map keys for partial matches
    for (const key of Object.keys(STATION_NAME_MAP)) {
        if (n.includes(key)) return STATION_NAME_MAP[key];
    }

    return n.length > 2 ? n.substring(0, 2) : n;
};

// ──────────────────────────────────────────────
// Line Color Constants
// ──────────────────────────────────────────────

export const LINE_COLORS: Record<string, { hex: string; tailwind: string; label: string }> = {
    'S1': { hex: '#f97316', tailwind: 'bg-orange-500', label: 'S1 Terrassa' },
    'S2': { hex: '#22c55e', tailwind: 'bg-green-500', label: 'S2 Sabadell' },
    'L6': { hex: '#9333ea', tailwind: 'bg-purple-600', label: 'L6' },
    'L7': { hex: '#8B4513', tailwind: 'bg-[#8B4513]', label: 'L7' },
    'L12': { hex: '#d8b4fe', tailwind: 'bg-purple-300', label: 'L12' },
    'M': { hex: '#6b7280', tailwind: 'bg-gray-500', label: 'Maniobres' },
};

/** Returns hex color for a line code (for SVG and inline styles) */
export const getLiniaColorHex = (linia: string): string => {
    const l = mainLiniaForFilter(linia);
    if (l.startsWith('M')) return LINE_COLORS['M'].hex;
    return LINE_COLORS[l]?.hex || '#4D5358';
};

/** Returns the main line identifier for filter grouping */
export const mainLiniaForFilter = (linia: string): string => {
    const l = (linia || '').toUpperCase().trim();
    if (l === 'S1' || l === 'MS1' || l === '400' || l.startsWith('D')) return 'S1';
    if (l === 'S2' || l === 'MS2' || l === 'ES2' || l === '500' || l.startsWith('F')) return 'S2';
    if (l === 'L6' || l === 'L66' || l === 'ML6' || l === '100' || l.startsWith('A')) return 'L6';
    if (l === 'L7' || l === 'ML7' || l === '300' || l.startsWith('B')) return 'L7';
    if (l === 'L12' || l.startsWith('L') && !l.startsWith('LP')) return 'L12';
    if (l.startsWith('M')) return 'M';
    return l;
};

// ──────────────────────────────────────────────
// Service Visibility
// ──────────────────────────────────────────────

/** Checks if a servei value matches the selected filter */
export const isServiceVisible = (val: string | undefined, f: string): boolean => {
    if (f === 'Tots' || !f) return true;
    const s = (val || '').toString().toUpperCase().trim();
    const filter = f.toUpperCase().trim();

    // 1. Exact match
    if (s === filter) return true;

    // 2. Specific partial match (e.g. '100' inside 'S-100' or '100-F')
    // We use a regex to ensure numeric filters don't match sub-parts of other numbers 
    // to avoid the problem where "0" matches "100", "400", etc.
    const escapedFilter = filter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const isOnlyDigits = /^\d+$/.test(filter);

    if (isOnlyDigits) {
        // Match if it's exactly the number, or preceded/followed by non-digits
        // Example: "0" matches "0", "S-0", "0-A", but NOT "100", "205"
        const regex = new RegExp(`(^|[^0-9])${escapedFilter}([^0-9]|$)`);
        if (regex.test(s)) return true;
    } else {
        // Generic partial match for non-numeric filters
        if (s.includes(filter)) return true;
    }

    // 3. Legacy Aliases / Line Mappings
    if ((filter === '400' || filter === 'S1') && (s === '400' || s === 'S1' || s.includes('S1'))) return true;
    if ((filter === '500' || filter === 'S2') && (s === '500' || s === 'S2' || s.includes('S2'))) return true;
    if ((filter === '100' || filter === 'L6') && (s === '100' || s === 'L6' || s.includes('L6'))) return true;
    if ((filter === '0' || filter === '000' || filter === 'L12') && (s === '0' || s === '000' || s === 'L12' || s.includes('L12'))) return true;

    return false;
};

// ──────────────────────────────────────────────
// Shared Time Utilities (FGC day starts at 04:00)
// ──────────────────────────────────────────────

/** Converts "HH:MM" to minutes since midnight, with FGC day wrapping (hours < 4 = next day) */
export const getFgcMinutes = (timeStr: string | undefined): number | null => {
    if (!timeStr || typeof timeStr !== 'string' || !timeStr.includes(':')) return null;
    const parts = timeStr.split(':');
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if (isNaN(h) || isNaN(m)) return null;
    let total = h * 60 + m;
    if (h < 4) total += 24 * 60;
    return total;
};

/** Formats total minutes back to "HH:MM" format */
export const formatFgcTime = (totalMinutes: number | null): string => {
    if (totalMinutes === null) return '--:--';
    let mins = totalMinutes;
    if (mins >= 24 * 60) mins -= 24 * 60;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};

// ──────────────────────────────────────────────
// Short Torn ID
// ──────────────────────────────────────────────

/** Shortens a torn ID (e.g. Q0101 → Q101, QR stays unchanged) */
export const getShortTornId = (id: string): string => {
    const trimmed = id.trim();
    if (trimmed.startsWith('Q') && !trimmed.startsWith('QR') && trimmed.length === 5) return trimmed[0] + trimmed.slice(2);
    return trimmed;
};

// ──────────────────────────────────────────────
// String Normalization
// ──────────────────────────────────────────────

/** Removes accents and uppercases string, useful for search matching */
export const normalizeStr = (str: string): string =>
    str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase() : "";

// ──────────────────────────────────────────────
// Travel Times between stations (minutes)
// ──────────────────────────────────────────────

export const TRAVEL_TIMES: Record<string, number> = {
    'PC-SR': 10, 'SR-PC': 10,
    'SR-SC': 15, 'SC-SR': 15,
    'SC-RB': 8, 'RB-SC': 8,
    'RB-TR': 10, 'TR-RB': 10,
    'TR-NA': 5, 'NA-TR': 5,
    'SC-PN': 15, 'PN-SC': 15,
    'PC-SC': 25, 'SC-PC': 25,
    'SR-RE': 5, 'RE-SR': 5,
    'GR-TB': 8, 'TB-GR': 8,
};

/** Gets travel time between two stations, with fallbacks for long-distance */
export const getTravelTime = (from: string, to: string): number => {
    const f = resolveStationId(from);
    const t = resolveStationId(to);
    if (!f || !t || f === t) return 0;
    if (TRAVEL_TIMES[`${f}-${t}`]) return TRAVEL_TIMES[`${f}-${t}`];
    if (TRAVEL_TIMES[`${t}-${f}`]) return TRAVEL_TIMES[`${t}-${f}`];
    if ((f === 'PC' && t === 'RB') || (f === 'RB' && t === 'PC')) return 35;
    if ((f === 'PC' && t === 'PN') || (f === 'PN' && t === 'PC')) return 40;
    if ((f === 'PC' && t === 'NA') || (f === 'NA' && t === 'PC')) return 45;
    if ((f === 'SR' && t === 'RB') || (f === 'RB' && t === 'SR')) return 25;
    if ((f === 'SR' && t === 'PN') || (f === 'PN' && t === 'SR')) return 30;
    return 15;
};

// ──────────────────────────────────────────────
// Segment Logic
// ──────────────────────────────────────────────

/**
 * Returns a set of segments (e.g. "PC-PR-V1") for a path between two stations.
 * Used for identifying if a train is "inside" a cut or relevant area.
 */
export const getSegments = (from: string, to: string, linia: string = ''): string[] => {
    const f = resolveStationId(from);
    const t = resolveStationId(to);
    if (!f || !t || f === t) return [];

    // Determine direction based on station order in MASTER_STATION_ORDER
    const idxF = MASTER_STATION_ORDER.indexOf(f);
    const idxT = MASTER_STATION_ORDER.indexOf(t);
    if (idxF === -1 || idxT === -1) return [];

    const isDesc = idxT > idxF; // Descendent: PC -> Vallés
    const track = isDesc ? 'V1' : 'V2';

    // Build list of stations in path
    const startIdx = Math.min(idxF, idxT);
    const endIdx = Math.max(idxF, idxT);
    const pathStations = MASTER_STATION_ORDER.slice(startIdx, endIdx + 1);

    if (!isDesc) pathStations.reverse(); // If Ascendent, reverse to match travel direction

    const segments: string[] = [];
    for (let i = 0; i < pathStations.length - 1; i++) {
        const u = pathStations[i];
        const v = pathStations[i + 1];
        segments.push(`${u}-${v}-${track}`);
    }
    return segments;
};
