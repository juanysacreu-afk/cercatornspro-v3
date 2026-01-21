
const fs = require('fs');

const text = fs.readFileSync('calendar_text.txt', 'utf8');

const MONTHS = [
    'GENER', 'FEBRER', 'MARÇ', 'ABRIL', 'MAIG', 'JUNY',
    'JULIOL', 'AGOST', 'SETEMBRE', 'OCTUBRE', 'NOVEMBRE', 'DESEMBRE'
];

const MONTH_MAP = {};
MONTHS.forEach((m, i) => MONTH_MAP[m] = i);

function normalizeCode(code) {
    if (typeof code !== 'string') code = code.toString();
    if (code.length < 3) code = code.padStart(3, '0');
    if (code.length !== 3) return null;
    return code[0] + '00';
}

function parse() {
    const lines = text.split('\n');
    const result = {};

    let parsing = false;
    let daysBuf = [];
    let codesBuf = [];
    let mode = 'DAYS';
    let currentPair = [0, 1];

    for (let line of lines) {
        // Check start condition
        if (line.includes('Calendari de serveis per a l’any 2026') || line.includes('Calendari de serveis any 2026')) {
            parsing = true;
            // Continue to process this line as it might contain the first grid row
        }

        // Check stop condition (headers/footers inside pages?)
        // "4. Festes Locals"
        if (line.includes('4. Festes Locals')) {
            parsing = false;
            // Flush whatever we have
            flush(daysBuf, codesBuf, currentPair, result);
            daysBuf = []; codesBuf = [];
            continue;
        }

        if (!parsing) continue;

        // Remove page breaks strings if any left
        if (line.includes('--- Page')) continue;
        if (line.includes('Ordre de Servei')) continue; // Skip header repetition if any

        // Tokenize line
        const tokens = line.replace(/\|/g, ' ')
            .split(/\s+/)
            .map(t => t.trim())
            .filter(t => t.length > 0);

        for (let t of tokens) {
            const upper = t.toUpperCase();
            if (MONTH_MAP.hasOwnProperty(upper)) {
                // Month detected. Update pair.
                if (upper === 'GENER') currentPair = [0, 1];
                else if (upper === 'MARÇ') currentPair = [2, 3];
                else if (upper === 'MAIG') currentPair = [4, 5];
                else if (upper === 'JULIOL') currentPair = [6, 7];
                else if (upper === 'SETEMBRE') currentPair = [8, 9];
                else if (upper === 'NOVEMBRE') currentPair = [10, 11];
                continue;
            }

            if (/^\d+$/.test(t)) {
                const val = parseInt(t, 10);
                // Ignore Year
                if (val === 2026 || val === 2025) continue;

                const isCode = val >= 100; // Codes are >= 100 usually. 000??
                // Wait, '000' is a code.
                // But '000' might lose leading zeros in `t` if not careful?
                // `t` is string. `000` matches `^\d+$`.
                // `isCode` logic: t.length === 3 || val >= 100.
                // '000' length is 3.
                const looksLikeCode = (t.length === 3 && val >= 0);

                if (looksLikeCode) {
                    if (mode === 'DAYS') mode = 'CODES';
                    codesBuf.push(t);
                } else if (val >= 1 && val <= 31) {
                    // Day
                    if (mode === 'CODES') {
                        flush(daysBuf, codesBuf, currentPair, result);
                        daysBuf = [];
                        codesBuf = [];
                        mode = 'DAYS';
                    }
                    daysBuf.push(val);
                }
            }
        }
    }
    // Final flush
    flush(daysBuf, codesBuf, currentPair, result);

    console.log(JSON.stringify(result, null, 2));
}

function flush(days, codes, pair, result) {
    if (days.length === 0 || codes.length === 0) return;

    // Split Logic
    let splitIdx = days.length;
    for (let k = 0; k < days.length - 1; k++) {
        if (days[k + 1] < days[k] && days[k + 1] === 1) {
            splitIdx = k + 1;
            break;
        }
    }

    const daysA = days.slice(0, splitIdx);
    const daysB = days.slice(splitIdx);
    const codesA = codes.slice(0, daysA.length);
    const codesB = codes.slice(daysA.length);

    addToResult(result, pair[0], daysA, codesA);
    addToResult(result, pair[1], daysB, codesB);
}

function addToResult(result, monthIdx, days, codes) {
    for (let k = 0; k < days.length; k++) {
        const d = days[k];
        const c = codes[k];
        if (!c) continue;
        const norm = normalizeCode(c);
        const mStr = (monthIdx + 1).toString().padStart(2, '0');
        const dStr = d.toString().padStart(2, '0');
        result[`2026-${mStr}-${dStr}`] = norm;
    }
}

parse();
