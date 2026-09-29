// Generates the PWA icons as PNG with no dependencies (zlib + a tiny rasterizer).
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [16, 18, 20];
const FG = [79, 209, 139];
const BALL = [235, 104, 52];

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size, paint) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b] = paint(x / size, y / size);
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const inRect = (x, y, x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;

// Dumbbell centered in the maskable safe zone, plus a small padel ball.
function paint(x, y) {
  if (inRect(x, y, 0.28, 0.47, 0.72, 0.53)) return FG; // bar
  if (inRect(x, y, 0.22, 0.34, 0.30, 0.66)) return FG; // left plate
  if (inRect(x, y, 0.70, 0.34, 0.78, 0.66)) return FG; // right plate
  if (inRect(x, y, 0.17, 0.40, 0.22, 0.60)) return FG;
  if (inRect(x, y, 0.78, 0.40, 0.83, 0.60)) return FG;
  const dx = x - 0.66, dy = y - 0.24;
  if (dx * dx + dy * dy < 0.07 * 0.07) return BALL;
  return BG;
}

mkdirSync('public/icons', { recursive: true });
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  writeFileSync(`public/icons/${name}`, png(size, paint));
}
writeFileSync('public/icons/icon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<rect width="100" height="100" rx="18" fill="rgb(${BG})"/>
<g fill="rgb(${FG})"><rect x="28" y="47" width="44" height="6"/><rect x="22" y="34" width="8" height="32"/><rect x="70" y="34" width="8" height="32"/><rect x="17" y="40" width="5" height="20"/><rect x="78" y="40" width="5" height="20"/></g>
<circle cx="66" cy="24" r="7" fill="rgb(${BALL})"/></svg>`);
console.log('Icone generate in public/icons');
