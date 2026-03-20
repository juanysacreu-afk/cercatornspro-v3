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

/**
 * Map of known hex prefixes (first 8 chars) to their series string
 */
const PREFIX_TO_SERIES: Record<string, string> = {
    '1f2cc5fd': '112',
    '1f2cc4fd': '113',
    '1f2cc3fd': '114',
    '1f2cc2fd': '115',
    '1c2cc4fd': '213',
    '1d2cc6e0': '213x2',
    '1d2dc6e0': '213x2',
};

/**
 * Fleet configuration with max units and possible decoding offsets
 * Based on user confirmation:
 * - Series 112: 1F2CC5FD027D -> 112.13 (Base 112, so 0x7D (125) - 112 = 13)
 * - Series 113: 1F2CC4FD0270 -> 113.04 (Base 108, so 0x70 (112) - 108 = 4)
 */
const FLEET_CONFIG: Record<string, { max: number; base: number }> = {
    '112': { max: 22, base: 112 }, // 0x7D (125) - 112 = 13
    '113': { max: 19, base: 108 }, // 0x70 (112) - 108 = 4
    '114': { max: 5, base: 115 },  // Guessing based on valid units 1-5
    '115': { max: 15, base: 112 }, // Assuming same as 112
    '213': { max: 42, base: 112 },
};

export const decodeGeotrenUt = (hexUt?: string | null, tipusUnitat?: string | null): string | null => {
    if (!hexUt || hexUt === 'None' || hexUt.length < 12) return tipusUnitat || null;

    const prefix = hexUt.substring(0, 8).toLowerCase();
    const series = PREFIX_TO_SERIES[prefix] || tipusUnitat;

    if (!series) return null;

    const config = FLEET_CONFIG[series];
    const suffixHex = hexUt.slice(-2);
    const suffixDecimal = parseInt(suffixHex, 16);

    if (isNaN(suffixDecimal) || !config) return series;

    // Calculate unit number based on series-specific base
    let unitNumber = suffixDecimal - config.base;

    // Handle potential page shifts for Byte 5 (02, 03)
    // If unitNumber is outside the valid range 1..max, try shifting
    const byte5 = parseInt(hexUt.substring(8, 10), 16);
    if (byte5 === 3) {
        // Page 3 usually adds an offset if it was outside range
        if (unitNumber <= 0 || unitNumber > config.max) {
             // Try a logic where 03 page starts higher
             // For now, let's keep it simple as we don't have many 03 data points
        }
    }

    // Validation: 00 does not exist, must be within fleet size
    if (unitNumber <= 0 || unitNumber > config.max) {
        // If the calculation gives an invalid unit, fallback to just the series
        // This prevents showing fake units like 114.07 or 113.00
        return series;
    }

    const formattedUnit = unitNumber.toString().padStart(2, '0');
    return `${series}.${formattedUnit}`;
};

