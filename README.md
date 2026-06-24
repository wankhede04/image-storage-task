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
