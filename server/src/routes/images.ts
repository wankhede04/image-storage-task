import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';
import { multerUpload, verifyMimeType } from '../middleware/upload';
import { uploadRateLimit } from '../middleware/security';
import { storageService } from '../services/storage';
import { enqueueImageProcessing } from '../services/queue';
import { addClient } from '../services/sse';

const router = Router();
const prisma = new PrismaClient();

// GET /api/images/events — SSE stream (must be before /:id to avoid param capture)
router.get('/events', (req: Request, res: Response) => {
  const clientId = createId();
  addClient(clientId, res);
});

// GET /api/images — list with optional ?status filter and pagination
router.get('/', async (req: Request, res: Response) => {
  const { status, page = '1', limit = '20' } = req.query;
  const pageNum = Math.max(1, parseInt(page as string));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit as string)));

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

  // For non-pending images, attach a short-lived signed URL for the preview key
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
});

// GET /api/images/:id/file — presigned URL redirect for browser preview
router.get('/:id/file', async (req: Request, res: Response) => {
  const image = await prisma.image.findUnique({ where: { id: req.params.id } });
  if (!image) return res.status(404).json({ error: 'Image not found' });

  const previewKey = image.s3KeyConverted ?? image.s3KeyOriginal;
  const url = await storageService.getSignedUrl(previewKey, 300);
  res.redirect(302, url);
});

// GET /api/images/:id — single image detail
router.get('/:id', async (req: Request, res: Response) => {
  const image = await prisma.image.findUnique({ where: { id: req.params.id } });
  if (!image) return res.status(404).json({ error: 'Image not found' });

  const previewKey = image.s3KeyConverted ?? image.s3KeyOriginal;
  const signedUrl = image.status !== 'PENDING'
    ? await storageService.getSignedUrl(previewKey, 300).catch(() => null)
    : null;

  res.json({ ...image, signedUrl });
});

// POST /api/images — upload
router.post(
  '/',
  uploadRateLimit,
  (req: Request, res: Response, next) => {
    multerUpload(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message ?? 'Upload failed' });
      next();
    });
  },
  verifyMimeType,
  async (req: Request, res: Response) => {
    const file = req.file!;
    const ext = file.mimetype.split('/')[1].replace('heif', 'heic');

    // Pre-generate ID so the S3 key is based on the same UUID as the DB row
    const imageId = createId();
    const s3KeyOriginal = `images/${imageId}/original.${ext}`;

    // Step 1: INSERT row first so we have a record to mark REJECTED if upload fails
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

    // Step 2: Upload to object storage
    try {
      await storageService.putObject(s3KeyOriginal, file.buffer, file.mimetype);
    } catch (err) {
      await prisma.image.update({
        where: { id: imageId },
        data: { status: 'REJECTED', rejectionReasons: ['UPLOAD_FAILED'] },
      });
      return res.status(502).json({ error: 'Storage upload failed. Try again.' });
    }

    // Step 3: Enqueue validation job
    await enqueueImageProcessing({
      imageId: image.id,
      s3KeyOriginal,
      originalFormat: ext,
    });

    res.status(202).json({
      id: image.id,
      status: image.status,
      originalName: image.originalName,
      createdAt: image.createdAt,
    });
  },
);

// DELETE /api/images/:id
router.delete('/:id', async (req: Request, res: Response) => {
  const image = await prisma.image.findUnique({ where: { id: req.params.id } });
  if (!image) return res.status(404).json({ error: 'Image not found' });

  // deletePrefix removes original + converted in one sweep
  await Promise.all([
    storageService.deletePrefix(`images/${image.id}/`),
    prisma.image.delete({ where: { id: req.params.id } }),
  ]);

  res.status(204).send();
});

export default router;
