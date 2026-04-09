import { Readable } from "node:stream";

import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import { StorageAdapter, StorageError } from "./types";

type S3StorageConfig = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
};

function assertString(name: string, value: string | undefined) {
  if (!value?.trim()) throw new StorageError(`Missing env: ${name}`);
  return value.trim();
}

export class S3StorageAdapter implements StorageAdapter {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: S3StorageConfig) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: true,
    });
  }

  static fromEnv() {
    return new S3StorageAdapter({
      endpoint: assertString("S3_ENDPOINT", process.env.S3_ENDPOINT),
      bucket: assertString("S3_BUCKET", process.env.S3_BUCKET),
      accessKeyId: assertString("S3_ACCESS_KEY", process.env.S3_ACCESS_KEY),
      secretAccessKey: assertString("S3_SECRET_KEY", process.env.S3_SECRET_KEY),
      region: assertString("S3_REGION", process.env.S3_REGION),
    });
  }

  async upload(file: Buffer, path: string) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: path,
        Body: file,
      }),
    );
    return path;
  }

  async download(path: string) {
    const res = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: path,
      }),
    );
    if (!res.Body) throw new StorageError("Missing object body.");

    const chunks: Buffer[] = [];
    for await (const chunk of res.Body as Readable) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  async delete(path: string) {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: path,
      }),
    );
  }

  async exists(path: string) {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: path,
        }),
      );
      return true;
    } catch {
      return false;
    }
  }

  async getUrl(path: string): Promise<string> {
    void path;
    throw new StorageError("S3 public URLs are forbidden; serve via authenticated endpoint.");
  }

  async getSize(path: string) {
    const res = await this.client.send(
      new HeadObjectCommand({
        Bucket: this.bucket,
        Key: path,
      }),
    );
    return res.ContentLength ?? 0;
  }
}
