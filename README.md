# Aragon

Image upload and validation service. Accepts images, runs quality checks (blur, format, face detection, duplicate detection), queues processing with BullMQ, and stores results in MinIO.

## Stack

- **Frontend**: React + Vite + TypeScript + Tailwind
- **Backend**: Express + TypeScript + Prisma
- **Database**: PostgreSQL
- **Queue**: Redis + BullMQ
- **Storage**: MinIO (S3-compatible, local dev) or AWS S3

## Prerequisites

- Node.js >= 18
- Docker + Docker Compose

## Setup

**1. Install dependencies**

```bash
npm install
```

**2. Copy and configure env**

```bash
cp .env.example .env
```

The defaults in `.env.example` work out of the box for local dev (MinIO, local Postgres, local Redis).

**3. Start infrastructure**

```bash
npm run docker:up
```

This starts Postgres (port 5433), Redis (6379), and MinIO (9000, console at 9001).

**4. Run database migrations**

```bash
npm run db:migrate --workspace=server
```

**5. Start the dev servers**

```bash
npm run dev
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:3001
- MinIO console: http://localhost:9001 (user: `minioadmin`, pass: `minioadmin`)

## Switching to AWS S3

In `.env`, comment out the MinIO vars and fill in the real AWS credentials (see comments in `.env.example`).

## Stopping

```bash
npm run docker:down
```

## Media Processing Pipeline (Part 2)

Once an image is validated and `ACCEPTED`, a second pipeline normalizes it to JPEG, compresses it, and generates `THUMBNAIL`/`WEB`/`FULL` variants. This runs across four workers (validation, conversion, compression, variant) in addition to the API.

**1. Run the pipeline locally without Docker**

Alongside the existing `npm run dev` (API + client), start each worker in its own terminal from `server/`:

```bash
npm run dev:worker:validation --workspace=server
npm run dev:worker:conversion --workspace=server
npm run dev:worker:compression --workspace=server
npm run dev:worker:variant --workspace=server
```

**2. Run the full stack via Docker**

```bash
docker compose up -d
```

This builds and starts `api`, `validation-worker`, `conversion-worker`, `compression-worker`, and `variant-worker`, alongside `postgres`, `redis`, and `minio`.

To scale the CPU/IO-heavy stages horizontally:

```bash
docker compose up -d --scale conversion-worker=4 --scale compression-worker=4 --scale variant-worker=4
```

Confirm replica counts:

```bash
docker compose ps
```

**3. Check a single image's pipeline status**

```bash
curl http://localhost:3001/api/images/<id>
```

The response includes `pipelineStatus` (`NOT_STARTED` → `QUEUED` → `CONVERTING` → `COMPRESSING` → `GENERATING_VARIANTS` → `COMPLETE`, or `FAILED`).

To fetch signed URLs for the generated variants once processing completes:

```bash
curl http://localhost:3001/api/images/<id>/variants
```

**4. Run the load test**

Set `LOAD_TEST_MODE=true` in `.env` (this skips the face-detection and similarity checks so synthetic images can pass validation) and restart the server/workers, then run:

```bash
node scripts/load-test.mjs 200 --concurrency=20
```

Additional flags: `--base-url=<url>` (default `http://localhost:3001`), `--poll-interval=<ms>`, `--poll-timeout=<ms>`.

**Remember to set `LOAD_TEST_MODE` back to `false` (the default) before normal or production use** — it disables real validation checks and must never be left on outside of load testing.
