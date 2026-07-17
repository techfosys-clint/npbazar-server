const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function getKey() {
    const hex = process.env.CREDENTIALS_ENCRYPTION_KEY;
    if (!hex || hex.length !== 64) {
        throw new Error('CREDENTIALS_ENCRYPTION_KEY must be set in .env as a 32-byte hex string (64 hex chars)');
    }
    return Buffer.from(hex, 'hex');
}

// Fails fast on boot rather than on first encrypt/decrypt call.
const KEY = getKey();

// Encrypts any JSON-serializable value into a single `iv:authTag:ciphertext` hex string.
function encrypt(data) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
    const plaintext = JSON.stringify(data);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`;
}

// Reverses encrypt() and JSON.parses the result back into its original shape.
function decrypt(stored) {
    const [ivHex, authTagHex, ciphertextHex] = String(stored).split(':');
    if (!ivHex || !authTagHex || !ciphertextHex) {
        throw new Error('Malformed encrypted payload');
    }
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    const plaintext = Buffer.concat([
        decipher.update(Buffer.from(ciphertextHex, 'hex')),
        decipher.final(),
    ]).toString('utf8');
    return JSON.parse(plaintext);
}

module.exports = { encrypt, decrypt };
