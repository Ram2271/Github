const zlib = require('zlib');

// Precompute CRC32 lookup table
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC_TABLE[i] = c >>> 0;
}

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function dateToDos(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = Math.floor(date.getSeconds() / 2);

  const dosTime = ((hours & 0x1F) << 11) | ((minutes & 0x3F) << 5) | (seconds & 0x1F);
  const dosDate = (((year - 1980) & 0x7F) << 9) | ((month & 0x0F) << 5) | (day & 0x1F);
  return { dosTime, dosDate };
}

/**
 * Builds a standard PKZIP buffer from an array of { path, buffer, date } entries.
 * @param {Array<{path: string, buffer: Buffer, date?: Date}>} entries
 * @returns {Buffer}
 */
function createZipBuffer(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const cleanPath = String(entry.path || '').replace(/^\/+/, '').replace(/\\/g, '/');
    if (!cleanPath) continue;

    const nameBuf = Buffer.from(cleanPath, 'utf8');
    const rawData = Buffer.isBuffer(entry.buffer)
      ? entry.buffer
      : Buffer.from(String(entry.buffer || ''), 'utf8');

    const uncompressedSize = rawData.length;
    const fileCrc = crc32(rawData);
    const compressedData = zlib.deflateRawSync(rawData);
    const compressedSize = compressedData.length;

    const { dosTime, dosDate } = dateToDos(entry.date ? new Date(entry.date) : new Date());

    // Local file header (30 bytes + filename)
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // Signature
    localHeader.writeUInt16LE(20, 4);         // Version needed to extract (2.0)
    localHeader.writeUInt16LE(0x0800, 6);     // General purpose bit flag (UTF-8)
    localHeader.writeUInt16LE(8, 8);          // Compression method (8 = Deflate)
    localHeader.writeUInt16LE(dosTime, 10);   // Last mod file time
    localHeader.writeUInt16LE(dosDate, 12);   // Last mod file date
    localHeader.writeUInt32LE(fileCrc, 14);   // CRC-32
    localHeader.writeUInt32LE(compressedSize, 18);   // Compressed size
    localHeader.writeUInt32LE(uncompressedSize, 22); // Uncompressed size
    localHeader.writeUInt16LE(nameBuf.length, 26);   // File name length
    localHeader.writeUInt16LE(0, 28);                // Extra field length

    localParts.push(localHeader, nameBuf, compressedData);

    // Central directory header (46 bytes + filename)
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0); // Signature
    centralHeader.writeUInt16LE(20, 4);         // Version made by
    centralHeader.writeUInt16LE(20, 6);         // Version needed to extract
    centralHeader.writeUInt16LE(0x0800, 8);     // General purpose bit flag (UTF-8)
    centralHeader.writeUInt16LE(8, 10);         // Compression method (8 = Deflate)
    centralHeader.writeUInt16LE(dosTime, 12);   // Last mod file time
    centralHeader.writeUInt16LE(dosDate, 14);   // Last mod file date
    centralHeader.writeUInt32LE(fileCrc, 16);   // CRC-32
    centralHeader.writeUInt32LE(compressedSize, 20);   // Compressed size
    centralHeader.writeUInt32LE(uncompressedSize, 24); // Uncompressed size
    centralHeader.writeUInt16LE(nameBuf.length, 28);   // File name length
    centralHeader.writeUInt16LE(0, 30);                // Extra field length
    centralHeader.writeUInt16LE(0, 32);                // File comment length
    centralHeader.writeUInt16LE(0, 34);                // Disk number start
    centralHeader.writeUInt16LE(0, 36);                // Internal file attributes
    centralHeader.writeUInt32LE(0, 38);                // External file attributes
    centralHeader.writeUInt32LE(offset, 42);           // Relative offset of local header

    centralParts.push(centralHeader, nameBuf);

    offset += localHeader.length + nameBuf.length + compressedData.length;
  }

  const centralDirBuffer = Buffer.concat(centralParts);
  const centralDirSize = centralDirBuffer.length;
  const centralDirOffset = offset;
  const totalEntries = centralParts.length / 2;

  // End of central directory record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);          // Signature
  eocd.writeUInt16LE(0, 4);                   // Number of this disk
  eocd.writeUInt16LE(0, 6);                   // Disk where central directory starts
  eocd.writeUInt16LE(totalEntries, 8);        // Number of central directory records on this disk
  eocd.writeUInt16LE(totalEntries, 10);       // Total number of central directory records
  eocd.writeUInt32LE(centralDirSize, 12);     // Size of central directory
  eocd.writeUInt32LE(centralDirOffset, 16);   // Offset of start of central directory
  eocd.writeUInt16LE(0, 20);                  // Comment length

  return Buffer.concat([...localParts, centralDirBuffer, eocd]);
}

module.exports = { createZipBuffer };
