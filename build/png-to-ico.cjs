const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const src = path.resolve(__dirname, '..', 'assets', 'vitruvian man_whitebg.png');
const dest = path.resolve(__dirname, 'icon.ico');

const sizes = [16, 32, 48, 256];

async function build() {
  const pngs = await Promise.all(
    sizes.map((s) =>
      sharp(src)
        .resize(s, s, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
        .png()
        .toBuffer()
    )
  );

  const headerSize = 6;
  const entrySize = 16;
  let dataOffset = headerSize + entrySize * pngs.length;

  // ICO header
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);

  // Directory entries
  const entries = [];
  for (let i = 0; i < pngs.length; i++) {
    const entry = Buffer.alloc(entrySize);
    const s = sizes[i];
    entry.writeUInt8(s < 256 ? s : 0, 0);
    entry.writeUInt8(s < 256 ? s : 0, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(pngs[i].length, 8);
    entry.writeUInt32LE(dataOffset, 12);
    dataOffset += pngs[i].length;
    entries.push(entry);
  }

  fs.writeFileSync(dest, Buffer.concat([header, ...entries, ...pngs]));
  console.log('Created', dest, 'with sizes:', sizes.join(', '));
}

build().catch((e) => { console.error(e); process.exit(1); });
