/**
 * Utility function to decode the FGC Train Unit (UT) from its original hexadecimal string.
 * Example of hex string: "1f2cc5fd027d" -> Series 112, Unit 13 -> "112.13"
 *
 * The logic is primarily based on interpreting the prefix for the series and the
 * final two hexadecimal digits for the unit number within that series.
 */
export const decodeGeotrenUt = (hexUt?: string | null): string | null => {
    if (!hexUt) return null;

    // Series mapping based on the first 8 characters
    let series = '';
    const prefix = hexUt.substring(0, 8).toLowerCase();

    switch (prefix) {
        case '1f2cc5fd':
            series = '112';
            break;
        case '1f2cc4fd':
            series = '113';
            break;
        case '1f2cc3fd':
            series = '114';
            break;
        case '1f2cc2fd':
            series = '115';
            break;
        case '1c2cc4fd':
            series = '213';
            break;
        default:
            // If the prefix is unknown, return the hex or a generic value
            return null;
    }

    // Extract the unit number from the last 2 characters
    const suffixHex = hexUt.slice(-2);
    const suffixDecimal = parseInt(suffixHex, 16);

    // General pattern: decimal value - 112 = unit number
    let unitNumber = suffixDecimal - 112;

    // Handle edge cases where unit numbering might loop or offset differently
    // Valid unit numbers generally start at 1. If it's negative or strangely high,
    // it might be a different encoding or a placeholder.
    if (unitNumber <= 0 || isNaN(unitNumber)) {
        return null; // Could not decode predictably
    }

    // Ensure it's two digits
    const formattedUnit = unitNumber.toString().padStart(2, '0');

    return `${series}.${formattedUnit}`;
};
