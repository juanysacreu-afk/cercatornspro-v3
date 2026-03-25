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

    // --- THE DEFINITIVE SIRTRAN CIRCULATION BREAKTHROUGH ---
    // The FGC system uses positional bitwise XOR operations on specific hex characters
    // to encode the Hundreds, Tens, and Units of the circulation number.
    // Index 5: Hundreds (XOR 7)
    // Index 7: Tens (XOR 3) 
    // Index 9: Units (XOR 2)
    // Example: 6a2dc7ea04 -> H=7, T=a(10), U=4.
    // Hundreds: 7 ^ 7 = 0
    // Tens: 10 ^ 3 = 9
    // Units: 4 ^ 2 = 6
    // Result: 096!

    const hundredsHex = parseInt(ncPart[5], 16);
    const tensHex = parseInt(ncPart[7], 16);
    const unitHex = parseInt(ncPart[9], 16);

    if (isNaN(hundredsHex) || isNaN(tensHex) || isNaN(unitHex)) return null;

    const hundredsDigit = hundredsHex ^ 7;
    const tensDigit = tensHex ^ 3;
    const unitDigit = unitHex ^ 2;

    const circulationNumber = hundredsDigit * 100 + tensDigit * 10 + unitDigit;

    if (isNaN(circulationNumber)) return null;

    // Pad with leading zeros to maintain format "096", "105"
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
