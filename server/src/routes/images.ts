import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';
import { multerUpload, verifyMimeType } from '../middleware/upload';
import { uploadRateLimit } from '../middleware/security';
import { uploadFile, deleteFile, getSignedDownloadUrl } from '../services/storage';
import { enqueueImageProcessing } from '../services/queue';
import { addClient } from '../services/sse';

const router = Router();
const prisma = new PrismaClient();

// GET /api/images/events — SSE stream
router.get('/events', (req: Request, res: Response) => {
  const clientId = createId();
  addClient(clientId, res);
  // Connection stays open; cleanup handled in sse.ts on 'close' event
});

// GET /api/images — list images with optional status filter
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

  // Attach signed URLs for private S3 objects
  const imagesWithUrls = await Promise.all(
    images.map(async (img) => ({
      ...img,
      signedUrl: await getSignedDownloadUrl(img.s3Key),
    })),
  );

  res.json({ data: imagesWithUrls, total, page: pageNum, limit: limitNum });
});

// GET /api/images/:id — single image
router.get('/:id', async (req: Request, res: Response) => {
  const image = await prisma.image.findUnique({ where: { id: req.params.id } });
  if (!image) return res.status(404).json({ error: 'Image not found' });

  const signedUrl = await getSignedDownloadUrl(image.s3Key);
  res.json({ ...image, signedUrl });
});

// POST /api/images — upload
router.post(
  '/',
  uploadRateLimit,
  (req: Request, res: Response, next) => {
    multerUpload(req, res, (err) => {
      if (err) {
        return res.status(400).json({ error: err.message ?? 'Upload failed' });
      }
      next();
    });
  },
  verifyMimeType,
  async (req: Request, res: Response) => {
    const file = req.file!;
    const ext = file.mimetype.split('/')[1].replace('heif', 'heic');
    const s3Key = `uploads/${createId()}.${ext}`;

    const s3Url = await uploadFile(s3Key, file.buffer, file.mimetype);

    const image = await prisma.image.create({
      data: {
        originalName: file.originalname,
        s3Key,
        s3Url,
        format: ext,
        fileSizeBytes: file.size,
        status: 'PENDING',
      },
    });

    await enqueueImageProcessing({
      imageId: image.id,
      s3Key,
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

  await Promise.all([deleteFile(image.s3Key), prisma.image.delete({ where: { id: req.params.id } })]);

  res.status(204).send();
});

export default router;
