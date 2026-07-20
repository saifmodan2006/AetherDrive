import fs from 'fs';
import path from 'path';
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';

export interface IStorageProvider {
  uploadFile(file: Express.Multer.File, key: string): Promise<string>;
  getFileStream(key: string): Promise<any>;
  deleteFile(key: string): Promise<void>;
}

export class LocalStorageProvider implements IStorageProvider {
  private baseDir: string;

  constructor() {
    this.baseDir = path.resolve(process.env.STORAGE_DIR || './uploads');
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  async uploadFile(file: Express.Multer.File, key: string): Promise<string> {
    const destPath = path.join(this.baseDir, key);
    
    // Ensure parent directory exists
    const dir = path.dirname(destPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Move file from multer's temp path to the permanent location
    await fs.promises.rename(file.path, destPath);
    return key;
  }

  async getFileStream(key: string): Promise<fs.ReadStream> {
    const filePath = path.join(this.baseDir, key);
    if (!fs.existsSync(filePath)) {
      throw new Error('File not found on disk');
    }
    return fs.createReadStream(filePath);
  }

  async deleteFile(key: string): Promise<void> {
    const filePath = path.join(this.baseDir, key);
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
  }
}

export class S3StorageProvider implements IStorageProvider {
  private client: S3Client;
  private bucket: string;

  constructor() {
    const region = process.env.S3_REGION || 'us-east-1';
    const endpoint = process.env.S3_ENDPOINT;
    this.bucket = process.env.S3_BUCKET || '';

    this.client = new S3Client({
      region,
      endpoint: endpoint || undefined,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
      },
      forcePathStyle: endpoint ? true : false,
    });
  }

  async uploadFile(file: Express.Multer.File, key: string): Promise<string> {
    const fileStream = fs.createReadStream(file.path);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: fileStream,
        ContentType: file.mimetype,
      })
    );

    // Clean up temporary local upload file
    try {
      await fs.promises.unlink(file.path);
    } catch (err) {
      console.error('Failed to remove temp file:', err);
    }

    return key;
  }

  async getFileStream(key: string): Promise<Readable> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      })
    );
    if (!response.Body) {
      throw new Error('Empty body received from S3');
    }
    return response.Body as Readable;
  }

  async deleteFile(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      })
    );
  }
}

const isS3Configured = !!(
  process.env.S3_BUCKET &&
  process.env.S3_ACCESS_KEY_ID &&
  process.env.S3_SECRET_ACCESS_KEY
);

if (isS3Configured) {
  console.log('Production S3-compatible cloud storage provider enabled.');
} else {
  console.log('Local disk storage provider enabled.');
}

export const storageProvider: IStorageProvider = isS3Configured
  ? new S3StorageProvider()
  : new LocalStorageProvider();
