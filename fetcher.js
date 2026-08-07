require('dotenv').config();
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');

const args = process.argv.slice(2);
const isScan = args.includes('--scan');
const startIdx = args.indexOf('--start');
const endIdx = args.indexOf('--end');
const startDateStr = startIdx !== -1 ? args[startIdx + 1] : null;
const endDateStr = endIdx !== -1 ? args[endIdx + 1] : null;

const COOKIE = process.env.COOKIE || '';

const INVOICE_DIR = path.join(__dirname, 'invoices');
if (!fs.existsSync(INVOICE_DIR)) {
    fs.mkdirSync(INVOICE_DIR, { recursive: true });
}



function parseDomDate(text) {
    const yearMatch = text.match(/\b(20[1-2][0-9])\b/);
    if (!yearMatch) return null;
    const year = parseInt(yearMatch[1], 10);

    const months = ['jan', 'feb', 'mär', 'mar', 'apr', 'mai', 'may', 'jun', 'jul', 'aug', 'sep', 'okt', 'oct', 'nov', 'dez', 'dec'];
    let monthIdx = -1;
    for (let i = 0; i < months.length; i++) {
        if (new RegExp(months[i], 'i').test(text)) {
            monthIdx = i;
            break;
        }
    }
    
    // Normalize month index
    if (monthIdx === 2 || monthIdx === 3) monthIdx = 2;
    else if (monthIdx === 4) monthIdx = 3;
    else if (monthIdx === 5 || monthIdx === 6) monthIdx = 4;
    else if (monthIdx === 7) monthIdx = 5;
    else if (monthIdx === 8) monthIdx = 6;
    else if (monthIdx === 9) monthIdx = 7;
    else if (monthIdx === 10) monthIdx = 8;
    else if (monthIdx === 11 || monthIdx === 12) monthIdx = 9;
    else if (monthIdx === 13) monthIdx = 10;
    else if (monthIdx === 14 || monthIdx === 15) monthIdx = 11;
    
    const dayMatch = text.match(/\b([0-9]{1,2})\b/);
    if (monthIdx !== -1 && dayMatch) {
        return new Date(Date.UTC(year, monthIdx, parseInt(dayMatch[1], 10)));
    }
    
    // Fallback
    const d = new Date(text);
    if (!isNaN(d.getTime())) return d;
    return null;
}
async function run(isScan = false, startDate = null, endDate = null) {
    const userDataDir = path.join(__dirname, '.auth-profile');
    let context;
    try {
        context = await chromium.launchPersistentContext(userDataDir, { 
            headless: true, // Läuft unsichtbar im Hintergrund
            channel: 'chrome',
            acceptDownloads: true,
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });
    } catch(e) {
        context = await chromium.launchPersistentContext(userDataDir, {
            headless: true,
            acceptDownloads: true
        });
    }
    
    const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
    let result = null;

    if (isScan) {
        result = await scanMode(page);
    } else {
        const startD = new Date(startDate);
        const endD = new Date(endDate);
        if (isNaN(startD.getTime()) || isNaN(endD.getTime())) {
            throw new Error(`Invalid date format. Use YYYY-MM-DD. Got: start=${startDate}, end=${endDate}`);
        }
        result = await downloadMode(page, startD, endD);
    }

    await context.close();
    return result;
}

async function extractTrips(page) {
    return await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a[href^="/trips/"]'));
        const tripSet = new Map();
        for (const link of links) {
            const href = link.getAttribute('href');
            const tripIdMatch = href.match(/\/trips\/([a-zA-Z0-9-]+)/);
            if (tripIdMatch) {
                // Remove lots of whitespace
                const text = link.innerText.replace(/\s+/g, ' ').trim();
                tripSet.set(tripIdMatch[1], text);
            }
        }
        return Array.from(tripSet.entries()).map(([tripId, text]) => ({ tripId, text }));
    });
}

async function clickMoreLoop(page, stopCondition = null) {
    let clickCount = 0;
    while (true) {
        if (stopCondition) {
            const trips = await extractTrips(page);
            if (trips.length > 0 && stopCondition(trips[trips.length - 1])) {
                console.log('Reached stop condition.');
                break;
            }
        }

        try {
            // Find "More", "Mehr", "Weitere", etc.
            const moreBtn = page.locator('button', { hasText: /more|mehr|weitere|load/i }).first();
            const count = await moreBtn.count();
            if (count === 0) {
                break;
            }

            const isVisible = await moreBtn.isVisible();
            const isDisabled = await moreBtn.isDisabled();

            if (!isVisible || isDisabled) {
                break;
            }

            await moreBtn.scrollIntoViewIfNeeded();
            await moreBtn.click({ timeout: 5000 });
            clickCount++;
            console.log(`Clicked 'More' button ${clickCount} time(s)`);
            
            // Wait for network activity or DOM changes
            await page.waitForTimeout(2000);
        } catch (e) {
            // Probably no more button or timeout
            break;
        }
    }
}

async function scanMode(page) {
    console.log('--- SCAN MODE ---');
    console.log('Navigating to trips page...');
    await page.goto('https://riders.uber.com/trips', { waitUntil: 'domcontentloaded', timeout: 60000 });

    await clickMoreLoop(page);

    const trips = await extractTrips(page);
    console.log(`\nFound ${trips.length} total trips.`);

    if (trips.length === 0) {
        console.log("No trips found.");
        return;
    }

    const parsedDates = trips.map(t => ({ trip: t, date: parseDomDate(t.text) })).filter(t => t.date !== null);
    
    if (parsedDates.length > 0) {
        parsedDates.sort((a, b) => a.date - b.date);
        const minDate = parsedDates[0].date.toISOString().split('T')[0];
        const maxDate = parsedDates[parsedDates.length - 1].date.toISOString().split('T')[0];
        console.log(`Earliest Date available: ${minDate} (Trip: ${parsedDates[0].trip.tripId})`);
        console.log(`Latest Date available: ${maxDate} (Trip: ${parsedDates[parsedDates.length - 1].trip.tripId})`);
        return { success: true, earliest: minDate, latest: maxDate, totalTrips: trips.length };
    } else {
        console.log(`Earliest trip entry text: ${trips[trips.length - 1].text}`);
        console.log(`Latest trip entry text: ${trips[0].text}`);
        return { success: true, totalTrips: trips.length };
    }
}

async function downloadMode(page, startDate, endDate) {
    const sDate = startDate.toISOString().split('T')[0];
    const eDate = endDate.toISOString().split('T')[0];
    console.log(`--- DOWNLOAD MODE (${sDate} to ${eDate}) ---`);
    console.log('Collecting trips...');
    await page.goto('https://riders.uber.com/trips', { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Stop clicking "More" when the last trip in the list is older than the start date
    await clickMoreLoop(page, (lastTrip) => {
        const d = parseDomDate(lastTrip.text);
        if (d && d < startDate) {
            return true;
        }
        return false;
    });

    const trips = await extractTrips(page);
    const matchingTrips = trips.filter(t => {
        const d = parseDomDate(t.text);
        if (!d) return true; // If we can't parse it, check it anyway just to be safe
        return d >= startDate && d <= endDate;
    });

    console.log(`Found ${matchingTrips.length} trips in the given date range.`);

    for (const trip of matchingTrips) {
        const url = `https://riders.uber.com/trips/${trip.tripId}`;
        console.log(`Processing trip: ${url}`);
        
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        
        try {
            // Find download button
            // Typical texts: "Rechnung herunterladen", "Download Invoice", "Herunterladen"
            const btnLocator = page.locator('text=/Rechnung herunterladen|Download Invoice/i').first();
            
            const btnCount = await btnLocator.count();
            if (btnCount === 0) {
                console.log(`  -> No invoice download button found.`);
                continue;
            }

            const [download] = await Promise.all([
                page.waitForEvent('download', { timeout: 15000 }),
                btnLocator.click()
            ]);

            const tempPath = await download.path();
            console.log(`  -> Downloaded temporary PDF: ${tempPath}`);

            // Parse PDF
            const dataBuffer = fs.readFileSync(tempPath);
            const pdfData = await pdf(dataBuffer);
            const text = pdfData.text;

            let invoiceNum = 'UNKNOWN-INV';
            const invMatch = text.match(/(?:Rechnungsnummer|Invoice Number|Rechnung)[\s:]*([A-Z0-9-]{6,})/i);
            if (invMatch) {
                invoiceNum = invMatch[1].trim();
            }

            let exactDate = 'YYYY-MM-DD';
            const dtMatch3 = text.match(/([0-9]{4})-([0-9]{2})-([0-9]{2})/); // YYYY-MM-DD
            const dtMatch1 = text.match(/([0-9]{1,2})\.\s*([0-9]{1,2})\.\s*([0-9]{4})/); // DD.MM.YYYY
            const dtMatch2 = text.match(/([0-9]{1,2})\.\s+([a-zA-ZäöüÄÖÜ]+)\s+([0-9]{4})/); // DD. Month YYYY

            if (dtMatch3) {
                exactDate = `${dtMatch3[1]}-${dtMatch3[2]}-${dtMatch3[3]}`;
            } else if (dtMatch1) {
                const d = dtMatch1[1].padStart(2, '0');
                const m = dtMatch1[2].padStart(2, '0');
                const y = dtMatch1[3];
                exactDate = `${y}-${m}-${d}`;
            } else if (dtMatch2) {
                const d = dtMatch2[1].padStart(2, '0');
                const monthStr = dtMatch2[2].toLowerCase();
                const y = dtMatch2[3];
                const months = {
                    'januar': '01', 'februar': '02', 'märz': '03', 'april': '04', 'mai': '05', 'juni': '06',
                    'juli': '07', 'august': '08', 'september': '09', 'oktober': '10', 'november': '11', 'dezember': '12',
                    'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04', 'may': '05', 'jun': '06',
                    'jul': '07', 'aug': '08', 'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12',
                };
                const m = months[monthStr] || '00';
                exactDate = `${y}-${m}-${d}`;
            } else {
                // Fallback to DOM date if we parsed it
                const domD = parseDomDate(trip.text);
                if (domD) {
                    exactDate = domD.toISOString().split('T')[0];
                }
            }

            const newFilename = `Uber-Bv-${exactDate}-${invoiceNum}.pdf`;
            const finalPath = path.join(INVOICE_DIR, newFilename);
            fs.copyFileSync(tempPath, finalPath);
            fs.unlinkSync(tempPath); // Clean up temp file
            
            console.log(`  -> Saved invoice: ${newFilename}`);
        } catch (e) {
            console.log(`  -> Failed to download or parse invoice: ${e.message}`);
        }
    }
    console.log('Done downloading.');
    return { success: true, count: matchingTrips.length };
}

// Wenn die Datei per CLI aufgerufen wird (nicht als Module importiert)
if (require.main === module) {
    const args = process.argv.slice(2);
    const isScanCLI = args.includes('--scan');
    const startIdx = args.indexOf('--start');
    const endIdx = args.indexOf('--end');
    const startDateCLI = startIdx !== -1 ? args[startIdx + 1] : null;
    const endDateCLI = endIdx !== -1 ? args[endIdx + 1] : null;

    if (!isScanCLI && (!startDateCLI || !endDateCLI)) {
        console.error("Usage:");
        console.error("  node fetcher.js --scan");
        console.error("  node fetcher.js --start YYYY-MM-DD --end YYYY-MM-DD");
        process.exit(1);
    }
    
    run(isScanCLI, startDateCLI, endDateCLI).catch(err => {
        console.error('Fatal Error:', err);
        process.exit(1);
    });
} else {
    // Für KI-Agenten: API als Modul exportieren
    module.exports = {
        scan: () => run(true, null, null),
        download: (start, end) => run(false, start, end)
    };
}
