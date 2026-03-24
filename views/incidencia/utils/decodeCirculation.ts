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

    let tens = 0;

    // FGC utilizes a hex countdown for tens:
    // 14-17 (K=21): T=7,6,5,4 -> 14,15,16,17
    // 18-19 (K=29): T=b,a -> 18,19
    // 20-23 (K=23): T=3,2,1,0 -> 20,21,22,23
    
    // There is a known conflict: T=2 is used for 11 (A116) in L6, but for 21 (e.g. D212) in S1/S2.
    if (tensHex === 2) {
        tens = (lineId === '6f') ? 11 : 21; // 6f = L6 (A), others get 21.
    } else if (tensHex === 3) {
        tens = 20; // B201, D202, etc. (Verified)
    } else if (tensHex === 1) {
        tens = 22; // D229 (Verified)
    } else if (tensHex === 0) {
        tens = 23; // F230, etc. (Verified)
    } else if (tensHex === 4) {
        tens = 17; // L171 (Verified)
    } else if (tensHex === 5) {
        tens = 16; // D162 (Verified)
    } else if (tensHex === 6) {
        tens = 15; // D151 (Verified)
    } else if (tensHex === 7) {
        tens = 14; // D140 (Verified)
    } else if (tensHex === 10) { // a
        tens = 19; // D192, B194 (Verified)
    } else if (tensHex === 11) { // b
        tens = 18; // A184 (Verified)
    } else {
        // Safe fallbacks for extremely high/low unseen numbers
        const FALLBACK_MAP: Record<number, number> = {
            8: 24, 9: 25, 12: 26, 13: 27, 14: 28, 15: 29
        };
        tens = FALLBACK_MAP[tensHex] || 0;
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
