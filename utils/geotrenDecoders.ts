/**
 * Geotren Decoders for NEXUS FGC
 * Decodes GeoTren circulation codes (NC bitwise XOR) and Unit Numbers (UT lookup).
 * Moved to utils/ to avoid circular bundle dependencies between views.
 */

export interface CirculationInfo {
  line: string;
  direction: string;   // FGC prefix letter: D, F, A, R, S...
  number: string;
  fullName: string;
}

/**
 * Mapping from NC code prefix (first 2 chars after '|') to line and direction letter.
 * Direction letter follows FGC naming convention:
 *   D = S1 trains (PC ↔ Terrassa/Rubí)
 *   F = S2 / S12 trains (PC ↔ Sabadell)
 *   B = L7 trains (PC ↔ Tibidabo)
 *   A = L6 trains (PC ↔ Sarrià)
 *   L = L12 trains (Sarrià ↔ Reina Elisenda)
 */
const LINE_MAP: Record<string, { line: string; dir: string }> = {
  '6a': { line: 'S1', dir: 'D' },
  '68': { line: 'S2', dir: 'F' },  // Sabadell → F
  '6c': { line: 'L7', dir: 'B' },  // Tibidabo → B
  '6f': { line: 'L6', dir: 'A' },  // Sarrià → A
  '62': { line: 'L12', dir: 'L' }, // Reina Elisenda → L
};

export const decodeGeotrenCirculation = (fullId?: string | null): CirculationInfo | null => {
  if (!fullId || !fullId.includes('|')) return null;

  const parts = fullId.split('|');
  const ncPart = parts[1]?.toLowerCase();
  if (!ncPart || ncPart.length < 10) return null;

  // Line and Direction from the first 2 chars
  const lineId = ncPart.substring(0, 2);
  const lineConfig = LINE_MAP[lineId];

  // Bitwise XOR decoding on specific hex characters
  // Index 5: Hundreds (XOR 7)
  // Index 7: Tens (XOR 3) 
  // Index 9: Units (XOR 2)
  const hundredsHex = parseInt(ncPart[5], 16);
  const tensHex = parseInt(ncPart[7], 16);
  const unitHex = parseInt(ncPart[9], 16);

  if (isNaN(hundredsHex) || isNaN(tensHex) || isNaN(unitHex)) return null;

  const hundredsDigit = hundredsHex ^ 7;
  const tensDigit = tensHex ^ 3;
  const unitDigit = unitHex ^ 2;

  const circulationNumber = hundredsDigit * 100 + tensDigit * 10 + unitDigit;

  if (isNaN(circulationNumber)) return null;

  const numberStr = circulationNumber.toString().padStart(3, '0');
  const line = lineConfig?.line || '??';
  const direction = lineConfig?.dir || 'D';
  const fullName = `${direction}${numberStr}`;

  return {
    line,
    direction,
    number: numberStr,
    fullName
  };
};

const SERIES_MAP: Record<string, string> = {
  '5fd': '112',
  '4fd': '113',
  '3fd': '114',
  '2fd': '115',
};

const SUFFIX_TO_UNIT: Record<string, number> = {
  // Block 02 — Units 01 to 09
  '0275': 1,
  '0276': 2,
  '0277': 3,
  '0270': 4,
  '0271': 5,
  '0272': 6,
  '0273': 7,
  '027c': 8,
  '027d': 9,
  
  // Block 03 — Units 10 to 19
  '0374': 10,
  '0375': 11,
  '0376': 12,
  '0377': 13,
  '0370': 14,
  '0371': 15,
  '0372': 16,
  '0373': 17,
  '037c': 18,
  '037d': 19,
  
  // Block 00 — Units 20 to 29
  '0074': 20,
  '0075': 21,
  '0076': 22,
  '0077': 23,
  '0070': 24,
  '0071': 25,
  '0072': 26,
  '0073': 27,
  '007c': 28,
  '007d': 29,
  
  // Block 01 — Units 30 to 39
  '0174': 30,
  '0175': 31,
  '0176': 32,
  '0177': 33,
  '0170': 34,
  '0171': 35,
  '0172': 36,
  '0173': 37,
  '017c': 38,
  '017d': 39,
  
  // Block 02 (looped for 40)
  '0274': 40,
};

const FLEET_MAX: Record<string, number> = {
  '112': 22,
  '113': 19,
  '114': 5,
  '115': 15,
};

const VALID_PREFIXES = new Set(['1f2cc', '1c2cc']);

export const decodeGeotrenUt = (hexUt?: string | null, tipusUnitat?: string | null): string | null => {
  if (!hexUt || hexUt === 'None' || hexUt.length < 12) return tipusUnitat || null;

  const hex = hexUt.toLowerCase();
  const prefix = hex.substring(0, 5);

  if (!VALID_PREFIXES.has(prefix)) {
    return tipusUnitat || null;
  }

  const seriesHex = hex.substring(5, 8);
  const series = SERIES_MAP[seriesHex] || tipusUnitat;
  if (!series) return null;

  const suffix = hex.substring(8, 12);
  const unitNumber = SUFFIX_TO_UNIT[suffix];

  if (unitNumber === undefined) {
    return series;
  }

  const max = FLEET_MAX[series];
  if (max && unitNumber > max) {
    return series;
  }

  const formattedUnit = unitNumber.toString().padStart(2, '0');
  return `${series}.${formattedUnit}`;
};
