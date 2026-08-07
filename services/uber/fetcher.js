require('dotenv').config();
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');

const rootInvoices = path.join(__dirname, '../../invoices/uber');
const INVOICE_DIR = rootInvoices;
if (!fs.existsSync(INVOICE_DIR)) {
    fs.mkdirSync(INVOICE_DIR, { recursive: true });
}

const monthMap = {
    'jan': 0, 'feb': 1, 'mär': 2, 'mar': 2, 'apr': 3,
    'mai': 4, 'may': 4, 'jun': 5, 'jul': 6, 'aug': 7,
    'sep': 8, 'okt': 9, 'oct': 9, 'nov': 10, 'dez': 11, 'dec': 11
};

function parseMonthDay(subtitle) {
    if (!subtitle) return null;
    const match = subtitle.match(/(\d{1,2})\.\s*([A-Za-zäöüÄÖÜ]+)\.?\s*[•·]/);
    if (!match) return null;
    const day = parseInt(match[1], 10);
    const monthStr = match[2].toLowerCase().substring(0, 3);
    const month = monthMap[monthStr];
    if (month === undefined) return null;
    return { month, day };
}

// Activities come from API newest-first. Walk through them and track year changes.
function assignYears(activities) {
    const now = new Date();
    let currentYear = now.getFullYear();
    let lastMonth = now.getMonth();

    for (const act of activities) {
        const md = parseMonthDay(act.subtitle);
        if (!md) { act._date = null; continue; }

        // If the month jumps forward (e.g. from March to November), we crossed into the previous year
        if (md.month > lastMonth + 1) {
            currentYear--;
        }
        lastMonth = md.month;
        act._date = new Date(Date.UTC(currentYear, md.month, md.day));
    }
}

function parseSubtitleDate(subtitle) {
    // Fallback for standalone use
    if (!subtitle) return null;
    const md = parseMonthDay(subtitle);
    if (!md) return null;
    const now = new Date();
    let year = now.getFullYear();
    const candidate = new Date(Date.UTC(year, md.month, md.day));
    if (candidate > now) year--;
    return new Date(Date.UTC(year, md.month, md.day));
}


async function createContext() {
    const rootProfile = path.join(__dirname, '../../.auth-profile');
    const localProfile = path.join(__dirname, '.auth-profile');
    const userDataDir = fs.existsSync(rootProfile) ? rootProfile : (fs.existsSync(localProfile) ? localProfile : rootProfile);
    let context;
    try {
        context = await chromium.launchPersistentContext(userDataDir, {
            headless: false,
            channel: 'chrome',
            acceptDownloads: true
        });
    } catch(e) {
        context = await chromium.launchPersistentContext(userDataDir, {
            headless: false,
            acceptDownloads: true
        });
    }
    return context;
}

async function collectActivities(page) {
    const allActivities = [];

    page.on('response', async (response) => {
        if (response.url().includes('/graphql') && response.request().method() === 'POST') {
            try {
                const body = await response.json();
                if (body?.data?.activities?.past?.activities) {
                    allActivities.push(...body.data.activities.past.activities);
                }
            } catch(e) {}
        }
    });

    console.log('Navigating to trips page...');
    await page.goto('https://riders.uber.com/trips', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(5000);

    // Login check
    if (page.url().includes('auth') || await page.locator('input[name="email"]').count() > 0) {
        console.error("\n❌ FEHLER: Du bist nicht eingeloggt!");
        console.error("Bitte führe 'node auth.js' erneut aus.\n");
        process.exit(1);
    }

    // Click all "More" buttons to load all trips
    let clickCount = 0;
    while (true) {
        try {
            const moreBtn = page.locator('button', { hasText: /more|mehr|weitere|load/i }).first();
            if (await moreBtn.count() === 0) break;
            if (!await moreBtn.isVisible()) break;
            await moreBtn.scrollIntoViewIfNeeded();
            await moreBtn.click({ timeout: 5000 });
            clickCount++;
            process.stdout.write(`\rLade weitere Fahrten... (${clickCount}x)`);
            await page.waitForTimeout(2500);
        } catch(e) { break; }
    }
    if (clickCount > 0) console.log();

    // Deduplicate by UUID
    const uniqueMap = new Map();
    for (const act of allActivities) {
        if (act.uuid && !uniqueMap.has(act.uuid)) {
            uniqueMap.set(act.uuid, act);
        }
    }
    return Array.from(uniqueMap.values());
}

async function run(isScan = false, startDate = null, endDate = null) {
    const context = await createContext();
    const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

    try {
        const activities = await collectActivities(page);
        assignYears(activities);
        console.log(`\n✅ ${activities.length} Fahrten gefunden.\n`);

        if (isScan) {
            return await scanMode(activities);
        } else {
            const startD = new Date(startDate);
            const endD = new Date(endDate);
            if (isNaN(startD.getTime()) || isNaN(endD.getTime())) {
                throw new Error(`Ungültiges Datumsformat. Nutze YYYY-MM-DD. Erhalten: start=${startDate}, end=${endDate}`);
            }
            return await downloadMode(page, activities, startD, endD);
        }
    } finally {
        await context.close();
    }
}

function scanMode(activities) {
    console.log('--- SCAN MODE ---');

    const parsed = activities.filter(a => a._date !== null);
    parsed.sort((a, b) => a._date - b._date);

    if (parsed.length > 0) {
        const minDate = parsed[0]._date.toISOString().split('T')[0];
        const maxDate = parsed[parsed.length - 1]._date.toISOString().split('T')[0];
        console.log(`Frühestes Datum: ${minDate}`);
        console.log(`Letztes Datum:   ${maxDate}`);
        console.log(`Fahrten gesamt:  ${activities.length}`);
        return { success: true, earliest: minDate, latest: maxDate, totalTrips: activities.length };
    }

    console.log(`Fahrten gesamt: ${activities.length} (Daten konnten nicht geparst werden)`);
    return { success: true, totalTrips: activities.length };
}

async function downloadMode(page, activities, startDate, endDate) {
    const sDate = startDate.toISOString().split('T')[0];
    const eDate = endDate.toISOString().split('T')[0];
    console.log(`--- DOWNLOAD MODE (${sDate} bis ${eDate}) ---`);

    const matching = activities.filter(a => {
        if (!a._date) return false;
        return a._date >= startDate && a._date <= endDate;
    });

    console.log(`${matching.length} Fahrten im Zeitraum gefunden.\n`);

    let downloaded = 0;
    for (const act of matching) {
        const tripUrl = act.cardURL || `https://riders.uber.com/trips/${act.uuid}`;
        const dateStr = act.subtitle || '';
        const price = act.description || '';
        console.log(`[${downloaded + 1}/${matching.length}] ${dateStr} | ${act.title} | ${price}`);

        await page.goto(tripUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(3000);

        try {
            const btnLocator = page.locator('text=/Rechnung herunterladen|Download Invoice/i').first();
            const btnCount = await btnLocator.count();
            if (btnCount === 0) {
                console.log(`  → Keine Rechnung verfügbar (storniert/kostenlos?)`);
                continue;
            }

            async function savePdf(dl) {
                const tempPath = await dl.path();
                const dataBuffer = fs.readFileSync(tempPath);
                const pdfData = await pdf(dataBuffer);
                const text = pdfData.text;

                let invoiceNum = 'UNKNOWN';
                const invMatch = text.match(/Rechnungsnummer[:\s]+([A-Z0-9]+-[A-Z0-9-]+)/i) ||
                                 text.match(/Invoice\s*(?:Number|ID)[:\s]+([A-Z0-9-]+)/i);
                if (invMatch) invoiceNum = invMatch[1].trim();

                let exactDate = parseSubtitleDate(dateStr);
                let dateForFile = exactDate ? exactDate.toISOString().split('T')[0] : 'UNKNOWN-DATE';

                const steuerMatch = text.match(/Steuerdatum[:\s]+(\d{1,2})\.(\d{1,2})\.(\d{4})/i);
                const rechnungMatch = text.match(/Rechnungsdatum[:\s]+(\d{1,2})\.(\d{1,2})\.(\d{4})/i);
                
                if (steuerMatch) {
                    dateForFile = `${steuerMatch[3]}-${steuerMatch[2].padStart(2,'0')}-${steuerMatch[1].padStart(2,'0')}`;
                } else if (rechnungMatch) {
                    dateForFile = `${rechnungMatch[3]}-${rechnungMatch[2].padStart(2,'0')}-${rechnungMatch[1].padStart(2,'0')}`;
                } else {
                    const dtMatch = text.match(/([0-9]{1,2})\.([0-9]{1,2})\.([0-9]{4})/);
                    if (dtMatch) {
                        dateForFile = `${dtMatch[3]}-${dtMatch[2].padStart(2,'0')}-${dtMatch[1].padStart(2,'0')}`;
                    }
                }

                const newFilename = `Uber-Bv-${dateForFile}-${invoiceNum}.pdf`;
                const yearMonth = dateForFile.substring(0, 7);
                const subfolder = path.join(INVOICE_DIR, yearMonth);
                if (!fs.existsSync(subfolder)) fs.mkdirSync(subfolder, { recursive: true });
                const finalPath = path.join(subfolder, newFilename);
                fs.copyFileSync(tempPath, finalPath);
                try { fs.unlinkSync(tempPath); } catch(e) {}

                console.log(`  ✅ Gespeichert: ${newFilename}`);
                downloaded++;
            }

            // Attempt direct download with 4s timeout
            let directDownload = null;
            try {
                const [dl] = await Promise.all([
                    page.waitForEvent('download', { timeout: 4000 }),
                    btnLocator.click()
                ]);
                directDownload = dl;
            } catch(e) {
                // If timed out, modal likely opened
            }

            if (directDownload) {
                await savePdf(directDownload);
            } else {
                // Check for multi-invoice modal dialog
                await page.waitForTimeout(1000);
                const modalLocator = page.locator('text=/Rechnungen herunterladen|Es sind mehrere Rechnungen verfügbar|Download Invoices/i');
                const isModalOpen = (await modalLocator.count()) > 0 && (await modalLocator.first().isVisible().catch(() => false));

                if (isModalOpen) {
                    const radios = page.locator('input[type="radio"], [role="radio"]');
                    const radioCount = await radios.count();
                    console.log(`  ℹ️ Fahrt hat ${radioCount} Rechnungen im Dialog gefunden. Lade alle Belege herunter...`);

                    for (let r = 0; r < radioCount; r++) {
                        // If modal was closed from previous download, reopen it
                        if (!await modalLocator.first().isVisible().catch(() => false)) {
                            await btnLocator.click();
                            await page.waitForTimeout(1500);
                        }

                        const radio = radios.nth(r);
                        await radio.click({ force: true });
                        await page.waitForTimeout(500);

                        const submitBtn = page.locator('button', { hasText: /Herunterladen|Download/i }).filter({ hasNotText: /Rechnung herunterladen/i }).last();

                        try {
                            const [modalDl] = await Promise.all([
                                page.waitForEvent('download', { timeout: 12000 }),
                                submitBtn.click()
                            ]);
                            await savePdf(modalDl);
                        } catch(mErr) {
                            console.log(`    ⚠️ Fehler beim Herunterladen von Rechnung ${r + 1}: ${mErr.message}`);
                        }
                        await page.waitForTimeout(1000);
                    }
                } else {
                    console.log(`  ⚠️ Kein Download-Event und kein Dialog erkannt.`);
                }
            }
        } catch (e) {
            console.log(`  ❌ Fehler: ${e.message}`);
        }
    }

    console.log(`\n✅ ${downloaded} Rechnungen heruntergeladen nach: ${INVOICE_DIR}`);
    return { success: true, count: downloaded };
}

if (require.main === module) {
    const args = process.argv.slice(2);
    const isScan = args.includes('--scan');
    const startIdx = args.indexOf('--start');
    const endIdx = args.indexOf('--end');
    const startDateCLI = startIdx !== -1 ? args[startIdx + 1] : null;
    const endDateCLI = endIdx !== -1 ? args[endIdx + 1] : null;

    if (!isScan && (!startDateCLI || !endDateCLI)) {
        console.error("Usage:");
        console.error("  node fetcher.js --scan");
        console.error("  node fetcher.js --start YYYY-MM-DD --end YYYY-MM-DD");
        process.exit(1);
    }

    run(isScan, startDateCLI, endDateCLI).catch(err => {
        console.error('Fatal Error:', err);
        process.exit(1);
    });
} else {
    module.exports = {
        scan: () => run(true, null, null),
        download: (start, end) => run(false, start, end)
    };
}
