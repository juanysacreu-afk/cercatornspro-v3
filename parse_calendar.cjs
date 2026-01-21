
const fs = require('fs');

const text = fs.readFileSync('calendar_text.txt', 'utf8');

// Define page structure based on observation
// Page 3: JAN/FEB, MAR/APR
// Page 4: MAY/JUN, JUL/AUG, SEP/OCT, NOV/DEC

// Standardize Months
const MONTHS = [
    'GENER', 'FEBRER', 'MARÇ', 'ABRIL', 'MAIG', 'JUNY',
    'JULIOL', 'AGOST', 'SETEMBRE', 'OCTUBRE', 'NOVEMBRE', 'DESEMBRE'
];

// Helper to normalize code
function normalizeCode(code) {
    if (!code || code.length !== 3) return null;
    return code[0] + '00';
}

function parse() {
    const lines = text.split('\n');
    let currentMonthPair = null; // [MonthIdx1, MonthIdx2] (0-based)
    // We'll hardcode the flow based on pages if needed, but let's try to detect
    // or just hardcode the sequence of pairs since we know the layout.

    // The layout is roughly:
    // Page 3 starts with JAN/FEB (implied or explicit)
    // Then MAR/APR
    // Page 4 starts with MAY/JUN
    // Then JUL/AUG
    // Then SEP/OCT
    // Then NOV/DEC

    // Actually, we can just process lines and fill buckets.
    // We need to match lines of numbers with lines of codes.

    let numberAndCodeLines = [];

    // Clean lines: remove empty pipes, trim
    const cleanLines = lines.map(l => {
        // Replace | with space, remove non-alphanumeric chars except space
        // Actually keep structure
        return l.replace(/\|/g, ' ').trim();
    }).filter(l => l.length > 0);

    // We will iterate and try to identify number lines and code lines
    // A number line contains mostly 1-31 numbers.
    // A code line contains 3-digit codes (and maybe letters/spaces).

    const isNumberLine = (str) => {
        const parts = str.split(/\s+/).filter(x => /^\d+$/.test(x));
        if (parts.length === 0) return false;
        // Check if they look like days (1-31)
        return parts.every(p => parseInt(p) >= 1 && parseInt(p) <= 31);
    };

    const isCodeLine = (str) => {
        const parts = str.split(/\s+/).filter(x => /^\d{3}$/.test(x));
        if (parts.length < 2) return false; // Need at least a few codes
        return true;
    };

    const map = {}; // "M-D": Code

    // Strategy:
    // Define the pairs sequence
    const pairs = [
        [0, 1], // JAN, FEB
        [2, 3], // MAR, APR
        [4, 5], // MAY, JUN
        [6, 7], // JUL, AUG
        [8, 9], // SEP, OCT
        [10, 11] // NOV, DEC
    ];

    let pairIdx = 0;

    // Custom iterator
    let i = 0;
    while (i < cleanLines.length && pairIdx < pairs.length) {
        const line = cleanLines[i];

        // Check if we switched page or section
        // We can rely on detecting "Page X" headers to reset or verify
        if (line.includes('--- Page')) {
            i++; continue;
        }

        // Heuristics to skip headers
        if (line.includes('Calendari') || line.includes('FGC') || line.includes('Ordre de Servei')) {
            i++; continue;
        }

        // Check if line is a number line
        if (isNumberLine(line)) {
            // Look ahead for code line
            let j = i + 1;
            while (j < cleanLines.length && !isCodeLine(cleanLines[j]) && (cleanLines[j].trim() === '' || isNumberLine(cleanLines[j]) === false)) {
                j++; // skip garbage between numbers and codes? unlikely
                // Actually, sometimes number lines are adjacent? No.
                // Usually NumberLine immediately followed by CodeLine
                if (j > i + 5) break; // safety
            }

            if (j < cleanLines.length && isCodeLine(cleanLines[j])) {
                // We found a pair: Line i (numbers) and Line j (codes)
                const numLine = cleanLines[i];
                const codeLine = cleanLines[j];

                const nums = numLine.split(/\s+/).filter(x => /^\d+$/.test(x)).map(Number);
                const codes = codeLine.split(/\s+/).filter(x => /^\d{3}$/.test(x));

                if (nums.length === codes.length) {
                    // Identify split between Month A and Month B
                    // Find where number sequence resets (e.g. ... 4 1 ...)
                    let splitIdx = -1;
                    for (let k = 0; k < nums.length - 1; k++) {
                        if (nums[k + 1] < nums[k]) {
                            splitIdx = k + 1;
                            break;
                        }
                    }

                    const currentPair = pairs[pairIdx];

                    if (splitIdx !== -1) {
                        // Split detected
                        const numsA = nums.slice(0, splitIdx);
                        const codesA = codes.slice(0, splitIdx);
                        const numsB = nums.slice(splitIdx);
                        const codesB = codes.slice(splitIdx);

                        addToMap(map, currentPair[0], numsA, codesA);
                        addToMap(map, currentPair[1], numsB, codesB);
                    } else {
                        // No split, belongs to one month?
                        // Or maybe only one month is remaining in this row?
                        // Usually it's strictly interleaved columns.
                        // If no split is found, it might be that one column ended.
                        // But which one?
                        // Wait, looking at the layout: "27 28 29 30 31 | 24 25 26 27 28". (Example)
                        // Split happens.
                        // What if "30 31"? (End of Jan, Feb already done).
                        // Then no split.
                        // We need to track *current day* expected?
                        // Or just assume if no split, it belongs to Month A (left)?
                        // Or maybe logic: if text mentions 'GENER' matching headers...
                        // Let's assume if no split, it belongs to the FIRST month of the pair
                        // UNLESS the numbers are clearly a continuation of the second month?
                        // Actually, the columns are visual.
                        // If we have parsed Days 1..28 for Jan and 1..28 for Feb.
                        // Next row: 29 30 31 (Jan) and (empty).
                        // We will see "29 30 31". No reset.
                        // Should assign to Jan.
                        // So assign to Pair[0].

                        // Check if we are near end of Month A?
                        // It's safer to check context but for now assume Pair[0].
                        addToMap(map, currentPair[0], nums, codes);
                    }

                }
                i = j + 1; // Advance past code line

                // HEURISTIC to advance month pair
                // If we see '30' or '31' for Month A, and '28/30/31' for Month B, we might be done with this pair.
                // Actually, simply count the lines or look for Month headers.
                // "GENER | FEBRER" line usually appears explicitly.
                // We can scan for month names to switch pairIdx.
            } else {
                i++;
            }
        } else {
            // Check for month names to switch pair
            const upper = line.toUpperCase();
            // Check if line contains a Pair Start
            // e.g. "MAIG" and "JUNY"

            let foundPairIdx = -1;
            for (let p = 0; p < pairs.length; p++) {
                const m1 = MONTHS[pairs[p][0]];
                const m2 = MONTHS[pairs[p][1]];
                if (upper.includes(m1) && upper.includes(m2)) {
                    foundPairIdx = p;
                    break;
                }
            }

            if (foundPairIdx !== -1) {
                pairIdx = foundPairIdx;
            }
            i++;
        }
    }

    // Generate output
    const result = {};
    for (const key in map) {
        // Key is "MonthIdx-Day"
        const [m, d] = key.split('-').map(Number);
        // Format to YYYY-MM-DD
        const monthStr = (m + 1).toString().padStart(2, '0');
        const dayStr = d.toString().padStart(2, '0');
        result[`2026-${monthStr}-${dayStr}`] = map[key];
    }

    console.log(JSON.stringify(result, null, 2));
}

function addToMap(map, monthIdx, nums, codes) {
    for (let k = 0; k < nums.length; k++) {
        const day = nums[k];
        const rawCode = codes[k];
        const norm = normalizeCode(rawCode);
        map[`${monthIdx}-${day}`] = norm;
    }
}

parse();
