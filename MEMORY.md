# Aragon — Build Memory & Handoff Log

> This file is the single source of truth for any model picking up this project.
> Update it after every completed step before committing.

---

## Project Overview

A fullstack image upload & validation platform.

- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **Backend**: Node.js + Express + TypeScript
- **ORM**: Prisma
- **Database**: PostgreSQL (Docker)
- **Queue**: BullMQ + Redis (Docker)
- **Storage**: AWS S3
- **Image processing**: Sharp (HEIC conversion, blur, resolution)
- **Face detection**: @vladmandic/face-api + @tensorflow/tfjs-node
- **Real-time**: Server-Sent Events (SSE)

---

## Architecture Summary

```
Client (React) ──POST /api/images──► Express
                                       │
                              Multer + MIME check
                                       │
                              Upload original ──► AWS S3
                                       │
                              Prisma INSERT (status=PENDING)
                                       │
                              BullMQ.add('process-image')
                                       │
                              return 202 { id, status: 'PENDING' }

BullMQ Worker ──►  Download from S3
                   Convert HEIC → JPEG (if needed)
                   Run validation pipeline:
                     1. format.ts      — MIME magic bytes
                     2. resolution.ts  — min 500×500, 50KB
                     3. blur.ts        — Laplacian variance < 100
                     4. face.ts        — count faces, check face/image ratio
                     5. similarity.ts  — aHash Hamming distance vs ACCEPTED images
                   UPDATE image (status + rejectionReasons + phash)
                   SSE broadcast → all connected clients

Client (SSE) ──► EventSource('/api/images/events')
                 On message: update card status in-place
```

---

## Validation Rules

| Check | File | Logic |
|---|---|---|
| Format | `validation/format.ts` | `file-type` magic bytes; allow jpeg/png/heic |
| Resolution | `validation/resolution.ts` | width≥500, height≥500, size≥50KB |
| Blur | `validation/blur.ts` | Laplacian variance of grayscale pixels < BLUR_THRESHOLD |
| Face count | `validation/face.ts` | 0 faces → NO_FACE; >1 → MULTIPLE_FACES |
| Face size | `validation/face.ts` | faceArea/imageArea < FACE_AREA_MIN_RATIO → FACE_TOO_SMALL |
| Similarity | `validation/similarity.ts` | aHash Hamming distance ≤ SIMILARITY_HAMMING_THRESHOLD vs ACCEPTED images |

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| POST | /api/images | Upload image → enqueue processing |
| GET | /api/images | List all (`?status=accepted\|rejected\|pending`) |
| GET | /api/images/:id | Single image |
| DELETE | /api/images/:id | Delete image + S3 object |
| GET | /api/images/events | SSE stream for real-time status updates |

---

## Database Schema (Prisma)

```prisma
model Image {
  id               String      @id @default(cuid())
  originalName     String
  s3Key            String      @unique
  s3Url            String
  format           String
  fileSizeBytes    Int
  width            Int?
  height           Int?
  status           ImageStatus @default(PENDING)
  rejectionReasons String[]
  phash            String?
  createdAt        DateTime    @default(now())
  updatedAt        DateTime    @updatedAt

  @@index([status])
  @@index([phash])
}

enum ImageStatus { PENDING  ACCEPTED  REJECTED }
```

---

## Environment Variables

See `.env.example` for all required variables. Copy to `.env` and fill in AWS credentials.

---

## Build Steps & Status

| # | Step | Status | Commit |
|---|---|---|---|
| 1 | Monorepo root: package.json, .gitignore, .env.example, docker-compose.yml, MEMORY.md | ✅ Done | `chore: init monorepo root` |
| 2 | Server scaffold: package.json, tsconfig, directory structure | ⬜ Pending | — |
| 3 | Client scaffold: Vite + React + Tailwind + shadcn/ui | ⬜ Pending | — |
| 4 | Prisma schema + migration | ⬜ Pending | — |
| 5 | Server: storage service (S3) | ⬜ Pending | — |
| 6 | Server: middleware (Multer, security) | ⬜ Pending | — |
| 7 | Server: BullMQ queue + SSE service | ⬜ Pending | — |
| 8 | Server: validation pipeline (all 5 validators) | ⬜ Pending | — |
| 9 | Server: BullMQ worker (imageProcessor) | ⬜ Pending | — |
| 10 | Server: REST routes + SSE endpoint | ⬜ Pending | — |
| 11 | Server: app.ts wiring | ⬜ Pending | — |
| 12 | Client: hooks (useUpload, useSSE) | ⬜ Pending | — |
| 13 | Client: components (DropZone, ImageCard, Gallery) | ⬜ Pending | — |
| 14 | Client: App.tsx wiring | ⬜ Pending | — |
| 15 | Integration verification | ⬜ Pending | — |

---

## Key Decisions & Rationale

- **aHash for similarity**: 8×8 average hash via Sharp. Simple, zero extra deps, effective for perceptual duplicates.
- **@vladmandic/face-api**: Pure JS TF.js-based face detection. No cloud API, works offline, no extra cost.
- **SSE over WebSockets**: Simpler server-side (native Express), unidirectional (server→client is all we need).
- **BullMQ over in-process**: Async validation (blur, face detection) is CPU-heavy; queue isolates it from request loop.
- **Prisma over Knex**: Better TypeScript DX, type-safe queries, migration tooling.
- **Compare similarity only vs ACCEPTED**: Prevents a blurry upload from poisoning the hash index.

---

## How to Resume

1. Read this file first
2. Check "Build Steps" table for current status
3. Read the relevant source files in `server/src/` or `client/src/`
4. Continue from the first ⬜ step
5. Update this table after each step, then commit

---

## Local Dev Setup

```bash
cp .env.example .env          # fill in AWS creds
npm run docker:up             # start postgres + redis
cd server && npx prisma migrate dev
npm run dev                   # starts both client + server
```
