
const fs = require('fs');

const rawText = fs.readFileSync('calendar_text.txt', 'utf8');
// Clean globally first
const text = rawText.replace(/\|/g, ' ');

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
    let mode = 'DAYS'; // 'DAYS' or 'CODES'
    let currentPair = [0, 1];

    for (let line of lines) {
        // Normalization makes spaces consistent
        const cleanLine = line.replace(/\s+/g, ' ').trim();

        // Check start and stop based on clean text
        if (cleanLine.includes('Calendari de serveis per a l’any 2026') || cleanLine.includes('Calendari de serveis any 2026')) {
            parsing = true;
            // Reset just in case
            daysBuf = []; codesBuf = [];
            // Do not continue, process this line! It contains the first row of data often.
        }

        if (cleanLine.includes('4. Festes Locals')) {
            parsing = false;
            flush(daysBuf, codesBuf, currentPair, result);
            daysBuf = []; codesBuf = [];
            continue;
        }

        if (!parsing) continue;
        if (cleanLine.includes('--- Page')) continue;

        const tokens = cleanLine.split(' ');

        for (let t of tokens) {
            if (!t) continue;
            const upper = t.toUpperCase();

            if (MONTH_MAP.hasOwnProperty(upper)) {
                if (upper === 'GENER') currentPair = [0, 1];
                else if (upper === 'MARÇ') currentPair = [2, 3];
                else if (upper === 'MAIG') currentPair = [4, 5];
                else if (upper === 'JULIOL') currentPair = [6, 7];
                else if (upper === 'SETEMBRE') currentPair = [8, 9];
                else if (upper === 'NOVEMBRE') currentPair = [10, 11];
                continue;
            }

            // Parse numbers
            // Strict check: must be digits only?
            // "3." -> "3." in token.
            if (/^\d+$/.test(t)) {
                const val = parseInt(t, 10);
                // Ignore Year
                if (val === 2026 || val === 2025 || val === 2027) continue;

                // Code: 3 digits. Day: <= 31.
                // Ambiguity: 010 (Code) vs 10 (Day).
                // Codes usually > 31. Exception "000".
                // Length check is good.
                // "1" (len 1) -> Day.
                // "000" (len 3, val 0) -> Code.
                // "100" (len 3, val 100) -> Code.
                // "31" (len 2) -> Day.

                let isCode = false;
                let isDay = false;

                if (t.length === 3 && val >= 0) isCode = true;
                else if (val >= 1 && val <= 31) isDay = true;

                if (isCode) {
                    if (mode === 'DAYS') mode = 'CODES';
                    codesBuf.push(t);
                } else if (isDay) {
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

    flush(daysBuf, codesBuf, currentPair, result);
    console.log(JSON.stringify(result, null, 2));
}

function flush(days, codes, pair, result) {
    if (days.length === 0 || codes.length === 0) return;

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
