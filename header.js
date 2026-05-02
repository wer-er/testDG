// src/header.js (enhanced)

const BW_COLORS_RGB = [
  { r: 244, g: 4,   b: 4   },   // 0: Red
  { r: 12,  g: 72,  b: 204 },   // 1: Blue
  { r: 44,  g: 180, b: 148 },   // 2: Teal
  { r: 136, g: 64,  b: 156 },   // 3: Purple
  { r: 248, g: 140, b: 20  },   // 4: Orange
  { r: 112, g: 48,  b: 20  },   // 5: Brown
  { r: 204, g: 224, b: 208 },   // 6: White
  { r: 252, g: 252, b: 56  },   // 7: Yellow
  { r: 8,   g: 128, b: 8   },   // 8: Green
  { r: 252, g: 252, b: 124 },   // 9: Pale Yellow
  { r: 236, g: 196, b: 176 },   // 10: Tan
  { r: 64,  g: 104, b: 212 },   // 11: Navy
  { r: 116, g: 164, b: 124 },   // 12: Khaki
  { r: 144, g: 144, b: 184 },   // 13: Magenta
  { r: 252, g: 252, b: 124 },   // 14: Pale Purple (duplicate of 9)
  { r: 0,   g: 228, b: 252 },   // 15: Cyan
];

/**
 * Calculate RGB distance for color matching
 */
function colorDistance(rgb1, rgb2) {
  const dr = rgb1.r - rgb2.r;
  const dg = rgb1.g - rgb2.g;
  const db = rgb1.b - rgb2.b;
  return dr * dr + dg * dg + db * db;
}

/**
 * Find closest BW color to an RGB value
 */
function findClosestBWColor(r, g, b) {
  let minDist = Infinity;
  let closestIndex = 0;
  
  for (let i = 0; i < BW_COLORS_RGB.length; i++) {
    const dist = colorDistance({ r, g, b }, BW_COLORS_RGB[i]);
    if (dist < minDist) {
      minDist = dist;
      closestIndex = i;
    }
  }
  
  return closestIndex;
}

/**
 * Fix player colors using CRGB chunk if available
 */
function fixPlayerColorsForDowngrade(headerBuf, chkBuf) {
  const buf = Buffer.from(headerBuf);
  
  // Try to extract CRGB chunk from CHK
  let scrColors = null;
  if (chkBuf) {
    const crgbChunk = findChunkInChk(chkBuf, 'CRGB');
    if (crgbChunk) {
      scrColors = crgbChunk; // CRGB is 8 * 4 bytes (8 players, 4 bytes each = XRGB)
    }
  }
  
  // Fix each player's color
  for (let i = 0; i < 8; i++) {
    const offset = 0x251 + i * 4;
    
    let bwColorIndex = 0;
    
    if (scrColors && scrColors.length >= (i + 1) * 4) {
      // Extract XRGB from CRGB chunk (X byte is usually 0)
      const colorData = scrColors.readUInt32LE(i * 4);
      const r = (colorData >> 8) & 0xFF;
      const g = (colorData >> 16) & 0xFF;
      const b = (colorData >> 24) & 0xFF;
      
      console.log(`  Player ${i}: SCR color RGB(${r}, ${g}, ${b}) → BW color ${bwColorIndex}`);
      bwColorIndex = findClosestBWColor(r, g, b);
    }
    
    buf.writeUInt32LE(bwColorIndex, offset);
  }
  
  return buf;
}

function findChunkInChk(chkBuf, chunkName) {
  let pos = 0;
  while (pos + 8 <= chkBuf.length) {
    const name = chkBuf.toString('ascii', pos, pos + 4);
    const size = chkBuf.readUInt32LE(pos + 4);
    
    if (name === chunkName) {
      return chkBuf.slice(pos + 8, pos + 8 + size);
    }
    pos += 8 + size;
  }
  return null;
}

module.exports = { fixPlayerColorsForDowngrade, BW_COLORS_RGB };