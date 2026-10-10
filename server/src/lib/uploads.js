import multer from 'multer';
import { badRequest } from './errors.js';
import { stripMetadata } from './imageMetadata.js';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const SIGNATURES = [
  { mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: 'image/webp', test: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
];

export const imageUpload = (maxFiles) =>
  multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_IMAGE_BYTES, files: maxFiles } });

// The stored MIME type comes from the file's leading bytes, never from the
// client-declared content type or file name. Embedded metadata (EXIF with its GPS
// position, XMP, comments) is removed before anything is stored.
export function toAttachmentRows(files, base) {
  return (files || []).map((file) => {
    const match = file.buffer.length >= 12 && SIGNATURES.find((s) => s.test(file.buffer));
    if (!match) throw badRequest(`"${file.originalname}" is not a JPEG, PNG or WebP image`);
    let data;
    try {
      data = stripMetadata(file.buffer, match.mime);
    } catch (error) {
      if (!error.malformedImage) throw error;
      throw badRequest(`"${file.originalname}" could not be read as an image`);
    }
    return {
      ...base,
      filename: String(file.originalname || 'image').replace(/[^\w.\- ]+/g, '_').slice(0, 120),
      mimeType: match.mime,
      sizeBytes: data.length,
      data,
    };
  });
}
