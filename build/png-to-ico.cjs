const fs = require('fs');
const path = require('path');

const pngPath = path.resolve(__dirname, '..', 'assets', 'vitruvian man_whitebg.png');
const icoPath = path.resolve(__dirname, 'icon.ico');

const png = fs.readFileSync(pngPath);

// ICO header: reserved(2) + type=1(2) + count=1(2)
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);

// Directory entry (16 bytes): width, height, colors, reserved, planes, bpp, size, offset
const entry = Buffer.alloc(16);
entry.writeUInt8(0, 0);          // width: 0 = 256
entry.writeUInt8(0, 1);          // height: 0 = 256
entry.writeUInt8(0, 2);          // color palette count
entry.writeUInt8(0, 3);          // reserved
entry.writeUInt16LE(1, 4);       // color planes
entry.writeUInt16LE(32, 6);      // bits per pixel
entry.writeUInt32LE(png.length, 8);   // image data size
entry.writeUInt32LE(6 + 16, 12);      // offset to image data

fs.writeFileSync(icoPath, Buffer.concat([header, entry, png]));
console.log('Created', icoPath, '(' + png.length + ' bytes PNG embedded)');
