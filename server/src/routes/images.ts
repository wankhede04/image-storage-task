import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { createId } from '@paralleldrive/cuid2';
import { multerUpload, verifyMimeType } from '../middleware/upload';
import { uploadRateLimit } from '../middleware/security';
import { storageService } from '../services/storage';
import { enqueueImageProcessing } from '../services/queue';
import { addClient } from '../services/sse';

const router = Router();


// GET /api/images/events — SSE stream (must be before /:id to avoid param capture)
router.get('/events', (req: Request, res: Response) => {
  const clientId = createId();
  addClient(clientId, res);
});

// GET /api/images — list with optional ?status filter and pagination
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status } = req.query;
    // parseInt('abc') → NaN; || 1 / || 20 guards against NaN
    const pageNum = Math.max(1, parseInt(req.query.page as string) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));

    const where = status
      ? { status: (status as string).toUpperCase() as 'PENDING' | 'ACCEPTED' | 'REJECTED' }
      : {};

    const [images, total] = await Promise.all([
      prisma.image.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      }),
      prisma.image.count({ where }),
    ]);

    const imagesWithUrls = await Promise.all(
      images.map(async (img) => {
        const previewKey = img.s3KeyConverted ?? img.s3KeyOriginal;
        let signedUrl: string | null = null;
        if (img.status !== 'PENDING') {
          signedUrl = await storageService.getSignedUrl(previewKey, 300).catch(() => null);
        }
        return { ...img, signedUrl };
      }),
    );

    res.json({ data: imagesWithUrls, total, page: pageNum, limit: limitNum });
  } catch (err) {
    next(err);
  }
});

// GET /api/images/:id/file — presigned URL redirect for browser preview
router.get('/:id/file', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const image = await prisma.image.findUnique({ where: { id: req.params.id } });
    if (!image) return res.status(404).json({ error: 'Image not found' });

    const previewKey = image.s3KeyConverted ?? image.s3KeyOriginal;
    const url = await storageService.getSignedUrl(previewKey, 300);
    res.redirect(302, url);
  } catch (err) {
    next(err);
  }
});

// GET /api/images/:id — single image detail
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const image = await prisma.image.findUnique({ where: { id: req.params.id } });
    if (!image) return res.status(404).json({ error: 'Image not found' });

    const previewKey = image.s3KeyConverted ?? image.s3KeyOriginal;
    const signedUrl = image.status !== 'PENDING'
      ? await storageService.getSignedUrl(previewKey, 300).catch(() => null)
      : null;

    res.json({ ...image, signedUrl });
  } catch (err) {
    next(err);
  }
});

// POST /api/images — upload
router.post(
  '/',
  uploadRateLimit,
  (req: Request, res: Response, next: NextFunction) => {
    multerUpload(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message ?? 'Upload failed' });
      next();
    });
  },
  verifyMimeType,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const file = req.file!;
      const ext = file.mimetype.split('/')[1].replace('heif', 'heic');
      const imageId = createId();
      const s3KeyOriginal = `images/${imageId}/original.${ext}`;

      const image = await prisma.image.create({
        data: {
          id: imageId,
          originalName: file.originalname,
          s3KeyOriginal,
          format: ext,
          fileSizeBytes: file.size,
          status: 'PENDING',
        },
      });

      try {
        await storageService.putObject(s3KeyOriginal, file.buffer, file.mimetype);
      } catch (err) {
        await prisma.image.update({
          where: { id: imageId },
          data: { status: 'REJECTED', rejectionReasons: ['UPLOAD_FAILED'] },
        });
        return res.status(502).json({ error: 'Storage upload failed. Try again.' });
      }

      try {
        await enqueueImageProcessing({ imageId: image.id, s3KeyOriginal, originalFormat: ext });
      } catch (err) {
        // Redis is down — clean up the S3 object and mark rejected so the row isn't stuck PENDING
        await Promise.allSettled([
          storageService.deletePrefix(`images/${imageId}/`),
          prisma.image.update({
            where: { id: imageId },
            data: { status: 'REJECTED', rejectionReasons: ['PROCESSING_FAILED'] },
          }),
        ]);
        return res.status(502).json({ error: 'Queue unavailable. Try again shortly.' });
      }

      res.status(202).json({
        id: image.id,
        status: image.status,
        originalName: image.originalName,
        createdAt: image.createdAt,
      });
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /api/images/:id
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const image = await prisma.image.findUnique({ where: { id: req.params.id } });
    if (!image) return res.status(404).json({ error: 'Image not found' });

    // Delete S3 objects first — if this fails the DB row still points to valid objects,
    // so the user can retry. The reverse (DB gone, S3 still up) would orphan objects.
    await storageService.deletePrefix(`images/${image.id}/`);
    await prisma.image.delete({ where: { id: req.params.id } });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
