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
    direction: 'A' | 'D' | 'L' | 'R' | 'S';
    number: string;
    fullName: string;
}

const LINE_MAP: Record<string, { line: string; dir: 'A' | 'D' }> = {
    '6a': { line: 'S1', dir: 'D' },
    '68': { line: 'S2', dir: 'A' },
    '6c': { line: 'S5', dir: 'D' },
    '6f': { line: 'L6', dir: 'D' }, // Confirmed by data cross-reference
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

    // XOR 9 for tens
    const tens = tensHex ^ 9;
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
