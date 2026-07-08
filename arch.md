# Aragon Image Upload Pipeline — Architecture

## Request Flow

```mermaid
sequenceDiagram
    participant Browser
    participant Express API
    participant Postgres
    participant S3 (MinIO)
    participant Redis / BullMQ
    participant Worker

    Browser->>Express API: POST /api/images (multipart)
    Express API->>Postgres: INSERT image (status=PENDING)
    Express API->>S3 (MinIO): putObject(original bytes)
    Express API->>Redis / BullMQ: enqueue job { imageId, s3Key }
    Express API-->>Browser: 202 Accepted { id, status: PENDING }

    Note over Browser: Card appears in gallery immediately (PENDING state)

    Redis / BullMQ->>Worker: dequeue job
    Worker->>S3 (MinIO): getObject(s3Key)

    alt HEIC file
        Worker->>S3 (MinIO): putObject(converted JPEG)
        Worker->>Postgres: UPDATE image SET s3KeyConverted
    end

    Worker->>Worker: validateImage(buffer)

    Worker->>Postgres: UPDATE image SET status, rejectionReasons, phash
    Worker->>Express API: broadcast(IMAGE_PROCESSED event)
    Express API-->>Browser: SSE event { id, status, rejectionReasons }

    Note over Browser: Card updates live — no refresh
```

---

## Validation Pipeline

```mermaid
flowchart TD
    IN([Buffer from S3]) --> F

    F["`**1. Format**
    checkFormat · format.ts:6
    file-type reads magic bytes
    JPEG / PNG / HEIC only`"]

    F --> R

    R["`**2. Resolution + File Size**
    checkResolution · resolution.ts:10
    Sharp reads metadata header
    min 500×500px, min 50KB`"]

    R --> B

    B["`**3. Blur**
    checkBlur · blur.ts:5
    Resize to 500×500 → grayscale
    3×3 Laplacian variance
    threshold: BLUR_THRESHOLD env`"]

    B --> FA

    FA["`**4. Face Detection**
    checkFaces · face.ts:24
    TinyFaceDetector via face-api
    Exactly 1 face required
    Face area ≥ 2% of image`"]

    FA --> S

    S["`**5. Similarity**
    checkSimilarity · similarity.ts:34
    Average perceptual hash (8×8)
    Hamming distance vs ACCEPTED images
    threshold: ≤ 10 bits`"]

    S --> OUT

    OUT{Any reasons?}
    OUT -- No --> ACC([✅ ACCEPTED])
    OUT -- Yes --> REJ([❌ REJECTED + reasons])

    style ACC fill:#22c55e,color:#fff
    style REJ fill:#ef4444,color:#fff
```

> All 5 checks always run — no fail-fast. Every rejection reason is returned at once.

---

## Component Map

```mermaid
graph TD
    subgraph Browser
        UI[React UI<br/>App.tsx · Gallery.tsx]
        HOOK[useSSE hook<br/>client/src/hooks/useSSE.ts:7]
        TQ[TanStack Query cache]
        UI --> TQ
        HOOK --> TQ
    end

    subgraph Express API :3001
        UPLOAD[POST /api/images<br/>routes/images.ts:98]
        SSE_SVC[SSE Service<br/>services/sse.ts:26]
        STORAGE[StorageService<br/>services/storage.ts:14]
        EVENTS[GET /api/images/events<br/>routes/images.ts:14]
    end

    subgraph Background
        QUEUE[BullMQ Queue<br/>services/queue.ts]
        WORKER[imageProcessor Worker<br/>workers/imageProcessor.ts:12<br/>concurrency: 2]
        PIPELINE[validateImage<br/>validation/index.ts:13]
    end

    subgraph Infrastructure
        PG[(Postgres<br/>Prisma ORM)]
        REDIS[(Redis)]
        S3[(S3 / MinIO<br/>private bucket)]
    end

    Browser -->|POST multipart| UPLOAD
    Browser -->|EventSource| EVENTS
    EVENTS --> SSE_SVC
    HOOK -->|SSE stream| EVENTS

    UPLOAD --> PG
    UPLOAD --> STORAGE
    UPLOAD --> QUEUE
    QUEUE --> REDIS
    REDIS --> WORKER
    WORKER --> STORAGE
    WORKER --> PIPELINE
    WORKER --> PG
    WORKER --> SSE_SVC
    SSE_SVC -->|text/event-stream| Browser
    STORAGE --> S3
```

---

## Failure Handling

```mermaid
flowchart LR
    A[Upload arrives] --> B{S3 write OK?}
    B -- No --> C[Mark REJECTED\nreturn 502]
    B -- Yes --> D{Queue enqueue OK?}
    D -- No --> E[Delete S3 object\nMark REJECTED\nreturn 502]
    D -- Yes --> F[Return 202\nWorker processes async]

    F --> G{Worker succeeds?}
    G -- Yes --> H[Mark ACCEPTED or REJECTED\nBroadcast SSE]
    G -- No, attempt < 3 --> I[BullMQ retries\nno DB write yet]
    I --> G
    G -- No, attempt = 3 --> J[Mark REJECTED\nBroadcast SSE]

    style C fill:#ef4444,color:#fff
    style E fill:#ef4444,color:#fff
    style H fill:#22c55e,color:#fff
    style J fill:#ef4444,color:#fff
```

---

## Key Design Decisions

| Decision | Why |
|---|---|
| 202 Accepted, not 200 | Work is queued, not complete — semantically correct |
| Run all 5 checks (no fail-fast) | User sees every rejection reason in one upload, not one per re-upload |
| Compare similarity vs ACCEPTED only | Two simultaneous duplicates: one passes, one rejects — correct behavior |
| Deferred REJECTED write (final retry only) | Prevents REJECTED → ACCEPTED SSE pair on retry success |
| Promise-based model load lock | Prevents double-load under worker concurrency ≥ 2 |
| Magic bytes over MIME type | MIME types can be spoofed by renaming; bytes cannot |
| Private S3 + presigned URLs | No public bucket, access auditable, URLs expire after 300s |
| MinIO in dev, S3 in prod | Same SDK, one env var difference — zero accidental AWS charges locally |
| All thresholds in env vars | Tunable per deployment without code change or redeploy |
| Resize to 500×500 before blur check | Scale-independent — same score for same focus level regardless of MP count |

---

# Part 2: Media Processing Pipeline

Once an image is `ACCEPTED` by the Part 1 validation pipeline, a second, independent pipeline normalizes, compresses, and generates display variants of it. This pipeline tracks its own `pipelineStatus` on the `Image` row, separate from the Part 1 `status` field.

## Pipeline Flow

```mermaid
sequenceDiagram
    participant ValidationWorker as Validation Worker<br/>workers/imageProcessor.ts:13
    participant ConversionQ as conversion queue
    participant ConversionWorker as Conversion Worker<br/>workers/conversionWorker.ts:46
    participant CompressionQ as compression queue
    participant CompressionWorker as Compression Worker<br/>workers/compressionWorker.ts:53
    participant VariantQ as variant-generation queue
    participant VariantWorker as Variant Worker<br/>workers/variantWorker.ts:80
    participant Postgres
    participant S3 (MinIO)
    participant Browser

    Note over ValidationWorker: image.status just set to ACCEPTED

    ValidationWorker->>Postgres: UPDATE pipelineStatus=QUEUED · imageProcessor.ts:50
    ValidationWorker->>ConversionQ: enqueueConversion(imageId) · pipelineQueues.ts:31<br/>jobId = imageId (dedup)

    ConversionQ->>ConversionWorker: dequeue job
    ConversionWorker->>Postgres: UPDATE pipelineStatus=CONVERTING · conversionWorker.ts:26
    ConversionWorker->>Browser: SSE PIPELINE_UPDATE (CONVERTING)
    ConversionWorker->>S3 (MinIO): getObject(original or converted)
    ConversionWorker->>ConversionWorker: normalizeToJpeg() · pipeline/conversion.ts:24
    ConversionWorker->>S3 (MinIO): putObject(images/{id}/normalized.jpg)
    ConversionWorker->>Postgres: UPDATE s3KeyNormalized, normalizedSizeBytes
    ConversionWorker->>CompressionQ: enqueueCompression(imageId) · pipelineQueues.ts:35

    CompressionQ->>CompressionWorker: dequeue job
    CompressionWorker->>Postgres: UPDATE pipelineStatus=COMPRESSING · compressionWorker.ts:26
    CompressionWorker->>Browser: SSE PIPELINE_UPDATE (COMPRESSING)
    CompressionWorker->>S3 (MinIO): getObject(normalized.jpg)
    CompressionWorker->>CompressionWorker: compress() mozjpeg · pipeline/compression.ts:18
    CompressionWorker->>S3 (MinIO): putObject(images/{id}/compressed.jpg)
    CompressionWorker->>Postgres: UPDATE s3KeyCompressed, compressedSizeBytes, compressionRatio
    CompressionWorker->>VariantQ: enqueueVariantGeneration(imageId) · pipelineQueues.ts:39

    VariantQ->>VariantWorker: dequeue job
    VariantWorker->>Postgres: UPDATE pipelineStatus=GENERATING_VARIANTS · variantWorker.ts:26
    VariantWorker->>Browser: SSE PIPELINE_UPDATE (GENERATING_VARIANTS)
    VariantWorker->>S3 (MinIO): getObject(compressed.jpg)
    VariantWorker->>VariantWorker: generateVariants() → THUMBNAIL, WEB, FULL · pipeline/variants.ts:38
    VariantWorker->>S3 (MinIO): putObject × 3 (images/{id}/variants/{type}.jpg)
    VariantWorker->>Postgres: $transaction: upsert 3 ImageVariant rows + pipelineStatus=COMPLETE · variantWorker.ts:49
    VariantWorker->>Browser: SSE PIPELINE_UPDATE (COMPLETE)

    alt Any stage throws on final BullMQ attempt
        ConversionWorker->>Postgres: UPDATE pipelineStatus=FAILED, pipelineError
        CompressionWorker->>Postgres: UPDATE pipelineStatus=FAILED, pipelineError
        VariantWorker->>Postgres: UPDATE pipelineStatus=FAILED, pipelineError
        Note over Browser: SSE PIPELINE_UPDATE (FAILED) broadcast from whichever stage failed
    end

    Note over Browser: Gallery card's pipeline badge updates live at every transition, no refresh
```

## `PipelineStatus` State Machine

```mermaid
flowchart TD
    NS([NOT_STARTED]) -->|ACCEPTED by validation worker| Q(QUEUED)
    Q -->|conversion worker picks up job| C(CONVERTING)
    C -->|normalize + upload done| CO(COMPRESSING)
    CO -->|compress + upload done| GV(GENERATING_VARIANTS)
    GV -->|3 variants upserted in transaction| DONE([COMPLETE])

    C -->|final BullMQ attempt exhausted| F([FAILED])
    CO -->|final BullMQ attempt exhausted| F
    GV -->|final BullMQ attempt exhausted| F

    style DONE fill:#22c55e,color:#fff
    style F fill:#ef4444,color:#fff
```

Each queue's `defaultJobOptions` sets `attempts: 3` with exponential backoff (`pipelineQueues.ts:8-13`). Only the final failed attempt writes `pipelineStatus: FAILED` — earlier attempts just retry, mirroring the Part 1 deferred-REJECTED-write pattern.

## Idempotency

Reprocessing the same `imageId` twice — whether from a manual re-enqueue, a BullMQ retry, or an operator replaying a job — cannot corrupt state or produce duplicate variants, for four concrete reasons:

- **Deterministic S3 keys**: every stage writes to a fixed key (`images/{id}/normalized.jpg`, `images/{id}/compressed.jpg`, `images/{id}/variants/{type}.jpg`). Re-running a stage simply overwrites the same object; there is no key that accumulates duplicates.
- **BullMQ `jobId: imageId` dedup**: `enqueueConversion`, `enqueueCompression`, and `enqueueVariantGeneration` all pass `{ jobId: imageId }` (`pipelineQueues.ts:31,35,39`). BullMQ refuses to add a second job with a jobId already active/waiting in the same queue, so a duplicate enqueue call is a no-op rather than a second execution.
- **`ImageVariant` upsert on `@@unique([imageId, type])`**: the variant worker's final write is `prisma.imageVariant.upsert({ where: { imageId_type: { imageId, type } }, ... })` inside a `$transaction` (`variantWorker.ts:49-75`). Re-running variant generation updates the existing THUMBNAIL/WEB/FULL rows in place rather than inserting new ones.
- **`pipelineStatus === 'COMPLETE'` skip-guard**: every worker's entry point (`processConversionJob`, `processCompressionJob`, `processVariantJob`) checks `if (image.pipelineStatus === 'COMPLETE') return` before doing any work (`conversionWorker.ts:19`, `compressionWorker.ts:19`, `variantWorker.ts:19`). Once an image finishes the pipeline, any stray or replayed job for it is a cheap no-op.

Together these mean the pipeline is safe to retry, replay, or scale out without a distributed lock: the worst case for a race between two workers on the same `imageId` is redundant S3 writes to the same key, not duplicate rows or corrupted state.

## Service Topology & Scaling

`docker-compose.yml` defines five containerized services for the pipeline, in addition to `postgres`, `redis`, `minio`, and `minio-init`:

| Service | Entrypoint |
|---|---|
| `api` | `server/Dockerfile` default (Express app) |
| `validation-worker` | `node dist/workers/validationWorker.js` |
| `conversion-worker` | `node dist/workers/conversionWorker.js` |
| `compression-worker` | `node dist/workers/compressionWorker.js` |
| `variant-worker` | `node dist/workers/variantWorker.js` |

Each pipeline worker is **stateless**: the BullMQ job payload is just `{ imageId }` (`pipelineQueues.ts:4-6`), and every other piece of state — pipeline stage, S3 keys, byte sizes, variant rows — lives in Postgres or S3, not in worker memory. This means any number of replicas of a given worker can safely consume from the same queue.

Scale the CPU/IO-heavy stages horizontally with:

```bash
docker compose up -d --scale conversion-worker=4 --scale compression-worker=4 --scale variant-worker=4
```

This works because none of the four worker services declare a `container_name` (unlike `postgres`/`redis`/`minio`/`minio-init`, which are pinned to single instances) — Compose is free to create N containers per service name, and since the workers hold no in-memory state, BullMQ's Redis-backed queue safely distributes jobs across however many replicas are running.

The `api` service additionally overrides `S3_PUBLIC_ENDPOINT: http://localhost:9000` in `docker-compose.yml`, on top of whatever `.env` sets — this is what fixes presigned URLs handed to the browser: `S3_ENDPOINT` inside the compose network is `http://minio:9000`, which only containers can resolve, so the API's public-facing endpoint is pinned separately to the host-published port that a browser or host CLI tool can actually reach.

## Key Design Decisions (Part 2)

| Decision | Why |
|---|---|
| Three separate queues/workers, not one | Conversion, compression, and variant generation have different CPU/IO cost profiles — splitting them lets each stage scale independently instead of over- or under-provisioning a single worker pool |
| `pipelineStatus` is a separate column/track from `status` | Keeps Part 1's validation semantics (`PENDING`/`ACCEPTED`/`REJECTED`) untouched — the media pipeline is purely additive and only ever starts after `status` is already `ACCEPTED` |
| `LOAD_TEST_MODE` bypasses only face + similarity checks | Format, resolution, and blur checks still run on synthetic load-test images, keeping the load test representative of real file-handling cost; face and similarity checks are skipped because synthetic images can't satisfy "exactly one face" or meaningful perceptual-hash comparisons |
