/* Crop a PNG vertically into slices — dev utility, no dependencies.
     node tools/png-slice.js shot.png outPrefix [sliceHeight] [maxWidth] */
const fs = require("fs");
const zlib = require("zlib");
const path = require("path");

function readPNG(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a png");
  let pos = 8, width = 0, height = 0, bitDepth = 0, colorType = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  if (bitDepth !== 8) throw new Error("only 8-bit supported");
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : 0;
  if (!channels) throw new Error("unsupported color type " + colorType);

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);
  let rp = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[rp++];
    const row = raw.subarray(rp, rp + stride);
    rp += stride;
    const prev = y ? out.subarray((y - 1) * stride, y * stride) : null;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= channels ? prev[x - channels] : 0;
      const v = row[x];
      let val;
      switch (filter) {
        case 0: val = v; break;
        case 1: val = v + a; break;
        case 2: val = v + b; break;
        case 3: val = v + ((a + b) >> 1); break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          val = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default: throw new Error("bad filter " + filter);
      }
      cur[x] = val & 0xff;
    }
  }
  return { width, height, channels, pixels: out };
}

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = c ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function writePNG(file, width, height, channels, pixels) {
  const stride = width * channels;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = channels === 4 ? 6 : channels === 3 ? 2 : 0;
  fs.writeFileSync(file, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 6 })),
    chunk("IEND", Buffer.alloc(0)),
  ]));
}

const [, , src, prefix, sliceArg, maxWArg] = process.argv;
const sliceH = Number(sliceArg || 900);
const maxW = Number(maxWArg || 1100);
const img = readPNG(src);
const scale = Math.min(1, maxW / img.width);
const outW = Math.round(img.width * scale);
const outH = Math.round(img.height * scale);
const outCh = img.channels;
const scaled = Buffer.alloc(outW * outH * outCh);
for (let y = 0; y < outH; y++) {
  const sy = Math.min(img.height - 1, Math.round(y / scale));
  for (let x = 0; x < outW; x++) {
    const sx = Math.min(img.width - 1, Math.round(x / scale));
    const s = (sy * img.width + sx) * img.channels;
    const d = (y * outW + x) * outCh;
    for (let c = 0; c < outCh; c++) scaled[d + c] = img.pixels[s + c];
  }
}
let n = 0;
for (let y = 0; y < outH; y += sliceH) {
  const h = Math.min(sliceH, outH - y);
  const slice = Buffer.alloc(outW * h * outCh);
  scaled.copy(slice, 0, y * outW * outCh, (y + h) * outW * outCh);
  const file = `${prefix}-${String(++n).padStart(2, "0")}.png`;
  writePNG(file, outW, h, outCh, slice);
  console.log(`${path.basename(file)}  ${outW}x${h}`);
}
console.log(`from ${img.width}x${img.height} → scaled ${outW}x${outH}`);
