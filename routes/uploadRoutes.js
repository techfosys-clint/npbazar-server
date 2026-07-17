const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const router = express.Router();
const { adminAuth } = require('../middleware/adminAuth');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
        cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`);
    },
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024, files: 6 }, // 5MB per file, up to 6 files per request
    fileFilter: (req, file, cb) => {
        if (ALLOWED.includes(file.mimetype)) cb(null, true);
        else cb(new Error('Only image files are allowed (jpeg, png, webp, gif, avif)'));
    },
});

/**
 * GET /api/upload  (admin)
 * List every uploaded image (newest first) for the media library.
 */
router.get('/', adminAuth, (req, res) => {
    const base = `${req.protocol}://${req.get('host')}`;
    let files = [];
    try {
        files = fs
            .readdirSync(UPLOAD_DIR)
            .map((name) => {
                const stat = fs.statSync(path.join(UPLOAD_DIR, name));
                if (!stat.isFile()) return null;
                return {
                    name,
                    url: `${base}/uploads/${name}`,
                    size: stat.size,
                    createdAt: stat.mtime,
                };
            })
            .filter(Boolean)
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
    res.json({ success: true, files });
});

/**
 * POST /api/upload  (admin)
 * multipart/form-data with one or more files under the field name "images".
 * Returns absolute URLs served from /uploads.
 */
router.post('/', adminAuth, (req, res) => {
    upload.array('images', 6)(req, res, (err) => {
        if (err) {
            return res.status(400).json({ success: false, message: err.message });
        }
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ success: false, message: 'No files uploaded' });
        }
        const base = `${req.protocol}://${req.get('host')}`;
        const urls = req.files.map((f) => `${base}/uploads/${f.filename}`);
        res.status(201).json({ success: true, urls });
    });
});

/**
 * DELETE /api/upload  (admin)  body: { url }
 * Removes a previously uploaded file (only inside the uploads dir).
 */
router.delete('/', adminAuth, (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ success: false, message: 'url is required' });

    const filename = path.basename(String(url));
    const filePath = path.join(UPLOAD_DIR, filename);
    if (!filePath.startsWith(UPLOAD_DIR)) {
        return res.status(400).json({ success: false, message: 'Invalid path' });
    }
    fs.unlink(filePath, () => {
        // Ignore missing-file errors; the goal is that it's gone.
        res.json({ success: true, message: 'File removed' });
    });
});

module.exports = router;
