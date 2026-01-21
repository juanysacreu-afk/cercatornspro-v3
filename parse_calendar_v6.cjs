
const fs = require('fs');

const rawText = fs.readFileSync('calendar_text.txt', 'utf8');
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
    let mode = 'DAYS';
    let currentPair = [0, 1];

    let tokenHistory = [];
    let ignoreUntilOne = false;

    for (let line of lines) {
        const cleanLine = line.replace(/\s+/g, ' ').trim();

        if (cleanLine.includes('Calendari de serveis') && (cleanLine.includes('2026') || cleanLine.includes('20 2 6'))) {
            parsing = true;
        }

        if (cleanLine.includes('4. Festes Locals')) {
            parsing = false;
            flush(daysBuf, codesBuf, currentPair, result);
            daysBuf = []; codesBuf = [];
            continue;
        }

        if (!parsing) continue;
        if (cleanLine.includes('--- Page')) {
            // Flush on page break too safety
            flush(daysBuf, codesBuf, currentPair, result);
            daysBuf = []; codesBuf = [];
            continue;
        }

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

            if (/^\d+$/.test(t)) {
                const val = parseInt(t, 10);

                tokenHistory.push(val);
                if (tokenHistory.length > 3) tokenHistory.shift();

                if (tokenHistory.length === 3 && tokenHistory[0] === 20 && tokenHistory[1] === 2 && tokenHistory[2] === 6) {
                    // Header detected. Flush previous valid data.
                    flush(daysBuf, codesBuf, currentPair, result);
                    daysBuf = [];
                    codesBuf = [];
                    mode = 'DAYS';
                    ignoreUntilOne = true;
                    continue;
                }

                if (ignoreUntilOne) {
                    if (val === 1) {
                        ignoreUntilOne = false;
                    } else {
                        continue;
                    }
                }

                if (val === 2026 || val === 2025 || val === 2027) continue;

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

    // Distribute codes. If codes count matches days count, simple.
    // If not, we might need heuristics.
    // Assuming 1:1 mapping.

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
