
import fs from 'fs/promises';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

// Point to the standard font path
const standardFontDataUrl = './node_modules/pdfjs-dist/standard_fonts/';

async function extractText() {
    const data = await fs.readFile('./Calendari Servei 2026.pdf');
    const uint8Array = new Uint8Array(data);

    // Load the document
    const loadingTask = pdfjsLib.getDocument({
        data: uint8Array,
        standardFontDataUrl,
        disableFontFace: true,
    });

    const doc = await loadingTask.promise;
    console.log(`PDF loaded, pages: ${doc.numPages}`);

    for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        // Filter out empty strings if needed, but keeping them might preserve layout structure
        const strings = content.items.map(item => item.str);
        console.log(`--- Page ${i} ---`);
        console.log(strings.join('|'));
    }
}

extractText().catch(console.error);
