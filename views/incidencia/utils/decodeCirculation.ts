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

    // --- THE SIRTRAN CIRCULATION BREAKTHROUGH ---
    // The FGC system uses a bitwise XOR 3 operation on the hex character to encode the LAST DIGIT of the circulation tens.
    // e.g. T=7 -> 7^3 = 4 (tens 14). T=a(10) -> 10^3 = 9 (tens 19).
    const lastDigitOfTens = tensHex ^ 3;

    // Use the 'mid' string (characters 4 to 6 of ncPart) to determine the exact hundred/tens base.
    // Observed mappings: 'c7e' -> 09x (S1), 19x (L7/L6). 'c6e' -> 10x (S1), 20x (L7).
    const mid = ncPart.slice(4, 7);
    let baseTens = 10;

    if (lineId === '6a' || lineId === '68') {
        // S1, S2 (D, F)
        if (mid === 'c8e') baseTens = -10; // For future proofing (if needed)
        else if (mid === 'c7e') baseTens = 0;   // 09x
        else if (mid === 'c6e') baseTens = 10;  // 10x, 16x
        else if (mid === 'c5e') baseTens = 20;  // 20x, 22x
        else if (mid === 'c4e') baseTens = 30;
    } else if (lineId === '6c' || lineId === '6f' || lineId === '62') {
        // L7 (B), L6 (A), L12 (L)
        if (mid === 'c8e') baseTens = 0;   // 0xx
        else if (mid === 'c7e') baseTens = 10;  // 11x, 19x
        else if (mid === 'c6e') baseTens = 20;  // 20x, 26x
        else if (mid === 'c5e') baseTens = 30;
    }

    const tens = baseTens + lastDigitOfTens;

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
