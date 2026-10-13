import { AbortMultipartUploadCommand, CompleteMultipartUploadCommand, CreateMultipartUploadCommand, DeleteObjectCommand, GetObjectCommand,
 HeadObjectCommand, ListMultipartUploadsCommand, ListPartsCommand, S3Client, UploadPartCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { createWriteStream } from 'node:fs';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { StorageSettings } from './config.js';

export const STORAGE = Symbol('STORAGE');
export type StoredPart = { partNumber: number; etag: string; size: number };
export interface ObjectStorage {
 readToFile?(key: string, path: string, expectedBytes: number, signal: AbortSignal): Promise<void>;
 putPreview?(key: string, bytes: Uint8Array, signal: AbortSignal, mime?: string): Promise<void>;
 preview?(key: string, mime?: string): Promise<string>;
 create(key: string, mime: string, assetId: string): Promise<string>;
 signPart(key: string, uploadId: string, partNumber: number, size: number): Promise<string>;
 parts(key: string, uploadId: string): Promise<StoredPart[]>;
 complete(key: string, uploadId: string, parts: { partNumber: number; etag: string }[]): Promise<void>;
 head(key: string): Promise<{ size: number; mime: string; assetId: string } | null>;
 prefix(key: string): Promise<Uint8Array>;
 cleanup(key: string, uploadId: string | null): Promise<void>;
 download(key: string, fileName: string): Promise<string>;
 close?(): void;
}
function missing(error: unknown) {
 const e = error as { name?: string; $metadata?: { httpStatusCode?: number } };
 return e.name === 'NoSuchKey' || e.name === 'NotFound' || e.name === 'NoSuchUpload' || e.$metadata?.httpStatusCode === 404;
}
export class R2Storage implements ObjectStorage {
 readonly client: S3Client;
 constructor(private readonly config: StorageSettings) {
  this.client = new S3Client({ region: 'auto', endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
   credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
   requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED', maxAttempts: 2 });
 }
 private base(key: string) { return { Bucket: this.config.bucket, Key: key }; }
 async readToFile(key: string, path: string, expectedBytes: number, signal: AbortSignal) {
  const result = await this.client.send(new GetObjectCommand(this.base(key)), { abortSignal: signal });
  if (!result.Body || result.ContentLength !== expectedBytes) throw new Error('Object size changed');
  let received = 0;
  const limit = new Transform({ transform(chunk: Buffer, _encoding, done) {
   received += chunk.length;
   done(received > expectedBytes ? new Error('Object too large') : null, chunk);
  } });
  await pipeline(result.Body as Readable, limit, createWriteStream(path, { flags: 'wx' }), { signal });
  if (received !== expectedBytes) throw new Error('Incomplete object');
 }
 async putPreview(key: string, bytes: Uint8Array, signal: AbortSignal, mime = 'image/jpeg') {
  await this.client.send(new PutObjectCommand({ ...this.base(key), Body: bytes, ContentLength: bytes.length,
   ContentType: mime, CacheControl: 'private, max-age=60' }), { abortSignal: signal });
 }
 preview(key: string, mime = 'image/jpeg') {
  return getSignedUrl(this.client, new GetObjectCommand({ ...this.base(key), ResponseContentType: mime,
   ResponseContentDisposition: 'inline', ResponseCacheControl: 'private, max-age=60' }), { expiresIn: 60 });
 }
 async create(key: string, mime: string, assetId: string) {
  const result = await this.client.send(new CreateMultipartUploadCommand({ ...this.base(key), ContentType: mime, Metadata: { assetid: assetId } }), { abortSignal: AbortSignal.timeout(20000) });
  if (!result.UploadId) throw new Error('Missing multipart id');
  return result.UploadId;
 }
 signPart(key: string, uploadId: string, partNumber: number, size: number) {
  return getSignedUrl(this.client, new UploadPartCommand({ ...this.base(key), UploadId: uploadId, PartNumber: partNumber, ContentLength: size }),
   { expiresIn: 300, signableHeaders: new Set(['content-length']) });
 }
 async parts(key: string, uploadId: string) {
  const result = await this.client.send(new ListPartsCommand({ ...this.base(key), UploadId: uploadId, MaxParts: 1000 }), { abortSignal: AbortSignal.timeout(20000) });
  if (result.IsTruncated) throw new Error('Too many parts');
  return (result.Parts ?? []).map(p => ({ partNumber: p.PartNumber ?? 0, etag: p.ETag ?? '', size: p.Size ?? -1 }));
 }
 async complete(key: string, uploadId: string, parts: { partNumber: number; etag: string }[]) {
  await this.client.send(new CompleteMultipartUploadCommand({ ...this.base(key), UploadId: uploadId,
   MultipartUpload: { Parts: parts.map(p => ({ PartNumber: p.partNumber, ETag: p.etag })) } }), { abortSignal: AbortSignal.timeout(20000) });
 }
 async head(key: string) {
  try {
   const result = await this.client.send(new HeadObjectCommand(this.base(key)), { abortSignal: AbortSignal.timeout(20000) });
   return { size: result.ContentLength ?? -1, mime: result.ContentType ?? '', assetId: result.Metadata?.assetid ?? '' };
  } catch (e) { if (missing(e)) return null; throw e; }
 }
 async prefix(key: string) {
  const result = await this.client.send(new GetObjectCommand({ ...this.base(key), Range: 'bytes=0-511' }), { abortSignal: AbortSignal.timeout(20000) });
  if (!result.Body) throw new Error('Missing object');
  return result.Body.transformToByteArray();
 }
 async cleanup(key: string, uploadId: string | null) {
  const ids = uploadId ? [uploadId] : [];
  if (!uploadId) {
   // Recover an initiation whose response was lost: only this exact random key.
   const result = await this.client.send(new ListMultipartUploadsCommand({ Bucket: this.config.bucket, Prefix: key, MaxUploads: 1000 }), { abortSignal: AbortSignal.timeout(20000) });
   if (result.IsTruncated) throw new Error('Cleanup pagination required');
   ids.push(...(result.Uploads ?? []).filter(u => u.Key === key && u.UploadId).map(u => u.UploadId!));
  }
  for (const id of ids) {
   try { await this.client.send(new AbortMultipartUploadCommand({ ...this.base(key), UploadId: id }), { abortSignal: AbortSignal.timeout(20000) }); }
   catch (e) { if (!missing(e)) throw e; }
  }
  await this.client.send(new DeleteObjectCommand(this.base(key)), { abortSignal: AbortSignal.timeout(20000) });
 }
 download(key: string, fileName: string) {
  const encoded = encodeURIComponent(fileName).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  return getSignedUrl(this.client, new GetObjectCommand({ ...this.base(key), ResponseContentType: 'application/octet-stream',
   ResponseContentDisposition: `attachment; filename="download"; filename*=UTF-8''${encoded}` }), { expiresIn: 60 });
 }
 close() { this.client.destroy(); }
}
