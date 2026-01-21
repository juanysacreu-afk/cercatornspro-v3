
const fs = require('fs');

const text = fs.readFileSync('calendar_text.txt', 'utf8');

const MONTHS = [
    'GENER', 'FEBRER', 'MARÇ', 'ABRIL', 'MAIG', 'JUNY',
    'JULIOL', 'AGOST', 'SETEMBRE', 'OCTUBRE', 'NOVEMBRE', 'DESEMBRE'
];

// Map of Month Name -> Index
const MONTH_MAP = {};
MONTHS.forEach((m, i) => MONTH_MAP[m] = i);

function normalizeCode(code) {
    // Ensure string of 3 digits
    if (typeof code !== 'string') code = code.toString();
    if (code.length < 3) code = code.padStart(3, '0');

    if (code.length !== 3) return null;
    // Rule: take first char + "00".
    // Special cases: if user wants specific handling. User said: "504" -> "500". "101" -> "100".
    // "003" -> "000".
    // So: ch[0] + '00'.
    return code[0] + '00';
}

function parse() {
    // Tokenize everything
    // Replace pipes with spaces, split by spaces
    const tokens = text.replace(/\|/g, ' ')
        .split(/\s+/)
        .map(t => t.trim())
        .filter(t => t.length > 0);

    const result = {}; // "YYYY-MM-DD": Code

    let currentPair = [0, 1]; // Default start

    // Heuristic: Detecting structure
    // We collect days in `daysBuf` and codes in `codesBuf`.
    // When we see a Day after seeing Codes, we flush.

    let daysBuf = [];
    let codesBuf = [];
    let mode = 'DAYS'; // 'DAYS' or 'CODES'

    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        const upper = t.toUpperCase();

        // Check for Month Names to update Pair
        // We expect months to appear in pairs in text, e.g. "GENER" ... "FEBRER"
        // Or just headers.
        // If we see a month name, we can try to guess the pair.
        if (MONTH_MAP.hasOwnProperty(upper)) {
            // It's a month.
            // If we see GENER, maybe we reset or set pair.
            // The headers are usually "GENER FEBRER".
            // Look ahead or behind?
            // Let's rely on the order of pages/headers we saw.
            // Page 3: GENER FEBRER and MARÇ ABRIL
            // Page 4: MAIG JUNY, JULIOL AGOST, SETEMBRE OCTUBRE, NOVEMBRE DESEMBRE

            // We can maintain a "found months" list and pair them up.
            // But simpler: just update `currentPair` when we see a pair of months close to each other?
            // Or simply: If we see `GENER`, pair=[0,1]. If `MARÇ`, pair=[2,3].
            if (upper === 'GENER') currentPair = [0, 1];
            else if (upper === 'MARÇ') currentPair = [2, 3];
            else if (upper === 'MAIG') currentPair = [4, 5];
            else if (upper === 'JULIOL') currentPair = [6, 7];
            else if (upper === 'SETEMBRE') currentPair = [8, 9];
            else if (upper === 'NOVEMBRE') currentPair = [10, 11];

            // If we see a month name, we should probably FLUSH any existing buffers if they are partial?
            // No, sometimes Month name appears inside headers.
            // Just continue.
            continue;
        }

        // Check if it's a number
        if (/^\d+$/.test(t)) {
            const val = parseInt(t, 10);

            // Distinguish Day vs Code vs Year
            // Year 2026
            if (val === 2026 || val === 2025 || val === 2027) continue;

            // Codes are strings in PDF, usually 3 digits. '000' is 0.
            // But token '000' becomes int 0. '003' becomes 3.
            // We should inspect the original string `t`.

            const isCode = (t.length === 3 && val >= 0) || val >= 100;
            // '000' length 3. '100' len 3. '31' len 2.
            // '1' len 1.
            // Risk: '001' vs '1'? Codes are always 3 chars in PDF if parsed correctly?
            // In text file: `000` `100`.
            // `1` `2` `3`.

            if (isCode) {
                // It's a code
                if (mode === 'DAYS') {
                    mode = 'CODES'; // switch to collecting codes
                }
                codesBuf.push(t); // keep string to preserve '000'
            } else if (val >= 1 && val <= 31) {
                // It's a day
                if (mode === 'CODES') {
                    // We were collecting codes, now back to days -> FLUSH
                    flush(daysBuf, codesBuf, currentPair, result);
                    daysBuf = [];
                    codesBuf = [];
                    mode = 'DAYS';
                }
                daysBuf.push(val);
            }
        }
    }

    // Final flush
    flush(daysBuf, codesBuf, currentPair, result);

    console.log(JSON.stringify(result, null, 2));
}

function flush(days, codes, pair, result) {
    if (days.length === 0 || codes.length === 0) return;

    // Logic to split days into Month A and Month B
    // Sequence of days: Ascending, then reset.
    // Example: 1 2 3 4 1

    // Find reset index
    let splitIdx = days.length; // default all to first month
    for (let k = 0; k < days.length - 1; k++) {
        if (days[k + 1] < days[k] && days[k + 1] === 1) { // strict reset to 1 usually?
            splitIdx = k + 1;
            break;
        } else if (days[k + 1] < days[k]) {
            // e.g. 31 -> 25? Unlikely. 
            splitIdx = k + 1;
            break;
        }
    }

    // What if NOT reset? e.g. 29 30 31.
    // Then all belong to Month A? Or Month B?
    // If we have EQUAL days and codes, we map 1:1.
    // But each (Day,Code) pair belongs to Month A or B.
    // How to know?
    // Heuristic: If we haven't seen a reset in this block, check if values continue from previous flush?
    // Too complex.
    // Simpler: The columns are separate in the PDF.
    // `days` array here is likely `[d_A1, d_A2, ..., d_B1, d_B2...]` ONLY if they were on the same line.
    // But my tokenizer flattens everything.
    // In the PDF extraction, stream usually follows:
    // Row 1 Days (Col A, Col B) -> Row 1 Codes.
    // So `daysBuf` will contain `Col A days` + `Col B days`.
    // `codesBuf` will contain `Col A codes` + `Col B codes`.
    // So yes, `splitIdx` should work.

    // If no split (increasing seq), and length is large?
    // Wait, if line is `29 30 31 | 27 28` (end of months).
    // Days: 29 30 31 27 28. Reset detected (31->27).
    // If line is `30 31 | ` (Month B finished earlier).
    // Days: 30 31. No reset.
    // Do they belong to A or B?
    // Usually A (left column).

    // What if ` | 29 30`? (Month A finished earlier).
    // Days: 29 30. No reset.
    // Should belong to B.
    // How to distinguish?
    // Maybe look at values?
    // If last block ended with A:28 and B:28.
    // Current block: 29 30.
    // A continues? B continues?
    // This is hard without state.
    // But in this specific calendar, usually they align well.
    // Let's assume if no split, it belongs to A (First Month).
    // Exception: If the days buffer is small?

    const daysA = days.slice(0, splitIdx);
    const daysB = days.slice(splitIdx);

    // Codes should match counts?
    // Codes might be split similarly? 
    // No, codes don't have numeric order to detect split.
    // We assume codes count matches days count for A and B.

    const codesA = codes.slice(0, daysA.length);
    const codesB = codes.slice(daysA.length);

    // Process A
    addToResult(result, pair[0], daysA, codesA);
    // Process B
    addToResult(result, pair[1], daysB, codesB);
}

function addToResult(result, monthIdx, days, codes) {
    for (let k = 0; k < days.length; k++) {
        const d = days[k];
        const c = codes[k];
        if (!c) continue;
        const norm = normalizeCode(c);

        // YYYY-MM-DD
        const mStr = (monthIdx + 1).toString().padStart(2, '0');
        const dStr = d.toString().padStart(2, '0');
        result[`2026-${mStr}-${dStr}`] = norm;
    }
}

parse();
