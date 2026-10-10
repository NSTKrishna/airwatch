// Removes embedded metadata from an uploaded image before it is stored: EXIF (camera,
// timestamps, GPS position), XMP, IPTC, text chunks and comments. Photographs here can become
// public, and a phone photograph otherwise carries the place it was taken and the device that
// took it. Pixels are never decoded or re-encoded: segments are dropped from the container.
//
// The one thing kept from EXIF is the orientation, written back as a minimal EXIF block,
// because dropping it would turn portrait phone photographs on their side.

const malformed = () => Object.assign(new Error('Malformed image'), { malformedImage: true });

function exifOrientation(tiff) {
  if (tiff.length < 14) return null;
  const little = tiff.toString('latin1', 0, 2) === 'II';
  if (!little && tiff.toString('latin1', 0, 2) !== 'MM') return null;
  const u16 = (o) => (little ? tiff.readUInt16LE(o) : tiff.readUInt16BE(o));
  const u32 = (o) => (little ? tiff.readUInt32LE(o) : tiff.readUInt32BE(o));
  if (u16(2) !== 42) return null;
  const ifd = u32(4);
  if (ifd + 2 > tiff.length) return null;
  const count = u16(ifd);
  for (let i = 0; i < count; i += 1) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > tiff.length) return null;
    if (u16(entry) === 0x0112 && u16(entry + 2) === 3) {
      const value = u16(entry + 8);
      return value >= 2 && value <= 8 ? value : null; // 1 is "as stored": nothing to keep
    }
  }
  return null;
}

function orientationSegment(orientation) {
  const segment = Buffer.alloc(36);
  segment.writeUInt16BE(0xffe1, 0);
  segment.writeUInt16BE(34, 2); // length, counting these two bytes
  segment.write('Exif\0\0', 4, 'latin1');
  segment.write('MM', 10, 'latin1');
  segment.writeUInt16BE(42, 12);
  segment.writeUInt32BE(8, 14); // IFD0 follows the 8-byte TIFF header
  segment.writeUInt16BE(1, 18); // one entry
  segment.writeUInt16BE(0x0112, 20); // Orientation
  segment.writeUInt16BE(3, 22); // SHORT
  segment.writeUInt32BE(1, 24);
  segment.writeUInt16BE(orientation, 28);
  return segment; // value padding and the "no next IFD" offset are already zero
}

// APP0 (JFIF), APP2 (ICC colour profile) and APP14 (Adobe colour transform) affect how the
// picture is drawn. Every other application segment and every comment is dropped.
const KEEP_APP = new Set([0xe0, 0xe2, 0xee]);

// Compressed scan data runs until the next real marker. Inside it, FF 00 is a stuffed data
// byte, FF D0 to FF D7 are restart markers, and a run of FF is padding: none of those ends it.
function scanEnd(buffer, from) {
  let pos = from;
  for (;;) {
    pos = buffer.indexOf(0xff, pos);
    if (pos === -1 || pos + 1 >= buffer.length) throw malformed();
    const next = buffer[pos + 1];
    if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) pos += 2;
    else if (next === 0xff) pos += 1;
    else return pos;
  }
}

function stripJpeg(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) throw malformed();
  const kept = [];
  let orientation = null;
  let pos = 2;
  for (;;) {
    if (pos + 2 > buffer.length || buffer[pos] !== 0xff) throw malformed();
    let marker = buffer[pos + 1];
    while (marker === 0xff) { // fill bytes before a marker
      pos += 1;
      if (pos + 2 > buffer.length) throw malformed();
      marker = buffer[pos + 1];
    }
    if (marker === 0xd9) { // end of image: whatever follows it is not part of the picture
      kept.push(buffer.subarray(pos, pos + 2));
      break;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { // markers that carry no length
      kept.push(buffer.subarray(pos, pos + 2));
      pos += 2;
      continue;
    }
    if (pos + 4 > buffer.length) throw malformed();
    const length = buffer.readUInt16BE(pos + 2);
    let end = pos + 2 + length;
    if (length < 2 || end > buffer.length) throw malformed();
    // A scan header is followed by its compressed data. A progressive picture has several
    // scans, and metadata segments may sit between them, so the walk goes on after each one.
    if (marker === 0xda) end = scanEnd(buffer, end);
    const application = marker >= 0xe0 && marker <= 0xef;
    if (marker === 0xe1 && buffer.toString('latin1', pos + 4, pos + 10) === 'Exif\0\0') {
      orientation ??= exifOrientation(buffer.subarray(pos + 10, pos + 2 + length));
    }
    if (!(application && !KEEP_APP.has(marker)) && marker !== 0xfe) kept.push(buffer.subarray(pos, end));
    pos = end;
  }
  if (orientation) {
    const afterJfif = kept[0]?.[1] === 0xe0 ? 1 : 0;
    kept.splice(afterJfif, 0, orientationSegment(orientation));
  }
  return Buffer.concat([buffer.subarray(0, 2), ...kept]);
}

const PNG_DROP = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME']);

function stripPng(buffer) {
  const kept = [buffer.subarray(0, 8)];
  let pos = 8;
  while (pos < buffer.length) {
    if (pos + 12 > buffer.length) throw malformed();
    const end = pos + 12 + buffer.readUInt32BE(pos);
    if (end > buffer.length) throw malformed();
    const type = buffer.toString('latin1', pos + 4, pos + 8);
    if (!PNG_DROP.has(type)) kept.push(buffer.subarray(pos, end));
    pos = end;
    if (type === 'IEND') break; // anything after the end marker is not part of the image
  }
  return Buffer.concat(kept);
}

function stripWebp(buffer) {
  const kept = [];
  let pos = 12;
  while (pos + 8 <= buffer.length) {
    const type = buffer.toString('latin1', pos, pos + 4);
    const size = buffer.readUInt32LE(pos + 4);
    const end = pos + 8 + size + (size % 2); // chunks are padded to an even length
    if (pos + 8 + size > buffer.length) throw malformed();
    if (type !== 'EXIF' && type !== 'XMP ') {
      const chunk = Buffer.from(buffer.subarray(pos, Math.min(end, buffer.length)));
      // The extended header advertises EXIF (0x08) and XMP (0x04); they are gone now.
      if (type === 'VP8X' && size >= 1) chunk[8] &= ~0x0c;
      kept.push(chunk);
    }
    pos = end;
  }
  const body = Buffer.concat(kept);
  const header = Buffer.from(buffer.subarray(0, 12));
  header.writeUInt32LE(body.length + 4, 4);
  return Buffer.concat([header, body]);
}

/** @returns {Buffer} the same picture without embedded metadata. Throws `{ malformedImage: true }`. */
export function stripMetadata(buffer, mimeType) {
  try {
    if (mimeType === 'image/jpeg') return stripJpeg(buffer);
    if (mimeType === 'image/png') return stripPng(buffer);
    if (mimeType === 'image/webp') return stripWebp(buffer);
  } catch (error) {
    if (error instanceof RangeError) throw malformed(); // a length field pointed outside the file
    throw error;
  }
  throw malformed();
}
