
// utils/serviceCalendar.ts

const CALENDAR_EXCEPTIONS: Record<string, string> = {
    "2026-01-01": "500", // New Year
    "2026-01-02": "100",
    "2026-01-03": "400",
    "2026-01-04": "500",
    "2026-01-05": "100",
    "2026-01-06": "500", // Reis
    "2026-01-07": "0",
    "2026-01-08": "0",
    "2026-01-09": "0",
    "2026-01-10": "400",
    "2026-01-30": "100",
    "2026-01-31": "400",
    "2026-02-01": "500",
    "2026-03-01": "400", // Extracted as 400
    "2026-05-01": "100",
};

// Extracted from PDF (Subset for safety)
const EXTRACTED_DATA: Record<string, string> = {
    "2026-01-06": "500",
    "2026-01-30": "100",
    "2026-01-31": "400",
    "2026-02-01": "500",
    "2026-03-03": "500",
    "2026-03-24": "500",
    "2026-03-28": "500",
    "2026-04-05": "100",
    "2026-04-06": "400",
    "2026-04-07": "500",
    "2026-05-31": "500"
};

export const getServiceForDate = (date: Date): string => {
    const y = date.getFullYear();
    const m = date.getMonth() + 1;
    const d = date.getDate();
    const key = `${y}-${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;

    // Use Extracted/Specific data first
    if (EXTRACTED_DATA[key]) return EXTRACTED_DATA[key] === '000' ? '0' : EXTRACTED_DATA[key];
    if (CALENDAR_EXCEPTIONS[key]) return CALENDAR_EXCEPTIONS[key];

    // Fallback to Standard Weekly Cycle
    const day = date.getDay(); // 0=Sun, 6=Sat

    if (day === 0) return '500'; // Sunday
    if (day === 6) return '400'; // Saturday
    if (day === 5) return '100'; // Friday
    return '0'; // Mon-Thu
};

export const getServiceToday = (): string => {
    return getServiceForDate(new Date());
};
