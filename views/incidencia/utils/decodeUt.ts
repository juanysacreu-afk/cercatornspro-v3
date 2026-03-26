/**
 * Definitive UT decoding based on the official FGC lookup table.
 *
 * Structure of a 12-char hex UT code:
 *   [0-4]  Prefix   "1f2cc" or "1c2cc"  (manufacturer variants)
 *   [5-7]  Series   "5fd"=112, "4fd"=113, "3fd"=114, "2fd"=115
 *   [8-11] Suffix   maps directly to the unit number via lookup table
 *
 * The suffix encodes the unit number using a combination of a
 * "tens block" identifier and a final-digit transformation (XOR 4).
 */

const SERIES_MAP: Record<string, string> = {
    '5fd': '112',
    '4fd': '113',
    '3fd': '114',
    '2fd': '115',
};

/**
 * Complete suffix-to-unit lookup table.
 * Derived from the official FGC reference table (image provided by user).
 * Key = last 4 hex chars (positions 8-11), Value = unit number.
 *
 * NOTE: The suffix is shared across all series — only the series hex
 *       (chars 5-7) changes between 112/113/114/115 fleet families.
 */
const SUFFIX_TO_UNIT: Record<string, number> = {
    // Block 02 — Units 01 to 10
    '0275': 1,
    '0276': 2,
    '0277': 3,
    '0270': 4,
    '0271': 5,
    '0272': 6,
    '0273': 7,
    '027c': 8,
    '027d': 9,
    '0274': 10,
    // Block 03 — Units 11 to 20
    // Pattern matches Block 02: last nibbles 5,6,7,0,1,2,3,c,d,4
    '0375': 11,
    '0376': 12,
    '0377': 13,
    '0370': 14,
    '0371': 15,
    '0372': 16,
    '0373': 17,
    '037c': 18,
    '037d': 19,
    '0374': 20,
    // Block 00 — Units 21 to 30
    '0075': 21,
    '0074': 22,
    '0077': 23,
    '0070': 24,
    '0071': 25,
    '0072': 26,
    '0073': 27,
    '007c': 28,
    '007d': 29,
    '0076': 30,
    // Block 01 — Units 31 to 40
    '0175': 31,
    '0176': 32,
    '0177': 33,
    '0170': 34,
    '0171': 35,
    '0172': 36,
    '0173': 37,
    '017c': 38,
    '017d': 39,
    '0174': 40,
};

/** Fleet limits per series */
const FLEET_MAX: Record<string, number> = {
    '112': 22,
    '113': 19,
    '114': 5,
    '115': 15,
};

/** Valid FGC manufacturer prefixes (both variants seen in live API) */
const VALID_PREFIXES = new Set(['1f2cc', '1c2cc']);

export const decodeGeotrenUt = (hexUt?: string | null, tipusUnitat?: string | null): string | null => {
    if (!hexUt || hexUt === 'None' || hexUt.length < 12) return tipusUnitat || null;

    const hex = hexUt.toLowerCase();
    const prefix = hex.substring(0, 5);

    // Must start with a known FGC manufacturer prefix
    if (!VALID_PREFIXES.has(prefix)) {
        return tipusUnitat || null;
    }

    // Resolve the series from characters 5-7
    const seriesHex = hex.substring(5, 8);
    const series = SERIES_MAP[seriesHex] || tipusUnitat;
    if (!series) return null;

    // Look up the unit number from the suffix (characters 8-11)
    const suffix = hex.substring(8, 12);
    const unitNumber = SUFFIX_TO_UNIT[suffix];

    if (unitNumber === undefined) {
        // Unknown suffix — show only the series
        return series;
    }

    // Validate against fleet size
    const max = FLEET_MAX[series];
    if (max && unitNumber > max) {
        return series;
    }

    const formattedUnit = unitNumber.toString().padStart(2, '0');
    return `${series}.${formattedUnit}`;
};
