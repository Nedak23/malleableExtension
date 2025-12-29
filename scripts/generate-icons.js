const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Generate a simple PNG with a solid color and "M" letter
// PNG format: signature + IHDR + IDAT + IEND

function createPNG(width, height) {
  // Colors (blue background #0066cc, white letter)
  const bgR = 0x00, bgG = 0x66, bgB = 0xcc;
  const fgR = 0xff, fgG = 0xff, fgB = 0xff;

  // Create raw pixel data (RGBA)
  const rawData = [];

  // Simple "M" pattern - calculate proportional positions
  const letterWidth = Math.floor(width * 0.7);
  const letterHeight = Math.floor(height * 0.6);
  const startX = Math.floor((width - letterWidth) / 2);
  const startY = Math.floor((height - letterHeight) / 2);
  const strokeWidth = Math.max(1, Math.floor(width / 8));

  for (let y = 0; y < height; y++) {
    rawData.push(0); // Filter byte for this row
    for (let x = 0; x < width; x++) {
      // Check if this pixel is part of the "M"
      const inLetterBounds = x >= startX && x < startX + letterWidth &&
                             y >= startY && y < startY + letterHeight;

      let isLetter = false;
      if (inLetterBounds) {
        const lx = x - startX; // Local x within letter bounds
        const ly = y - startY; // Local y within letter bounds

        // Left vertical stroke
        if (lx < strokeWidth) isLetter = true;
        // Right vertical stroke
        if (lx >= letterWidth - strokeWidth) isLetter = true;
        // Left diagonal (top part of M)
        const diagProgress = ly / letterHeight;
        const leftDiagX = diagProgress * (letterWidth / 2);
        if (Math.abs(lx - leftDiagX) < strokeWidth && ly < letterHeight * 0.6) isLetter = true;
        // Right diagonal (top part of M)
        const rightDiagX = letterWidth - diagProgress * (letterWidth / 2);
        if (Math.abs(lx - rightDiagX) < strokeWidth && ly < letterHeight * 0.6) isLetter = true;
      }

      if (isLetter) {
        rawData.push(fgR, fgG, fgB, 255);
      } else {
        rawData.push(bgR, bgG, bgB, 255);
      }
    }
  }

  // Compress the raw data
  const compressed = zlib.deflateSync(Buffer.from(rawData), { level: 9 });

  // Build PNG file
  const chunks = [];

  // PNG signature
  chunks.push(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]));

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8);  // bit depth
  ihdr.writeUInt8(6, 9);  // color type (RGBA)
  ihdr.writeUInt8(0, 10); // compression
  ihdr.writeUInt8(0, 11); // filter
  ihdr.writeUInt8(0, 12); // interlace
  chunks.push(createChunk('IHDR', ihdr));

  // IDAT chunk
  chunks.push(createChunk('IDAT', compressed));

  // IEND chunk
  chunks.push(createChunk('IEND', Buffer.alloc(0)));

  return Buffer.concat(chunks);
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const typeBuffer = Buffer.from(type, 'ascii');
  const crcData = Buffer.concat([typeBuffer, data]);
  const crc = crc32(crcData);

  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc, 0);

  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

// CRC32 implementation for PNG
function crc32(data) {
  let crc = 0xffffffff;
  const table = makeCRCTable();

  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ data[i]) & 0xff];
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function makeCRCTable() {
  const table = new Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = ((c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1));
    }
    table[n] = c;
  }
  return table;
}

// Generate icons
const sizes = [16, 48, 128];
const iconsDir = path.join(__dirname, '..', 'assets', 'icons');

sizes.forEach(size => {
  const png = createPNG(size, size);
  const filePath = path.join(iconsDir, `icon${size}.png`);
  fs.writeFileSync(filePath, png);
  console.log(`Generated ${filePath} (${png.length} bytes)`);
});

console.log('Icons generated successfully!');
