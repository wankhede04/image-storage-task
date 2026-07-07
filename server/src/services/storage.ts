import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  ServerSideEncryption,
} from '@aws-sdk/client-s3';
import { getSignedUrl as awsGetSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config';

// ── Interface ─────────────────────────────────────────────────────────────────

export interface StorageService {
  putObject(key: string, body: Buffer, contentType: string): Promise<void>;
  getObject(key: string): Promise<Buffer>;
  getSignedUrl(key: string, expiresInSec?: number): Promise<string>;
  deleteObject(key: string): Promise<void>;
  /** Deletes every object whose key starts with `prefix`. */
  deletePrefix(prefix: string): Promise<void>;
}

// ── S3 client factory ─────────────────────────────────────────────────────────

function createS3Client(): S3Client {
  return new S3Client({
    region: config.AWS_REGION,
    // Presence of S3_ENDPOINT = MinIO mode; absence = real AWS (virtual-hosted)
    ...(config.S3_ENDPOINT && {
      endpoint: config.S3_ENDPOINT,
      forcePathStyle: config.S3_FORCE_PATH_STYLE ?? true,
    }),
  });
}

// Presigned URLs embed whatever endpoint this client is configured with. When the app
// runs in a container, S3_ENDPOINT (e.g. http://minio:9000) is only reachable from other
// containers — browsers/host tools need S3_PUBLIC_ENDPOINT (e.g. http://localhost:9000) instead.
function createPublicS3Client(): S3Client {
  const publicEndpoint = config.S3_PUBLIC_ENDPOINT ?? config.S3_ENDPOINT;
  return new S3Client({
    region: config.AWS_REGION,
    ...(publicEndpoint && {
      endpoint: publicEndpoint,
      forcePathStyle: config.S3_FORCE_PATH_STYLE ?? true,
    }),
  });
}

// ── Implementation ────────────────────────────────────────────────────────────

class S3StorageService implements StorageService {
  private readonly client: S3Client;
  private readonly publicClient: S3Client;
  private readonly bucket: string;

  constructor() {
    this.client = createS3Client();
    this.publicClient = createPublicS3Client();
    this.bucket = config.S3_BUCKET;
  }

  async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ...(config.S3_SSE && { ServerSideEncryption: config.S3_SSE as ServerSideEncryption }),
      }),
    );
  }

  async getObject(key: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    const stream = response.Body as NodeJS.ReadableStream;
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }

  async getSignedUrl(key: string, expiresInSec = 300): Promise<string> {
    return awsGetSignedUrl(
      this.publicClient,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: expiresInSec },
    );
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  async deletePrefix(prefix: string): Promise<void> {
    let continuationToken: string | undefined;

    do {
      const list = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );

      const keys = (list.Contents ?? []).map((o) => o.Key!).filter(Boolean);
      await Promise.all(keys.map((k) => this.deleteObject(k)));

      continuationToken = list.IsTruncated ? list.NextContinuationToken : undefined;
    } while (continuationToken);
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

export const storageService: StorageService = new S3StorageService();
