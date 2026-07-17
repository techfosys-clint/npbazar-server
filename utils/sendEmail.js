const nodemailer = require('nodemailer');

let transporter;

const getTransporter = () => {
    if (!transporter) {
        transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT) || 587,
            secure: process.env.SMTP_SECURE === 'true', // true for 465, false for 587
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
            },
        });
    }
    return transporter;
};

/**
 * Send an email.
 * @param {{ to: string, subject: string, html: string, text?: string, attachments?: Array }} options
 */
const sendEmail = async ({ to, subject, html, text, attachments }) => {
    const from = `"${process.env.SMTP_FROM_NAME || 'Ecomus'}" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`;
    const info = await getTransporter().sendMail({ from, to, subject, html, text, attachments });
    return info;
};

/**
 * Build + send the welcome email delivered to a freshly created admin/staff,
 * containing their login credentials and the admin portal link.
 */
const sendAdminWelcomeEmail = async ({ to, fullName, email, password, role }) => {
    const portal = process.env.ADMIN_PORTAL_URL || '#';
    const roleLabel = role === 'admin' ? 'Admin' : 'Staff';
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 560px; margin: auto; color: #1f2937;">
            <h2 style="color: #111827;">Welcome to Ecomus Admin, ${fullName}!</h2>
            <p>An <strong>${roleLabel}</strong> account has been created for you. Use the credentials below to sign in to the admin portal.</p>
            <table style="border-collapse: collapse; margin: 16px 0;">
                <tr><td style="padding: 6px 12px; background:#f3f4f6;"><strong>Email</strong></td><td style="padding: 6px 12px;">${email}</td></tr>
                <tr><td style="padding: 6px 12px; background:#f3f4f6;"><strong>Password</strong></td><td style="padding: 6px 12px;">${password}</td></tr>
            </table>
            <p>
                <a href="${portal}" style="display:inline-block; background:#111827; color:#fff; padding:10px 20px; border-radius:6px; text-decoration:none;">Open Admin Portal</a>
            </p>
            <p style="color:#6b7280; font-size: 13px;">For your security, please log in and change your password after your first sign-in. Portal link: <a href="${portal}">${portal}</a></p>
        </div>
    `;
    return sendEmail({
        to,
        subject: 'Your Ecomus Admin account is ready',
        html,
        text: `Hello ${fullName}, your ${roleLabel} account is ready.\nEmail: ${email}\nPassword: ${password}\nAdmin portal: ${portal}`,
    });
};

module.exports = { sendEmail, sendAdminWelcomeEmail };
