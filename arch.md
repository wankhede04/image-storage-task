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
