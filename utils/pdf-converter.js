const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

/**
 * Converts a PNG receipt into a standardized, high-resolution A4 PDF document.
 * 
 * @param {Object} options
 * @param {Buffer|string} options.pngInput - Buffer or file path to PNG
 * @param {string} options.outputPath - Destination .pdf file path
 * @param {string} options.orderId - Order/Invoice number
 * @param {string} options.orderDate - Date in YYYY-MM-DD format
 * @param {Object} [options.metadata] - Optional metadata (store, price, etc.)
 * @returns {Promise<string>} - Resolves to the written outputPath
 */
function convertPngToA4Pdf(options) {
  return new Promise((resolve, reject) => {
    const { pngInput, outputPath, orderId, orderDate, metadata = {} } = options;

    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Standard A4 dimensions in points (72 pt / inch)
    const A4_WIDTH = 595.28;
    const A4_HEIGHT = 841.89;
    const MARGIN = 30;

    const maxContentWidth = A4_WIDTH - MARGIN * 2;
    const maxContentHeight = A4_HEIGHT - MARGIN * 2 - 30; // Reserve footer space

    const doc = new PDFDocument({
      size: 'A4',
      margin: MARGIN,
      info: {
        Title: `AliExpress Receipt ${orderId}`,
        Author: metadata.storeName || 'AliExpress Seller',
        Subject: `AliExpress Tax Receipt / Invoice for Order ${orderId}`,
        CreationDate: new Date(),
        Producer: 'BDB Invoice & Recipe Suite',
      }
    });

    const writeStream = fs.createWriteStream(outputPath);
    doc.pipe(writeStream);

    try {
      // Embed PNG image centered and scaled to fit A4 page
      doc.image(pngInput, MARGIN, MARGIN, {
        fit: [maxContentWidth, maxContentHeight],
        align: 'center',
        valign: 'center'
      });

      // Embed clean metadata footer at the bottom
      doc
        .fontSize(8)
        .fillColor('#666666')
        .text(
          `AliExpress Receipt | Order: ${orderId} | Date: ${orderDate} | Amount: ${metadata.totalAmount || '-'} ${metadata.currency || 'EUR'}`,
          MARGIN,
          A4_HEIGHT - 25,
          { align: 'center', width: maxContentWidth }
        );

      doc.end();
    } catch (err) {
      reject(err);
    }

    writeStream.on('finish', () => resolve(outputPath));
    writeStream.on('error', reject);
  });
}

module.exports = {
  convertPngToA4Pdf
};
