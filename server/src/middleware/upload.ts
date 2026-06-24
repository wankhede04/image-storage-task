import multer from 'multer';
import { Request, Response, NextFunction } from 'express';

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/heic', 'image/heif']);
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

export const multerUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    // First gate: check declared MIME type (quick reject before buffering)
    const declaredOk =
      ALLOWED_MIME_TYPES.has(file.mimetype) ||
      file.originalname.toLowerCase().match(/\.(jpg|jpeg|png|heic)$/) !== null;

    if (!declaredOk) {
      return cb(new Error('INVALID_FORMAT'));
    }
    cb(null, true);
  },
}).single('image');

// Second gate: verify actual magic bytes after Multer buffers the file
export async function verifyMimeType(req: Request, res: Response, next: NextFunction) {
  if (!req.file) {
    return res.status(400).json({ error: 'No file provided' });
  }

  const { fileTypeFromBuffer } = await import('file-type');
  const detected = await fileTypeFromBuffer(req.file.buffer);
  if (!detected || !ALLOWED_MIME_TYPES.has(detected.mime)) {
    return res.status(400).json({
      error: 'Invalid file type. Only JPEG, PNG, and HEIC images are accepted.',
    });
  }

  // Normalize MIME to the detected type (trust magic bytes, not declaration)
  req.file.mimetype = detected.mime;
  next();
}
