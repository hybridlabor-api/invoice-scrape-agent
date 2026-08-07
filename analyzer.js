const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const PDFDocument = require('pdfkit');
const { GoogleGenAI } = require('@google/genai');
const dotenv = require('dotenv');

dotenv.config();

if (!process.env.GEMINI_API_KEY) {
    console.error("Error: GEMINI_API_KEY environment variable is missing.");
    process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const invoicesDir = path.join(process.cwd(), 'invoices');
const outputPdfPath = path.join(process.cwd(), 'Gesamtauflistung.pdf');

async function extractDataFromPdf(pdfPath) {
    try {
        const dataBuffer = fs.readFileSync(pdfPath);
        const data = await pdfParse(dataBuffer);
        const text = data.text;

        const prompt = `
Extract the following information from the Uber invoice text below. 
Return ONLY a raw JSON object with the keys: 
"totalPrice" (number, representing the total price), 
"vat" (number, representing the VAT amount), 
"route" (string, start and end destination), 
"date" (string, format YYYY-MM-DD), 
"invoiceNumber" (string).

If a value is not found, use null.
Do not include markdown blocks like \`\`\`json. Just output the raw JSON object.

Text:
${text}
`;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: "OBJECT",
                    properties: {
                        totalPrice: { type: "NUMBER", description: "Total price of the ride" },
                        vat: { type: "NUMBER", description: "VAT amount" },
                        route: { type: "STRING", description: "Start and end destination" },
                        date: { type: "STRING", description: "Date of the ride (YYYY-MM-DD)" },
                        invoiceNumber: { type: "STRING", description: "Invoice number" }
                    },
                    required: ["totalPrice", "vat", "route", "date", "invoiceNumber"]
                }
            }
        });

        const jsonStr = response.text;
        return JSON.parse(jsonStr);

    } catch (error) {
        console.error(`Error processing ${pdfPath}: `, error.message);
        return null;
    }
}

async function analyzeInvoices() {
    if (!fs.existsSync(invoicesDir)) {
        console.error(`Invoices directory not found at ${invoicesDir}`);
        return;
    }

    const files = fs.readdirSync(invoicesDir).filter(f => f.toLowerCase().endsWith('.pdf'));
    if (files.length === 0) {
        console.log("No PDF files found in invoices directory.");
        return;
    }

    const extractedData = [];

    console.log(`Found ${files.length} invoice(s). Starting extraction...`);
    for (const file of files) {
        const pdfPath = path.join(invoicesDir, file);
        console.log(`Processing ${file}...`);
        const data = await extractDataFromPdf(pdfPath);
        if (data) {
            extractedData.push(data);
        }
    }

    if (extractedData.length === 0) {
        console.log("No data could be extracted from the invoices.");
        return;
    }

    // Aggregation
    let totalSpent = 0;
    let totalVat = 0;
    const spendingPerMonth = {};

    extractedData.forEach(item => {
        const price = item.totalPrice || 0;
        totalSpent += price;
        totalVat += item.vat || 0;

        if (item.date) {
            // Extract YYYY-MM
            const month = item.date.substring(0, 7);
            if (!spendingPerMonth[month]) {
                spendingPerMonth[month] = 0;
            }
            spendingPerMonth[month] += price;
        }
    });

    // Generate PDF
    await generateSummaryPdf(extractedData, totalSpent, totalVat, spendingPerMonth);
}

function generateSummaryPdf(trips, totalSpent, totalVat, spendingPerMonth) {
    return new Promise((resolve, reject) => {
        try {
            console.log("Generating summary PDF...");
            const doc = new PDFDocument({ margin: 50 });
            const writeStream = fs.createWriteStream(outputPdfPath);
            doc.pipe(writeStream);

            // Header
            doc.fontSize(20).text('Uber Invoices Summary (Gesamtauflistung)', { align: 'center' });
            doc.moveDown();

            // Totals
            doc.fontSize(14).text('Overall Summary', { underline: true });
            doc.moveDown(0.5);
            doc.fontSize(12).text(`Total Spent: ${totalSpent.toFixed(2)}`);
            doc.text(`Total VAT: ${totalVat.toFixed(2)}`);
            doc.moveDown();

            // Monthly breakdown
            doc.fontSize(14).text('Spending Per Month', { underline: true });
            doc.moveDown(0.5);
            const months = Object.keys(spendingPerMonth).sort();
            months.forEach(month => {
                doc.fontSize(12).text(`${month}: ${spendingPerMonth[month].toFixed(2)}`);
            });
            doc.moveDown();

            // Trip list
            doc.fontSize(14).text('List of Trips', { underline: true });
            doc.moveDown(0.5);

            trips.forEach((trip, index) => {
                doc.fontSize(12).font('Helvetica-Bold').text(`Trip ${index + 1}: ${trip.date || 'Unknown Date'}`);
                doc.font('Helvetica').text(`Invoice Number: ${trip.invoiceNumber || 'N/A'}`);
                doc.text(`Route: ${trip.route || 'N/A'}`);
                
                const priceText = trip.totalPrice !== null && trip.totalPrice !== undefined ? trip.totalPrice.toFixed(2) : 'N/A';
                const vatText = trip.vat !== null && trip.vat !== undefined ? trip.vat.toFixed(2) : 'N/A';
                
                doc.text(`Price: ${priceText} (VAT: ${vatText})`);
                doc.moveDown(0.5);
            });

            doc.end();

            writeStream.on('finish', () => {
                console.log(`Summary PDF generated successfully at ${outputPdfPath}`);
                resolve();
            });

            writeStream.on('error', (err) => {
                console.error("Error writing PDF:", err);
                reject(err);
            });
        } catch (error) {
            console.error("Error generating PDF:", error);
            reject(error);
        }
    });
}

analyzeInvoices().catch(console.error);
