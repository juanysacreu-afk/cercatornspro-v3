/**
 * Utility to decode FGC Circulation ID (NC Code) into human-readable sequence number.
 *
 * Example:
 * ID part "702" -> Circulation 140 (Sentido D)
 * ID part "b02" -> Circulation 180 (Sentido A)
 * ID part "603" -> Circulation 151 (Sentido D)
 *
 * Logic:
 * 1. Last nibble (Unit): (HexDigit XOR 2)
 * 2. Previous nibble (Tens): (HexDigit XOR 9)
 * 3. Prefix: Maps to the Line and Direction (A/D)
 */

interface CirculationInfo {
    line: string;
    direction: string;   // FGC prefix letter: D, F, A, R, S...
    number: string;
    fullName: string;
}

/**
 * Mapping from NC code prefix (first 2 chars after '|') to line and direction letter.
 * Direction letter follows FGC naming convention (not ascending/descending):
 *   D = S1 trains (PC ↔ Terrassa/Rubí)
 *   F = S2 / S12 trains (PC ↔ Sabadell)
 *   A = L6 trains (PC ↔ Sarrià)
 *   Pending: L7, R5, R6, S8...
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

    // The NC code ends in exactly 3 encoding chars: [TENS_XOR][MID][UNIT_XOR]
    // e.g. "702" → tens='7', mid='0', unit='2'
    // e.g. "603" → tens='6', mid='0', unit='3'
    // e.g. "b02" → tens='b', mid='0', unit='2'
    // We take the LAST 3 chars of ncPart
    const last3 = ncPart.slice(-3);
    if (last3.length < 3) return null;

    const tensHex = parseInt(last3[0], 16);  // First of last 3
    const unitHex = parseInt(last3[2], 16);  // Last char

    // Universal FGC Circulation Tens Mapping
    // This maps the hex digit T (tensHex) to the actual circulation tens (e.g. 14 for D140).
    const TENS_MAP: Record<number, number> = {
        2: 11,  // Verified: A116
        // 12 ?
        // 13 ?
        7: 14,  // Verified: D140, A143, F143
        6: 15,  // Verified: D151, D152, F157
        5: 16,  // Verified: D160, D162
        4: 17,  // Verified: L171
        11: 18, // Verified: A184 (b)
        10: 19, // Verified: D192, B194, F196 (a)
        3: 20,  // Verified: B201
        
        // Extrapolations for missing ones (safe fallbacks):
        0: 13, 1: 12, 8: 22, 9: 21, 12: 24, 13: 23, 14: 26, 15: 25
    };

    const tens = TENS_MAP[tensHex] || 0;

    // XOR 2 for units
    const unitDigit = unitHex ^ 2;

    const circulationNumber = tens * 10 + unitDigit;

    if (isNaN(circulationNumber)) return null;

    const line = lineConfig?.line || '??';
    const direction = lineConfig?.dir || 'D';
    const fullName = `${direction}${circulationNumber}`;

    return {
        line,
        direction,
        number: circulationNumber.toString(),
        fullName
    };
};
