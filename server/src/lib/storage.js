// Where attachment bytes are kept. "database" stores them in the Attachment row, which needs
// nothing else to run. "s3" stores them in a private bucket and keeps only the object key in
// the row. The API serves the bytes itself in both cases, so who may see a photograph is
// decided in one place and the bucket never needs to be public.
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';

const EXTENSION = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const { driver, bucket, region, keyPrefix, endpoint, forcePathStyle } = config.storage;

let s3Promise;
// The SDK is loaded only when the S3 driver is selected.
const s3 = () => (s3Promise ??= import('@aws-sdk/client-s3').then((sdk) => ({
  sdk,
  client: new sdk.S3Client({
    region,
    ...(endpoint ? { endpoint, forcePathStyle } : {}),
    // Send checksums only where S3 demands them; S3-compatible test stores reject the rest.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  }),
})));

const newKey = (row, now) =>
  `${keyPrefix}${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}.${EXTENSION[row.mimeType] ?? 'bin'}`;

/**
 * Put the bytes of new attachment rows where they belong and return the rows to insert.
 * With the database driver the rows come back unchanged.
 */
export async function storeAttachments(rows) {
  if (driver !== 's3' || rows.length === 0) return rows;
  const { sdk, client } = await s3();
  const now = new Date();
  const stored = [];
  try {
    for (const row of rows) {
      const storageKey = newKey(row, now);
      await client.send(new sdk.PutObjectCommand({
        Bucket: bucket, Key: storageKey, Body: row.data, ContentType: row.mimeType, ContentLength: row.data.length,
      }));
      stored.push({ ...row, data: null, storageKey });
    }
  } catch (error) {
    await discardAttachments(stored);
    throw error;
  }
  return stored;
}

/** Remove stored objects whose rows were never written. Never throws. */
export async function discardAttachments(rows) {
  const keys = rows.map((row) => row.storageKey).filter(Boolean);
  if (keys.length === 0) return;
  const { sdk, client } = await s3();
  await Promise.allSettled(keys.map((Key) => client.send(new sdk.DeleteObjectCommand({ Bucket: bucket, Key }))));
}

/**
 * Store the bytes, then run the database write that records them. If that write fails the
 * stored objects are removed again, so a failed request leaves nothing behind.
 * @template T
 * @param {object[]} rows  attachment rows from toAttachmentRows
 * @param {(rows: object[]) => Promise<T>} write
 * @returns {Promise<T>}
 */
export async function withStoredAttachments(rows, write) {
  const stored = await storeAttachments(rows);
  try {
    return await write(stored);
  } catch (error) {
    await discardAttachments(stored);
    throw error;
  }
}

/** The bytes of an attachment row, wherever they are kept. */
export async function readAttachment(attachment) {
  if (!attachment.storageKey) return Buffer.from(attachment.data);
  const { sdk, client } = await s3();
  const object = await client.send(new sdk.GetObjectCommand({ Bucket: bucket, Key: attachment.storageKey }));
  return Buffer.from(await object.Body.transformToByteArray());
}

/** Whether the configured store answers. Used by the readiness check. */
export async function storageReady() {
  if (driver !== 's3') return true;
  try {
    const { sdk, client } = await s3();
    await client.send(new sdk.HeadBucketCommand({ Bucket: bucket }));
    return true;
  } catch {
    return false;
  }
}

export const storageDriver = driver;
