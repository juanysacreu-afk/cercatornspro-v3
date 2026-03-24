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
    '6c': { line: 'L7', dir: 'D' },  // TBD
    '6f': { line: 'L6', dir: 'A' },  // Sarrià → A
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

    let tens = 0;

    // Decoding tens block
    if (lineId === '6f') {
        // L6 Logic
        // In the 6e block, '2' -> 11 (13 - 2)
        // In the 7e block, 'b' -> 18 (29 - 11)
        const block = ncPart.slice(4, 6); // '6e' or '7e'
        if (block === '6e') {
            tens = 13 - tensHex;
        } else if (block === '7e') {
            tens = 29 - tensHex; // Assuming A084 was a typo for A184
        } else {
            tens = 13 - tensHex; // Fallback
        }
    } else {
        // S1, S2 Logic (6a, 68)
        // 7 -> 14 (21-7), 6 -> 15 (21-6), 5 -> 16 (21-5)
        tens = 21 - tensHex;
    }

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
