const PDFDocument = require('pdfkit');
const Settings = require('../models/Settings');

/** Build a PDF invoice buffer for an order. */
const generateInvoicePdf = async (order) => {
    const settings = await Settings.getSingleton();
    // Standard PDFKit fonts don't support Bengali Unicode, use 'Tk.' as fallback
    const symbol = settings.currencySymbol === '৳' ? 'Tk.' : (settings.currencySymbol || 'Tk.');

    let logoBuffer = null;
    if (settings.logo) {
        try {
            const res = await fetch(settings.logo);
            if (res.ok) {
                logoBuffer = Buffer.from(await res.arrayBuffer());
            }
        } catch (err) {
            console.error('Failed to load logo for invoice:', err.message);
        }
    }

    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        const chunks = [];
        doc.on('data', (c) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // Header
        let yPos = 50;
        if (logoBuffer) {
            try {
                // Insert image with a max height of 35px to keep it nice
                doc.image(logoBuffer, 50, yPos, { height: 35 });
                yPos += 45;
            } catch (err) {
                // Fallback if image format is unsupported by PDFKit
                doc.fontSize(20).font('Helvetica-Bold').text(settings.storeName || 'Ecomus', 50, yPos);
                yPos += 25;
            }
        } else {
            doc.fontSize(20).font('Helvetica-Bold').text(settings.storeName || 'Ecomus', 50, yPos);
            yPos += 25;
        }

        doc.fontSize(9).font('Helvetica').fillColor('#555');
        if (settings.address) {
            doc.text(settings.address, 50, yPos);
            yPos += 12;
        }
        if (settings.phone || settings.email) {
            doc.text([settings.phone, settings.email].filter(Boolean).join('  ·  '), 50, yPos);
        }

        doc.fillColor('#000').fontSize(16).font('Helvetica-Bold').text('INVOICE', 400, 50, { align: 'right' });
        doc.fontSize(9).font('Helvetica').fillColor('#555');
        doc.text(`Invoice #: ${order.orderNumber}`, 400, 75, { align: 'right' });
        doc.text(`Date: ${new Date(order.createdAt).toLocaleDateString()}`, { align: 'right' });
        doc.text(`Payment: ${order.paymentMethod.toUpperCase()} (${order.paymentStatus})`, { align: 'right' });

        doc.moveTo(50, 115).lineTo(545, 115).strokeColor('#ddd').stroke();

        // Bill-to
        doc.fillColor('#000').fontSize(11).font('Helvetica-Bold').text('Bill To', 50, 130);
        doc.fontSize(10).font('Helvetica');
        const addr = order.shippingAddress || {};
        doc.text(addr.fullName || '-', 50, 148);
        doc.text(addr.phone || '', 50, 163);
        const addrLine = [addr.addressLine, addr.area, addr.city, addr.postalCode].filter(Boolean).join(', ');
        if (addrLine) doc.text(addrLine, 50, 178, { width: 300 });

        // Items table
        let y = 230;
        doc.font('Helvetica-Bold').fontSize(10);
        doc.text('Item', 50, y);
        doc.text('Qty', 330, y, { width: 40, align: 'right' });
        doc.text('Price', 380, y, { width: 70, align: 'right' });
        doc.text('Total', 460, y, { width: 85, align: 'right' });
        y += 16;
        doc.moveTo(50, y).lineTo(545, y).strokeColor('#ddd').stroke();
        y += 10;

        doc.font('Helvetica').fontSize(10);
        order.items.forEach((item) => {
            const label = item.variant instanceof Map && item.variant.size > 0
                ? `${item.name} (${Array.from(item.variant.entries()).map(([k, v]) => `${k}: ${v}`).join(', ')})`
                : item.name;
            doc.text(label, 50, y, { width: 270 });
            doc.text(String(item.quantity), 330, y, { width: 40, align: 'right' });
            doc.text(`${symbol}${item.price.toLocaleString()}`, 380, y, { width: 70, align: 'right' });
            doc.text(`${symbol}${(item.price * item.quantity).toLocaleString()}`, 460, y, { width: 85, align: 'right' });
            y += 20;
        });

        y += 10;
        doc.moveTo(300, y).lineTo(545, y).strokeColor('#ddd').stroke();
        y += 12;

        const row = (label, value, bold = false) => {
            doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 12 : 10);
            doc.text(label, 350, y, { width: 110, align: 'right' });
            doc.text(value, 460, y, { width: 85, align: 'right' });
            y += bold ? 20 : 16;
        };
        row('Subtotal', `${symbol}${order.subtotal.toLocaleString()}`);
        if (order.discount > 0) row(`Discount${order.couponCode ? ` (${order.couponCode})` : ''}`, `-${symbol}${order.discount.toLocaleString()}`);
        row('Shipping', `${symbol}${order.shippingCost.toLocaleString()}`);
        row('Total', `${symbol}${order.total.toLocaleString()}`, true);

        doc.fontSize(8).fillColor('#999').text('Thank you for your order!', 50, 780, { align: 'center', width: 495 });

        doc.end();
    });
};

/** HTML email body used when emailing the invoice to the customer. */
const invoiceEmailHtml = (order, settings) => {
    const symbol = settings.currencySymbol || '৳';
    const rows = order.items
        .map(
            (i) => `<tr>
                <td style="padding:8px 0;border-bottom:1px solid #eee;">${i.name} × ${i.quantity}</td>
                <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;">${symbol}${(i.price * i.quantity).toLocaleString()}</td>
            </tr>`
        )
        .join('');

    return `
        <div style="font-family: Arial, sans-serif; max-width: 560px; margin: auto; color: #1f2937;">
            <h2 style="color:#111827;">Invoice from ${settings.storeName || 'Ecomus'}</h2>
            <p>Hi ${order.shippingAddress?.fullName || 'there'}, thank you for your order! Here is your invoice for <strong>${order.orderNumber}</strong>.</p>
            <table style="width:100%;border-collapse:collapse;margin:16px 0;">
                ${rows}
                <tr><td style="padding:8px 0;"><strong>Subtotal</strong></td><td style="padding:8px 0;text-align:right;">${symbol}${order.subtotal.toLocaleString()}</td></tr>
                ${order.discount > 0 ? `<tr><td style="padding:8px 0;color:#059669;">Discount</td><td style="padding:8px 0;text-align:right;color:#059669;">-${symbol}${order.discount.toLocaleString()}</td></tr>` : ''}
                <tr><td style="padding:8px 0;">Shipping</td><td style="padding:8px 0;text-align:right;">${symbol}${order.shippingCost.toLocaleString()}</td></tr>
                <tr><td style="padding:10px 0;border-top:2px solid #111827;"><strong>Total</strong></td><td style="padding:10px 0;border-top:2px solid #111827;text-align:right;"><strong>${symbol}${order.total.toLocaleString()}</strong></td></tr>
            </table>
            <p style="color:#6b7280;font-size:13px;">The full invoice is attached as a PDF.</p>
        </div>
    `;
};

module.exports = { generateInvoicePdf, invoiceEmailHtml };
