// src/downgrade.js
const { BufferList }   = require('bl');
const { HeaderMagicClassic, Version } = require('./common');
const { writeBlock, getBlockSize }    = require('./blocks');
const { uint32, uint8 }               = require('./util/alloc');
const commandToBuf                    = require('./commands/cmd-to-buf');
const { CMDS }                        = require('./commands/commands');
const CommandsStream                  = require('./commands/commands-stream');
const fs       = require('fs');
const pkware                          = require('pkware-wasm');  // ✅ ADD THIS
const { fixPlayerColorsForDowngrade } = require('./header');

const dumpFrame = (buf, frame, frameBuf) => {
  buf.append(uint32(frame));
  buf.append(uint8(frameBuf.length));
  buf.append(frameBuf);
};

const downgradeReplay = async (replay, chkDowngrader, filePath) => {
  const bl = new BufferList();
  
  // ✅ Magic: RAW BYTES, NOT A BLOCK, replay magic=reRS Or seRS, exist @ byte 13, so if index[12] == (0x73|115|s) then v1.21+
  console.log(`📝 Writing magic: 0x${HeaderMagicClassic.toString(16)}`);
  await writeBlock(bl, uint32(HeaderMagicClassic), false);
  console.log(`   Total size so far: ${bl.length}`);

  // Header: BLOCK, the 4 bytes @index[28:32] is the actual compressed header length, (0x78|120|x) @index[33] is the mark for zlib compression
  console.log(`\n📦 Writing header block while fixing player colors (always reading 0x279=633 bytes decompressed)`);
  const fixedHeader = fixPlayerColorsForDowngrade(replay.rawHeader, replay.chk);
  await writeBlock(bl, fixedHeader, true);
  console.log(`   Total size so far: ${bl.length}`);

  // Commands
  const commandsBuf  = new BufferList();
  let   currFrame    = 0;
  let   frameBuf     = new BufferList();
  let   cmd;

  const cmds         = new CommandsStream(replay.rawCmds);
  const g            = cmds.generate();
  const isRemastered = replay.version === Version.remastered;
  const unitLimit    = replay.limits?.units ?? 1700;

  // Loop through the CommandsStream, cmd is a dynamic type that can be a frame# or cmd object.
  try {
    while ((cmd = g.next().value)) {
      if (typeof cmd === 'number') {
        if (cmd !== currFrame) {
          dumpFrame(commandsBuf, currFrame, frameBuf);
          frameBuf  = new BufferList();
          currFrame = cmd;
        }
        continue;
      }

      if (cmd.skipped && !cmd.data) {
        console.log('Skipped cmd or no data: @ frame:', currFrame);
        continue;
      }

      // maps cmd-id & unit-id to v16 equivalents.
      const [cmdId, data] = commandToBuf(cmd.cmdId, cmd, isRemastered, unitLimit, currFrame);

      if (data.length !== CMDS[cmdId].length(data)) {
        throw new Error('saved length and command length do not match');
      }

      // Each frame is limited to 255 bytes; start a new frame if we overflow
      if (data.length + 2 + frameBuf.length > 255) {
        console.log('overflow split at frame', currFrame);
        dumpFrame(commandsBuf, currFrame, frameBuf);
        frameBuf = new BufferList();
      }

      frameBuf.append(uint8(cmd.player));
      frameBuf.append(uint8(cmdId));
      frameBuf.append(data);

      //loggy
      // console.log(String(currFrame).padStart(5, '0'), cmd.player, cmd.cmdId, data, '\n');
    }

    if (frameBuf.length) {
      dumpFrame(commandsBuf, currFrame, frameBuf);
    }
  } catch (e) {
    console.log('error', e);
  }

  await writeBlock(bl, uint32(commandsBuf.length), false);
  console.log(`   Total size so far: ${bl.length}`);

  // Commands: BLOCK
  console.log(`\n📦 Writing commands block (${commandsBuf.length} bytes decompressed)`);
  // Commands: only write block if there are commands
  if (commandsBuf.length > 0) {
    await writeBlock(bl, commandsBuf, true);
  }
  
  console.log(`   Total size so far: ${bl.length}`);
  console.log('commands-size decompressed & compressed:', commandsBuf.length, await getBlockSize(commandsBuf));

  // CHK
  const chk = chkDowngrader.downgrade(replay.chk.slice(0));
  fs.writeFileSync(filePath + '.downgraded.chk', Buffer.from(chk));
  console.log(`\n---> Saved downgraded CHK: ${chk.length} bytes`);

  const chkLength = chk.length ?? chk.byteLength ?? 0;
  await writeBlock(bl, uint32(chkLength), false);
  console.log(`   Total size so far: ${bl.length}`);

  // CHK: BLOCK
  console.log(`\n📦 Writing CHK block (${chkLength} bytes decompressed)`);
  await writeBlock(bl, chk, true);
  console.log(`   Total size so far: ${bl.length}`);

  return bl.slice(0);
};

module.exports = downgradeReplay;