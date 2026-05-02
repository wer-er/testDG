const cstring = require('./util/cstring');

// Player slot colors in display order
const PLAYER_COLORS = [
  { name: 'Red',          id: 0x00, rgb: 0xf40404, hex: '#f40404' },
  { name: 'Blue',         id: 0x01, rgb: 0x0c48cc, hex: '#0c48cc' },
  { name: 'Teal',         id: 0x02, rgb: 0x2cb494, hex: '#2cb494' },
  { name: 'Purple',       id: 0x03, rgb: 0x88409c, hex: '#88409c' },
  { name: 'Orange',       id: 0x04, rgb: 0xf88c14, hex: '#f88c14' },
  { name: 'Brown',        id: 0x05, rgb: 0x703014, hex: '#703014' },
  { name: 'White',        id: 0x06, rgb: 0xcce0d0, hex: '#cce0d0' },
  { name: 'Yellow',       id: 0x07, rgb: 0xfcfc38, hex: '#fcfc38' },
  { name: 'Green',        id: 0x08, rgb: 0x088008, hex: '#088008' },
  { name: 'Pale Yellow',  id: 0x09, rgb: 0xfcfc7c, hex: '#fcfc7c' },
  { name: 'Tan',          id: 0x0a, rgb: 0xecc4b0, hex: '#ecc4b0' },
  { name: 'Aqua',         id: 0x0b, rgb: 0x4068d4, hex: '#4068d4' },
  { name: 'Pale Green',   id: 0x0c, rgb: 0x74a47c, hex: '#74a47c' },
  { name: 'Blueish Grey', id: 0x0d, rgb: 0x9090b8, hex: '#9090b8' },
  { name: 'Pale Yellow2', id: 0x0e, rgb: 0xfcfc7c, hex: '#fcfc7c' },
  { name: 'Cyan',         id: 0x0f, rgb: 0x00e4fc, hex: '#00e4fc' },
];

const raceStr = (race) => {
  switch (race) {
    case 0: return 'zerg';
    case 1: return 'terran';
    case 2: return 'protoss';
    default: return 'unknown';
  }
};

const getPlayerColor = (slot) =>
  slot < 8 ? PLAYER_COLORS[slot] : PLAYER_COLORS[0x6];

/**
 * Parse a raw 0x279-byte StarCraft replay header buffer.
 * Returns a structured object with game metadata and player list.
 */
const parseHeader = (buf) => {
  let pos = 0;
  const nextUint8  = ()  => { const v = buf.readUInt8(pos);   pos += 1; return v; };
  const nextUint16 = ()  => { const v = buf.readInt16LE(pos); pos += 2; return v; };
  const nextUint32 = ()  => { const v = buf.readUInt32LE(pos); pos += 4; return v; };
  const next       = (n) => { const v = buf.slice(pos, pos + n); pos += n; return v; };

  const isBroodwar          = nextUint8();
  const frameCount          = nextUint32();
  const campaignId          = nextUint16();
  const commandByte         = nextUint8();
  const randomSeed          = nextUint32();
  const playerBytes         = next(8);
  const unk1                = nextUint32();
  const playerName          = next(24);
  const gameFlags           = nextUint32();
  const mapWidth            = nextUint16();
  const mapHeight           = nextUint16();
  const activePlayerCount   = nextUint8();
  const slotCount           = nextUint8();
  const gameSpeed           = nextUint8();
  const gameState           = nextUint8();
  const gameType            = nextUint16();
  const gameSubtype         = nextUint16();
  const unk2                = nextUint32();
  const tileset             = nextUint16();
  const replayAutoSave      = nextUint8();
  const computerPlayerCount = nextUint8();
  const gameName            = cstring(next(25));
  const mapName             = cstring(next(32));
  const unk3                = nextUint16();
  const unk4                = nextUint16();
  const unk5                = nextUint16();
  const unk6                = nextUint16();
  const victoryCondition    = nextUint8();
  const resourceType        = nextUint8();
  const useStandardUnitStats = nextUint8();
  const fogOfWarEnabled     = nextUint8();
  const createInitialUnits  = nextUint8();
  const useFixedPositions   = nextUint8();
  const restrictionFlags    = nextUint8();
  const alliesEnabled       = nextUint8();
  const teamsEnabled        = nextUint8();
  const cheatsEnabled       = nextUint8();
  const tournamentMode      = nextUint8();
  const victoryConditionValue = nextUint32();
  const startingMinerals    = nextUint32();
  const startingGas         = nextUint32();
  const unk7                = nextUint8();

  const players = [];
  for (let i = 0; i < 8; i++) {
    const offset = 0xa1 + 0x24 * i;
    const type   = buf.readUInt8(offset + 0x8);
    if (type === 1 || type === 2) {
      players.push({
        id:         buf.readUInt32LE(offset),
        isComputer: type === 1,
        race:       raceStr(buf.readUInt8(offset + 0x9)),
        name:       cstring(buf.slice(offset + 0xb, offset + 0xb + 0x19)),
        team:       buf.readUInt8(offset + 0xa),
        color:      getPlayerColor(buf.readUInt32LE(0x251 + i * 4)),
      });
    }
  }

  return {
    isBroodwar,
    gameName,
    mapName,
    gameType,
    gameSubtype,
    players,
    frameCount,
    randomSeed,
    // Less commonly needed fields grouped here
    ancillary: {
      campaignId, commandByte, playerBytes, unk1, playerName,
      gameFlags, mapWidth, mapHeight, activePlayerCount, slotCount,
      gameSpeed, gameState, unk2, tileset, replayAutoSave,
      computerPlayerCount, unk3, unk4, unk5, unk6,
      victoryCondition, resourceType, useStandardUnitStats,
      fogOfWarEnabled, createInitialUnits, useFixedPositions,
      restrictionFlags, alliesEnabled, teamsEnabled,
      cheatsEnabled, tournamentMode, victoryConditionValue,
      startingMinerals, startingGas, unk7,
    },
  };
};

// ==================== COLOR FIXING FOR DOWNGRADE ====================

/**
 * Find a chunk by name in the CHK buffer
 */
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
  
  for (let i = 0; i < PLAYER_COLORS.length; i++) {
    const color = PLAYER_COLORS[i];
    const cr = (color.rgb >> 0) & 0xFF;
    const cg = (color.rgb >> 8) & 0xFF;
    const cb = (color.rgb >> 16) & 0xFF;
    
    const dist = colorDistance({ r, g, b }, { r: cr, g: cg, b: cb });
    if (dist < minDist) {
      minDist = dist;
      closestIndex = i;
    }
  }
  
  return closestIndex;
}

/**
 * Fix player colors in the replay header when downgrading from SCR
 * Extracts actual RGB colors from CRGB chunk and maps to closest BW color
 * 
 * @param {Buffer} headerBuf - The 0x279 byte header buffer
 * @param {Buffer} chkBuf - The CHK buffer (optional, for CRGB chunk)
 * @returns {Buffer} - Modified header with BW-compatible color indices
 */
function fixPlayerColorsForDowngrade(headerBuf, chkBuf) {
  // ✅ DEBUG: Check input
  if (!headerBuf || headerBuf.length === 0) {
    console.warn('⚠️  fixPlayerColorsForDowngrade: headerBuf is empty or invalid');
    return headerBuf;
  }
  
  console.log(`📋 Input headerBuf length: ${headerBuf.length}`);
  
  // ✅ Create a REAL copy of the buffer
  const buf = Buffer.alloc(headerBuf.length);
  headerBuf.copy(buf, 0);
  
  console.log(`📋 Output buf length after alloc: ${buf.length}`);
  console.log(`📋 First 16 bytes of original: ${headerBuf.slice(0, 16).toString('hex')}`);
  console.log(`📋 First 16 bytes of copy: ${buf.slice(0, 16).toString('hex')}`);
  
  // Try to extract CRGB chunk from CHK
  let scrColors = null;
  if (chkBuf) {
    scrColors = findChunkInChk(chkBuf, 'CRGB');
  }
  
  console.log(`\n🎨 Fixing player colors:`);
  
  // Fix each player's color
  for (let i = 0; i < 8; i++) {
    const offset = 0x251 + i * 4;
    const currentColorIndex = buf.readUInt32LE(offset);
    
    let bwColorIndex = currentColorIndex % 16;
    
    // If we have CRGB chunk, use actual RGB colors
    if (scrColors && scrColors.length >= (i + 1) * 4) {
      try {
        // CRGB format: XRGB (1 byte unused, then B, G, R)
        const colorData = scrColors.readUInt32LE(i * 4);
        const r = (colorData >> 16) & 0xFF;
        const g = (colorData >> 8) & 0xFF;
        const b = (colorData >> 0) & 0xFF;
        
        bwColorIndex = findClosestBWColor(r, g, b);
        console.log(`   Player ${i}: SCR RGB(${r}, ${g}, ${b}) → BW color ${bwColorIndex} (${PLAYER_COLORS[bwColorIndex].name})`);
      } catch (e) {
        console.warn(`   Player ${i}: Error reading CRGB, using ${bwColorIndex}`);
      }
    } else if (currentColorIndex !== bwColorIndex) {
      console.log(`   Player ${i}: Color ${currentColorIndex} → ${bwColorIndex}`);
    }
    
    buf.writeUInt32LE(bwColorIndex, offset);
  }
  
  console.log(`📋 First 16 bytes after color fix: ${buf.slice(0, 16).toString('hex')}`);
  
  return buf;
}

// Export both the parser and color fixing functions
module.exports = parseHeader;
module.exports.fixPlayerColorsForDowngrade = fixPlayerColorsForDowngrade;
module.exports.PLAYER_COLORS = PLAYER_COLORS;