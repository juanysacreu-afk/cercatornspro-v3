/**
 * Utility function to decode the FGC Train Unit (UT) from its original hexadecimal string.
 * Example of hex string: "1f2cc5fd027d" -> Series 112, Unit 13 -> "112.13"
 *
 * The logic is primarily based on interpreting the prefix for the series and the
 * final two hexadecimal digits for the unit number within that series.
 *
 * Known prefix → series mapping (from live API data):
 *   1f2cc5fd → 112    1f2cc4fd → 113    1f2cc3fd → 114
 *   1f2cc2fd → 115    1c2cc4fd → 213    1d2cc6e0 → 213x2
 *   1d2dc6e0 → 213x2
 */

const SERIES_MAP: Record<string, string> = {
    '5fd': '112',
    '4fd': '113',
    '3fd': '114',
    '2fd': '115'
};

const TENS_MAP: Record<string, number> = {
    '02': 0,  // 01 to 10
    '03': 10, // 11 to 20
    '00': 20, // 21 to 30
    '01': 30  // 31 to 40
};

export const decodeGeotrenUt = (hexUt?: string | null, tipusUnitat?: string | null): string | null => {
    if (!hexUt || hexUt === 'None' || hexUt.length < 12) return tipusUnitat || null;

    const prefix = hexUt.substring(0, 5).toLowerCase();

    // If it's not the standard FGC UT prefix, we fallback to just the series if available
    if (prefix !== '1f2cc') {
        return tipusUnitat || null;
    }

    // Extract series identifier (3 chars)
    const seriesHex = hexUt.substring(5, 8).toLowerCase();
    const series = SERIES_MAP[seriesHex] || tipusUnitat;

    if (!series) return null;

    // Extract tens block identifier (2 chars)
    const blockHex = hexUt.substring(8, 10).toLowerCase();
    const tens = TENS_MAP[blockHex];

    if (tens === undefined) return series;

    // Extract the final digit for the XOR 4 transformation
    const lastCharHex = hexUt.substring(11).toLowerCase();
    const lastCharDec = parseInt(lastCharHex, 16);

    if (isNaN(lastCharDec)) return series;

    // The definitive "Rule of 4": XOR operation with 4
    let digit = lastCharDec ^ 4;

    // A resulting digit of 0 implies the maximum number of that tens block (e.g., 10, 20)
    if (digit === 0) {
        digit = 10;
    }

    const unitNumber = tens + digit;

    // Safety check for non-existent unit 00
    if (unitNumber <= 0) {
        return series;
    }

    const formattedUnit = unitNumber.toString().padStart(2, '0');
    return `${series}.${formattedUnit}`;
};

