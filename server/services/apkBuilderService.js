const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

// Precompute CRC32 table
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

// Embedded RSA-2048 Private Key & Self-Signed X.509 Certificate (DER) generated once for APK signing
// We generate a deterministic or cached RSA-2048 keypair + minimal X.509 v3 DER certificate in pure Node.js
let cachedSigningCreds = null;

function derLength(len) {
  if (len < 128) return Buffer.from([len]);
  const bytes = [];
  let temp = len;
  while (temp > 0) {
    bytes.unshift(temp & 0xff);
    temp >>= 8;
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function derSeq(...items) {
  const body = Buffer.concat(items);
  return Buffer.concat([Buffer.from([0x30]), derLength(body.length), body]);
}

function derSet(...items) {
  const body = Buffer.concat(items);
  return Buffer.concat([Buffer.from([0x31]), derLength(body.length), body]);
}

function derTag(tag, body) {
  return Buffer.concat([Buffer.from([tag]), derLength(body.length), body]);
}

function derOid(oidBytes) {
  const body = Buffer.from(oidBytes);
  return Buffer.concat([Buffer.from([0x06]), derLength(body.length), body]);
}

function derInt(numOrBuf) {
  let buf = Buffer.isBuffer(numOrBuf) ? numOrBuf : Buffer.from([numOrBuf]);
  // Ensure positive integer in ASN.1 DER
  if (buf[0] & 0x80) {
    buf = Buffer.concat([Buffer.from([0x00]), buf]);
  }
  return Buffer.concat([Buffer.from([0x02]), derLength(buf.length), buf]);
}

function derPrintableString(str) {
  const body = Buffer.from(str, 'ascii');
  return Buffer.concat([Buffer.from([0x13]), derLength(body.length), body]);
}

function derUtcTime(str) {
  const body = Buffer.from(str, 'ascii');
  return Buffer.concat([Buffer.from([0x17]), derLength(body.length), body]);
}

function derOctetString(buf) {
  return Buffer.concat([Buffer.from([0x04]), derLength(buf.length), buf]);
}

function derBitString(buf) {
  const body = Buffer.concat([Buffer.from([0x00]), buf]);
  return Buffer.concat([Buffer.from([0x03]), derLength(body.length), body]);
}

function getSigningCredentials() {
  if (cachedSigningCreds) return cachedSigningCreds;

  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicExponent: 0x10001
  });

  // Export SPKI DER (SubjectPublicKeyInfo)
  const spkiDer = publicKey.export({ type: 'spki', format: 'der' });

  // OIDs
  // sha256WithRSAEncryption: 1.2.840.113549.1.1.11 -> 2a 86 48 86 f7 0d 01 01 0b
  const sha256WithRSA = derSeq(
    derOid([0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x0b]),
    Buffer.from([0x05, 0x00])
  );

  // CommonName (2.5.4.3 -> 55 04 03) = "APKForge Release"
  const rdnCn = derSet(
    derSeq(
      derOid([0x55, 0x04, 0x03]),
      derPrintableString('APKForge Release')
    )
  );
  const issuerAndSubject = derSeq(rdnCn);

  const validity = derSeq(
    derUtcTime('240101000000Z'),
    derUtcTime('491231235959Z')
  );

  const serialNumber = Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05, 0x06]);

  const tbsCertificate = derSeq(
    derTag(0xa0, derInt(2)), // version v3 (2)
    derInt(serialNumber),
    sha256WithRSA,
    issuerAndSubject,
    validity,
    issuerAndSubject,
    spkiDer
  );

  const certSignature = crypto.sign('sha256', tbsCertificate, privateKey);
  const certDer = derSeq(
    tbsCertificate,
    sha256WithRSA,
    derBitString(certSignature)
  );

  cachedSigningCreds = {
    privateKey,
    publicKey,
    certDer,
    issuerAndSubject,
    serialNumber
  };
  return cachedSigningCreds;
}

/**
 * Builds a PKCS#7 / CMS SignedData DER structure for META-INF/CERT.RSA
 */
function createPkcs7Signature(sfBuffer, creds) {
  const sigBytes = crypto.sign('sha256', sfBuffer, creds.privateKey);

  // pkcs7-signedData OID: 1.2.840.113549.1.7.2 -> 2a 86 48 86 f7 0d 01 07 02
  const oidSignedData = derOid([0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x07, 0x02]);
  // pkcs7-data OID: 1.2.840.113549.1.7.1 -> 2a 86 48 86 f7 0d 01 07 01
  const oidData = derOid([0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x07, 0x01]);
  // sha256 OID: 2.16.840.1.101.3.4.2.1 -> 60 86 48 01 65 03 04 02 01
  const algSha256 = derSeq(
    derOid([0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01]),
    Buffer.from([0x05, 0x00])
  );
  // rsaEncryption OID: 1.2.840.113549.1.1.1 -> 2a 86 48 86 f7 0d 01 01 01
  const algRsa = derSeq(
    derOid([0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01]),
    Buffer.from([0x05, 0x00])
  );

  const signerInfo = derSeq(
    derInt(1), // version 1
    derSeq(creds.issuerAndSubject, derInt(creds.serialNumber)), // issuerAndSerialNumber
    algSha256, // digestAlgorithm
    algRsa,    // digestEncryptionAlgorithm
    derOctetString(sigBytes) // encryptedDigest
  );

  const signedData = derSeq(
    derInt(1), // version 1
    derSet(algSha256), // digestAlgorithms
    derSeq(oidData),   // contentInfo (detached)
    derTag(0xa0, creds.certDer), // certificates [0] IMPLICIT
    derSet(signerInfo) // signerInfos
  );

  return derSeq(
    oidSignedData,
    derTag(0xa0, signedData)
  );
}

/**
 * Parses entries from a standard ZIP buffer using Central Directory
 */
function readZipEntries(zipBuf) {
  // Locate End of Central Directory (0x06054b50)
  let eocdOffset = -1;
  for (let i = zipBuf.length - 22; i >= Math.max(0, zipBuf.length - 65557); i--) {
    if (zipBuf.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) {
    throw new Error('Invalid APK template: EOCD not found');
  }

  const totalEntries = zipBuf.readUInt16LE(eocdOffset + 10);
  const cdOffset = zipBuf.readUInt32LE(eocdOffset + 16);

  const entries = [];
  let ptr = cdOffset;

  for (let i = 0; i < totalEntries; i++) {
    if (zipBuf.readUInt32LE(ptr) !== 0x02014b50) {
      throw new Error('Invalid Central Directory entry signature');
    }
    const method = zipBuf.readUInt16LE(ptr + 10);
    const compSize = zipBuf.readUInt32LE(ptr + 20);
    const uncompSize = zipBuf.readUInt32LE(ptr + 24);
    const nameLen = zipBuf.readUInt16LE(ptr + 28);
    const extraLen = zipBuf.readUInt16LE(ptr + 30);
    const commentLen = zipBuf.readUInt16LE(ptr + 32);
    const localHeaderOffset = zipBuf.readUInt32LE(ptr + 42);

    const name = zipBuf.slice(ptr + 46, ptr + 46 + nameLen).toString('utf8');
    ptr += 46 + nameLen + extraLen + commentLen;

    // Read local file header to find start of data
    const lNameLen = zipBuf.readUInt16LE(localHeaderOffset + 26);
    const lExtraLen = zipBuf.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + lNameLen + lExtraLen;
    const compData = zipBuf.slice(dataStart, dataStart + compSize);

    let data;
    if (method === 0) {
      data = compData;
    } else if (method === 8) {
      data = zlib.inflateRawSync(compData);
    } else {
      throw new Error(`Unsupported compression method ${method} for ${name}`);
    }

    entries.push({ name, method, data, uncompSize });
  }

  return entries;
}

/**
 * Rebuilds the UTF-16LE String Pool inside binary AndroidManifest.xml (AXML)
 * so custom appName, packageId, and version of ANY length work cleanly.
 */
function patchAndroidManifest(manifestBuf, { appName, packageId, version }) {
  const xmlType = manifestBuf.readUInt16LE(0);
  if (xmlType !== 0x0003) {
    throw new Error('Invalid binary AndroidManifest.xml header');
  }

  const spType = manifestBuf.readUInt16LE(8);
  const spHeaderSize = manifestBuf.readUInt16LE(10);
  const spChunkSize = manifestBuf.readUInt32LE(12);
  const stringCount = manifestBuf.readUInt32LE(16);
  const styleCount = manifestBuf.readUInt32LE(20);
  const flags = manifestBuf.readUInt32LE(24);
  const stringsStart = manifestBuf.readUInt32LE(28);

  if (spType !== 0x0001) {
    throw new Error('Expected RES_STRING_POOL_TYPE at offset 8');
  }

  // Decode all existing UTF-16LE strings
  const strings = [];
  for (let i = 0; i < stringCount; i++) {
    const strOffset = 8 + stringsStart + manifestBuf.readUInt32LE(8 + spHeaderSize + i * 4);
    const charLen = manifestBuf.readUInt16LE(strOffset);
    const rawStr = manifestBuf.slice(strOffset + 2, strOffset + 2 + charLen * 2).toString('utf16le');

    if (rawStr === 'APKFORGE_APP_NAME_PLACEHOLDER') {
      strings.push(String(appName || 'My App'));
    } else if (rawStr === 'APKFORGE_VER_1.0.0') {
      strings.push(String(version || '1.0.0'));
    } else if (rawStr === 'com.apkforge.template') {
      strings.push(String(packageId || 'com.apkforge.webapp'));
    } else {
      strings.push(rawStr);
    }
  }

  // Re-encode all strings in UTF-16LE format: [u16 charLen][utf16le bytes][0x0000]
  const encodedStrings = [];
  const offsets = [];
  let currentByteOffset = 0;

  for (const str of strings) {
    offsets.push(currentByteOffset);
    const strBytes = Buffer.from(str, 'utf16le');
    const charLen = strBytes.length / 2;
    const entryBuf = Buffer.alloc(2 + strBytes.length + 2);
    entryBuf.writeUInt16LE(charLen, 0);
    strBytes.copy(entryBuf, 2);
    entryBuf.writeUInt16LE(0, 2 + strBytes.length); // null terminator
    encodedStrings.push(entryBuf);
    currentByteOffset += entryBuf.length;
  }

  const offsetsTableSize = stringCount * 4;
  const newStringsStart = spHeaderSize + offsetsTableSize;
  const rawStringsBlock = Buffer.concat(encodedStrings);

  // Pad string pool chunk to 4-byte boundary
  const unpaddedChunkSize = newStringsStart + rawStringsBlock.length;
  const paddingBytes = (4 - (unpaddedChunkSize % 4)) % 4;
  const newSpChunkSize = unpaddedChunkSize + paddingBytes;

  const newSpChunk = Buffer.alloc(newSpChunkSize, 0);
  newSpChunk.writeUInt16LE(0x0001, 0);        // RES_STRING_POOL_TYPE
  newSpChunk.writeUInt16LE(spHeaderSize, 2);  // Header size (28)
  newSpChunk.writeUInt32LE(newSpChunkSize, 4);// Chunk size
  newSpChunk.writeUInt32LE(stringCount, 8);   // String count
  newSpChunk.writeUInt32LE(styleCount, 12);   // Style count (0)
  newSpChunk.writeUInt32LE(flags, 16);        // Flags (0 = UTF-16LE)
  newSpChunk.writeUInt32LE(newStringsStart, 20); // Strings start
  newSpChunk.writeUInt32LE(0, 24);            // Styles start (0)

  for (let i = 0; i < stringCount; i++) {
    newSpChunk.writeUInt32LE(offsets[i], spHeaderSize + i * 4);
  }
  rawStringsBlock.copy(newSpChunk, newStringsStart);

  // Remaining chunks after the original string pool
  const remainingChunks = manifestBuf.slice(8 + spChunkSize);
  const totalFileSize = 8 + newSpChunk.length + remainingChunks.length;

  const fileHeader = Buffer.alloc(8);
  fileHeader.writeUInt16LE(0x0003, 0); // RES_XML_TYPE
  fileHeader.writeUInt16LE(8, 2);      // Header size
  fileHeader.writeUInt32LE(totalFileSize, 4);

  return Buffer.concat([fileHeader, newSpChunk, remainingChunks]);
}

/**
 * Computes APK Signature Scheme v2 (`APK Sig Block 42`) and inserts it right before the Central Directory.
 */
function insertApkSignatureV2Block(zipParts, centralDirBuffer, eocdBuffer, centralDirOffset, creds) {
  const beforeCdBuffer = Buffer.concat(zipParts);

  // Helper to compute 1MB chunked SHA-256 digests per APK Signature Scheme v2 spec
  function getChunkDigests(buffers) {
    const CHUNK_SIZE = 1024 * 1024; // 1 MB
    const digests = [];
    for (const buf of buffers) {
      let pos = 0;
      while (pos < buf.length) {
        const slice = buf.slice(pos, Math.min(pos + CHUNK_SIZE, buf.length));
        const chunkPrefix = Buffer.alloc(5);
        chunkPrefix[0] = 0xa5;
        chunkPrefix.writeUInt32LE(slice.length, 1);
        const h = crypto.createHash('sha256');
        h.update(chunkPrefix);
        h.update(slice);
        digests.push(h.digest());
        pos += CHUNK_SIZE;
      }
    }
    return digests;
  }

  function lpUint32(buf) {
    const len = Buffer.alloc(4);
    len.writeUInt32LE(buf.length, 0);
    return Buffer.concat([len, buf]);
  }

  // Note: In V2 digest computation, EOCD's central directory offset field (at byte 16)
  // must be set to the offset where the APK Signing Block will start (which is centralDirOffset).
  const eocdForDigest = Buffer.from(eocdBuffer);
  eocdForDigest.writeUInt32LE(centralDirOffset, 16);

  const chunkDigests = getChunkDigests([beforeCdBuffer, centralDirBuffer, eocdForDigest]);
  const topPrefix = Buffer.alloc(5);
  topPrefix[0] = 0x5a;
  topPrefix.writeUInt32LE(chunkDigests.length, 1);
  const topHash = crypto.createHash('sha256');
  topHash.update(topPrefix);
  for (const d of chunkDigests) topHash.update(d);
  const contentDigest = topHash.digest();

  // Signature algorithm ID: 0x0103 = RSASSA-PKCS1-v1_5 with SHA2-256
  const SIG_ALGO_RSA_PKCS1_V1_5_SHA256 = 0x0103;

  // Digest entry: uint32(algoId) + lpUint32(contentDigest)
  const algoBuf = Buffer.alloc(4);
  algoBuf.writeUInt32LE(SIG_ALGO_RSA_PKCS1_V1_5_SHA256, 0);
  const digestEntry = lpUint32(Buffer.concat([algoBuf, lpUint32(contentDigest)]));
  const digestsSeq = lpUint32(digestEntry);

  // Certificates sequence: lpUint32(lpUint32(certDer))
  const certsSeq = lpUint32(lpUint32(creds.certDer));

  // Additional attributes (empty)
  const additionalAttrs = lpUint32(Buffer.alloc(0));

  // Signed data (unprefixed bytes that are signed by privateKey)
  const signedDataBody = Buffer.concat([digestsSeq, certsSeq, additionalAttrs]);
  const rsaSignature = crypto.sign('sha256', signedDataBody, creds.privateKey);

  // Signatures sequence: lpUint32(lpUint32(algoId + lpUint32(rsaSignature)))
  const sigEntry = lpUint32(Buffer.concat([algoBuf, lpUint32(rsaSignature)]));
  const signaturesSeq = lpUint32(sigEntry);

  // Public key SPKI DER
  const spkiDer = creds.publicKey.export({ type: 'spki', format: 'der' });
  const publicKeyField = lpUint32(spkiDer);

  // Signer block: lpUint32(lpUint32(signedDataBody) + signaturesSeq + publicKeyField)
  const signerBlock = lpUint32(
    Buffer.concat([lpUint32(signedDataBody), signaturesSeq, publicKeyField])
  );
  const signersSeq = lpUint32(signerBlock);

  // ID-value pair for APK Signature Scheme v2 (ID = 0x7109871a)
  const pairBody = Buffer.alloc(4 + signersSeq.length);
  pairBody.writeUInt32LE(0x7109871a, 0);
  signersSeq.copy(pairBody, 4);

  const pairLen = Buffer.alloc(8);
  pairLen.writeBigUInt64LE(BigInt(pairBody.length), 0);
  const idValuePair = Buffer.concat([pairLen, pairBody]);

  // Pad idValuePairs so total APK Signing Block is a multiple of 4096 bytes (or 8 bytes)
  // Block structure:
  // uint64 size_of_block (excluding these first 8 bytes)
  // [id-value pairs]
  // uint64 size_of_block (same as first 8 bytes)
  // uint128 magic ("APK Sig Block 42", 16 bytes)
  const blockSizeExcludingFirst8 = BigInt(idValuePair.length + 8 + 16);
  const sizeBuf = Buffer.alloc(8);
  sizeBuf.writeBigUInt64LE(blockSizeExcludingFirst8, 0);
  const magicBuf = Buffer.from('APK Sig Block 42', 'ascii');

  const apkSigningBlock = Buffer.concat([
    sizeBuf,
    idValuePair,
    sizeBuf,
    magicBuf
  ]);

  // Update EOCD with the new Central Directory offset (shifted by apkSigningBlock.length)
  const finalEocd = Buffer.from(eocdBuffer);
  finalEocd.writeUInt32LE(centralDirOffset + apkSigningBlock.length, 16);

  return Buffer.concat([
    beforeCdBuffer,
    apkSigningBlock,
    centralDirBuffer,
    finalEocd
  ]);
}

/**
 * Builds and signs a complete installable Android APK in pure Node.js
 * @param {Object} options
 * @param {string} options.appName - Display name of the Android app
 * @param {string} options.packageId - Valid Android package ID (e.g. com.owner.repo)
 * @param {string} [options.version='1.0.0'] - Version string
 * @param {string} [options.orientation='sensor'] - 'landscape' | 'portrait' | 'sensor'
 * @param {boolean} [options.fullscreen=true] - Whether to run in immersive fullscreen
 * @param {string} [options.startUrl='file:///android_asset/index.html'] - Entry URL
 * @param {Buffer} [options.iconBuffer] - Optional PNG icon buffer
 * @param {Array<{path: string, buffer: Buffer}>} options.webFiles - Web assets to bundle under assets/
 * @returns {Buffer} Signed APK Buffer
 */
function buildSignedApk({
  appName = 'My Web App',
  packageId = 'com.apkforge.webapp',
  version = '1.0.0',
  orientation = 'sensor',
  fullscreen = true,
  startUrl = 'file:///android_asset/index.html',
  iconBuffer = null,
  webFiles = []
}) {
  const cleanPackageId = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/i.test(packageId || '')
    ? packageId.toLowerCase()
    : 'com.apkforge.webapp';
  const cleanAppName = String(appName || 'My Web App').slice(0, 50);
  const cleanVersion = String(version || '1.0.0').slice(0, 20);

  let templateBuf = null;
  try {
    templateBuf = require('../templates/baseWebviewTemplate');
  } catch (_) {
    const candidatePaths = [
      path.join(__dirname, '..', 'templates', 'base-webview.apk'),
      path.join(__dirname, 'templates', 'base-webview.apk'),
      path.join(__dirname, 'base-webview.apk')
    ];
    const templatePath = candidatePaths.find(p => fs.existsSync(p)) || candidatePaths[0];
    templateBuf = fs.readFileSync(templatePath);
  }
  const baseEntries = readZipEntries(templateBuf);

  const finalFiles = new Map();

  // 1. Copy base entries (excluding old META-INF signatures and default assets)
  for (const entry of baseEntries) {
    if (entry.name.startsWith('META-INF/')) continue;
    if (entry.name.startsWith('assets/')) continue;

    if (entry.name === 'AndroidManifest.xml') {
      const patchedManifest = patchAndroidManifest(entry.data, {
        appName: cleanAppName,
        packageId: cleanPackageId,
        version: cleanVersion
      });
      finalFiles.set(entry.name, {
        data: patchedManifest,
        store: false
      });
    } else if (entry.name === 'res/drawable/ic_launcher.png' && iconBuffer) {
      finalFiles.set(entry.name, {
        data: iconBuffer,
        store: true // Store uncompressed & 4-byte aligned
      });
    } else {
      finalFiles.set(entry.name, {
        data: entry.data,
        store: entry.method === 0 // Keep resources.arsc and ic_launcher.png stored uncompressed
      });
    }
  }

  // 2. Inject assets/apkforge_config.json
  const configJson = Buffer.from(
    JSON.stringify({
      appName: cleanAppName,
      packageId: cleanPackageId,
      version: cleanVersion,
      orientation,
      fullscreen,
      startUrl: startUrl || 'file:///android_asset/index.html'
    }, null, 2),
    'utf8'
  );
  finalFiles.set('assets/apkforge_config.json', { data: configJson, store: false });

  // 3. Inject all developer web files into assets/
  for (const wf of webFiles) {
    const relPath = String(wf.path || '').replace(/^\/+/, '').replace(/\\/g, '/');
    if (!relPath || relPath.endsWith('.apk')) continue;
    const buf = Buffer.isBuffer(wf.buffer) ? wf.buffer : Buffer.from(String(wf.buffer || ''), 'utf8');
    finalFiles.set(`assets/${relPath}`, {
      data: buf,
      store: false
    });
  }

  // Ensure assets/index.html exists
  if (!finalFiles.has('assets/index.html')) {
    finalFiles.set('assets/index.html', {
      data: Buffer.from(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${cleanAppName}</title></head><body style="background:#0d1117;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><h1>${cleanAppName}</h1></body></html>`, 'utf8'),
      store: false
    });
  }

  // 4. Generate V1 JAR Signatures (META-INF/MANIFEST.MF, META-INF/CERT.SF, META-INF/CERT.RSA)
  const creds = getSigningCredentials();
  const manifestLines = [
    'Manifest-Version: 1.0',
    'Created-By: 1.0 (APKForge Pure Node Signer)',
    ''
  ];
  const sfEntries = [];

  for (const [name, fileObj] of finalFiles.entries()) {
    const sha256B64 = crypto.createHash('sha256').update(fileObj.data).digest('base64');
    const entryBlock = `Name: ${name}\r\nSHA-256-Digest: ${sha256B64}\r\n\r\n`;
    manifestLines.push(`Name: ${name}`, `SHA-256-Digest: ${sha256B64}`, '');
    const entryBlockDigest = crypto.createHash('sha256').update(Buffer.from(entryBlock, 'utf8')).digest('base64');
    sfEntries.push(`Name: ${name}`, `SHA-256-Digest: ${entryBlockDigest}`, '');
  }

  const manifestMfBuf = Buffer.from(manifestLines.join('\r\n'), 'utf8');
  const mainManifestDigest = crypto.createHash('sha256').update(manifestMfBuf).digest('base64');

  const sfHeader = [
    'Signature-Version: 1.0',
    'Created-By: 1.0 (APKForge Pure Node Signer)',
    `SHA-256-Digest-Manifest: ${mainManifestDigest}`,
    'X-Android-APK-Signed: 2',
    '',
    ...sfEntries
  ];
  const certSfBuf = Buffer.from(sfHeader.join('\r\n'), 'utf8');
  const certRsaBuf = createPkcs7Signature(certSfBuf, creds);

  finalFiles.set('META-INF/MANIFEST.MF', { data: manifestMfBuf, store: false });
  finalFiles.set('META-INF/CERT.SF', { data: certSfBuf, store: false });
  finalFiles.set('META-INF/CERT.RSA', { data: certRsaBuf, store: false });

  // 5. Write ZIP with 4-byte zipalign for uncompressed entries
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const [name, fileObj] of finalFiles.entries()) {
    const nameBuf = Buffer.from(name, 'utf8');
    const rawData = fileObj.data;
    const uncompSize = rawData.length;
    const fileCrc = crc32(rawData);

    const method = fileObj.store ? 0 : 8;
    const compData = method === 0 ? rawData : zlib.deflateRawSync(rawData);
    const compSize = compData.length;

    // Calculate extra padding for 4-byte alignment when method === 0 (STORE)
    let extraLen = 0;
    if (method === 0) {
      const dataStartUnpadded = offset + 30 + nameBuf.length;
      extraLen = (4 - (dataStartUnpadded % 4)) % 4;
    }
    const extraBuf = Buffer.alloc(extraLen, 0);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6); // UTF-8
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt16LE(0x0000, 10);
    localHeader.writeUInt16LE(0x0021, 12); // Fixed timestamp 1980-01-01
    localHeader.writeUInt32LE(fileCrc, 14);
    localHeader.writeUInt32LE(compSize, 18);
    localHeader.writeUInt32LE(uncompSize, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(extraBuf.length, 28);

    localParts.push(localHeader, nameBuf, extraBuf, compData);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt16LE(0x0000, 12);
    centralHeader.writeUInt16LE(0x0021, 14);
    centralHeader.writeUInt32LE(fileCrc, 16);
    centralHeader.writeUInt32LE(compSize, 20);
    centralHeader.writeUInt32LE(uncompSize, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, nameBuf);

    offset += 30 + nameBuf.length + extraBuf.length + compData.length;
  }

  // Pad before Central Directory to 4096-byte multiple for APK Signing Block v2 alignment
  const centralDirBuffer = Buffer.concat(centralParts);
  const totalEntries = finalFiles.size;

  const eocdBuffer = Buffer.alloc(22);
  eocdBuffer.writeUInt32LE(0x06054b50, 0);
  eocdBuffer.writeUInt16LE(0, 4);
  eocdBuffer.writeUInt16LE(0, 6);
  eocdBuffer.writeUInt16LE(totalEntries, 8);
  eocdBuffer.writeUInt16LE(totalEntries, 10);
  eocdBuffer.writeUInt32LE(centralDirBuffer.length, 12);
  eocdBuffer.writeUInt32LE(offset, 16);
  eocdBuffer.writeUInt16LE(0, 20);

  // 6. Insert APK Signature Scheme v2 Block (`APK Sig Block 42`)
  return insertApkSignatureV2Block(localParts, centralDirBuffer, eocdBuffer, offset, creds);
}

module.exports = {
  buildSignedApk,
  patchAndroidManifest
};
