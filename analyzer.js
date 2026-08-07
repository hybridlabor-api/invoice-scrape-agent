const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');
const PDFDocument = require('pdfkit');

const INVOICE_DIR = path.join(__dirname, 'invoices');
const OUTPUT_FILE = path.join(__dirname, 'Gesamtauflistung.pdf');

function extractField(text, pattern) {
    const match = text.match(pattern);
    return match ? match[1].trim() : '';
}

async function parseInvoice(filePath) {
    const buffer = fs.readFileSync(filePath);
    const data = await pdf(buffer);
    const text = data.text;

    const rechnungsnummer = extractField(text, /Rechnungsnummer[:\s]+([A-Z0-9]+-[A-Z0-9-]+)/i);
    const rechnungsdatum = extractField(text, /Rechnungsdatum[:\s]+(\d{1,2}\.\d{1,2}\.\d{4})/i);
    const steuerdatum = extractField(text, /Steuerdatum[:\s]+(\d{1,2}\.\d{1,2}\.\d{4})/i) || rechnungsdatum;

    // Nettobetrag
    const nettoMatch = text.match(/Gesamtnettobetrag\s+([\d.,]+)\s*€/i);
    const netto = nettoMatch ? nettoMatch[1].replace('.', '').replace(',', '.') : '0';

    // USt
    const ustMatch = text.match(/Gesamtbetrag USt[^€]*?([\d.,]+)\s*€/i);
    const ust = ustMatch ? ustMatch[1].replace('.', '').replace(',', '.') : '0';

    // Bruttobetrag
    const bruttoMatch = text.match(/Gesamtbetrag\s+([\d.,]+)\s*€/i);
    const brutto = bruttoMatch ? bruttoMatch[1].replace('.', '').replace(',', '.') : '0';

    // USt-Satz
    const ustSatzMatch = text.match(/(\d+)%/);
    const ustSatz = ustSatzMatch ? ustSatzMatch[1] + '%' : '19%';

    // Distanz
    const distanzMatch = text.match(/Distanz[:\s]+([\d.,]+)\s*km/i);
    const distanz = distanzMatch ? distanzMatch[1] + ' km' : '-';

    // Anbieter
    const anbieterMatch = text.match(/im Namen\s*von:\s*\n?\s*(.+)/i);
    const anbieter = anbieterMatch ? anbieterMatch[1].trim() : '';

    return {
        datei: path.basename(filePath),
        rechnungsnummer,
        rechnungsdatum,
        netto: parseFloat(netto) || 0,
        ust: parseFloat(ust) || 0,
        brutto: parseFloat(brutto) || 0,
        ustSatz,
        distanz,
        anbieter
    };
}

async function run() {
    if (!fs.existsSync(INVOICE_DIR)) {
        console.error('❌ Kein invoices/ Ordner gefunden. Bitte erst Rechnungen herunterladen.');
        process.exit(1);
    }

    const files = fs.readdirSync(INVOICE_DIR).filter(f => f.endsWith('.pdf'));
    if (files.length === 0) {
        console.error('❌ Keine PDF-Dateien im invoices/ Ordner.');
        process.exit(1);
    }

    console.log(`📊 Analysiere ${files.length} Rechnungen...\n`);

    const invoices = [];
    for (const file of files) {
        try {
            const inv = await parseInvoice(path.join(INVOICE_DIR, file));
            invoices.push(inv);
            console.log(`  ✅ ${inv.rechnungsnummer} | ${inv.rechnungsdatum} | ${inv.brutto.toFixed(2)}€`);
        } catch(e) {
            console.log(`  ❌ ${file}: ${e.message}`);
        }
    }

    // Sort by date
    invoices.sort((a, b) => {
        const da = a.rechnungsdatum.split('.').reverse().join('-');
        const db = b.rechnungsdatum.split('.').reverse().join('-');
        return da.localeCompare(db);
    });

    // Calculate totals
    const totalNetto = invoices.reduce((s, i) => s + i.netto, 0);
    const totalUst = invoices.reduce((s, i) => s + i.ust, 0);
    const totalBrutto = invoices.reduce((s, i) => s + i.brutto, 0);

    console.log(`\n${'─'.repeat(50)}`);
    console.log(`Rechnungen:    ${invoices.length}`);
    console.log(`Netto gesamt:  ${totalNetto.toFixed(2)} €`);
    console.log(`USt gesamt:    ${totalUst.toFixed(2)} €`);
    console.log(`Brutto gesamt: ${totalBrutto.toFixed(2)} €`);
    console.log(`${'─'.repeat(50)}\n`);

    // Generate PDF summary
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
    const stream = fs.createWriteStream(OUTPUT_FILE);
    doc.pipe(stream);

    // Header
    doc.fontSize(18).font('Helvetica-Bold').text('Uber Rechnungsübersicht', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica').text(
        `Erstellt am ${new Date().toLocaleDateString('de-DE')} | ${invoices.length} Rechnungen | Brutto: ${totalBrutto.toFixed(2)} €`,
        { align: 'center' }
    );
    doc.moveDown(1);

    // Table
    const cols = [
        { label: 'Nr.', width: 25 },
        { label: 'Datum', width: 65 },
        { label: 'Rechnungsnummer', width: 180 },
        { label: 'Netto (€)', width: 65 },
        { label: 'USt (€)', width: 55 },
        { label: 'Brutto (€)', width: 65 },
        { label: 'USt%', width: 35 },
        { label: 'Distanz', width: 55 },
        { label: 'Anbieter', width: 200 }
    ];

    let x = 30;
    let y = doc.y;
    const rowHeight = 18;

    // Header row
    doc.fontSize(8).font('Helvetica-Bold');
    doc.rect(x, y, cols.reduce((s, c) => s + c.width, 0), rowHeight).fill('#333');
    let cx = x;
    for (const col of cols) {
        doc.fillColor('#fff').text(col.label, cx + 3, y + 4, { width: col.width - 6 });
        cx += col.width;
    }
    y += rowHeight;

    // Data rows
    doc.font('Helvetica').fontSize(7).fillColor('#000');
    for (let i = 0; i < invoices.length; i++) {
        if (y > 550) {
            doc.addPage();
            y = 30;
        }

        const inv = invoices[i];
        const bg = i % 2 === 0 ? '#f5f5f5' : '#fff';
        doc.rect(x, y, cols.reduce((s, c) => s + c.width, 0), rowHeight).fill(bg);
        doc.fillColor('#000');

        const values = [
            (i + 1).toString(),
            inv.rechnungsdatum,
            inv.rechnungsnummer,
            inv.netto.toFixed(2),
            inv.ust.toFixed(2),
            inv.brutto.toFixed(2),
            inv.ustSatz,
            inv.distanz,
            inv.anbieter
        ];

        cx = x;
        for (let j = 0; j < cols.length; j++) {
            doc.text(values[j], cx + 3, y + 4, { width: cols[j].width - 6 });
            cx += cols[j].width;
        }
        y += rowHeight;
    }

    // Totals row
    y += 5;
    doc.fontSize(9).font('Helvetica-Bold');
    doc.rect(x, y, cols.reduce((s, c) => s + c.width, 0), rowHeight + 2).fill('#e0e0e0');
    doc.fillColor('#000');
    cx = x;
    doc.text('GESAMT', cx + 3, y + 5, { width: cols[0].width + cols[1].width + cols[2].width - 6 });
    cx += cols[0].width + cols[1].width + cols[2].width;
    doc.text(totalNetto.toFixed(2), cx + 3, y + 5, { width: cols[3].width - 6 });
    cx += cols[3].width;
    doc.text(totalUst.toFixed(2), cx + 3, y + 5, { width: cols[4].width - 6 });
    cx += cols[4].width;
    doc.text(totalBrutto.toFixed(2), cx + 3, y + 5, { width: cols[5].width - 6 });

    doc.end();

    await new Promise(resolve => stream.on('finish', resolve));
    console.log(`✅ Gesamtauflistung erstellt: ${OUTPUT_FILE}`);
    return { success: true, file: OUTPUT_FILE, count: invoices.length, totalBrutto };
}

if (require.main === module) {
    run().catch(err => {
        console.error('Fatal Error:', err);
        process.exit(1);
    });
} else {
    module.exports = { analyze: run };
}
