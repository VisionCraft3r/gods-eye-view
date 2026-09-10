import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function pad4(n) {
  return Math.ceil(n / 4) * 4;
}

const positions = [];
const normals = [];
const colors = [];

function face(n, pts, color) {
  const [a, b, c, d] = pts;
  for (const p of [a, b, c, a, c, d]) {
    positions.push(...p);
    normals.push(...n);
    colors.push(...color);
  }
}

const gold = [0.94, 0.76, 0.29];
const dark = [0.12, 0.12, 0.14];
const cyan = [0.05, 0.72, 0.82];
const x0 = -10;
const x1 = 10;
const y0 = 0;
const y1 = 3.1;
const z0 = -1.55;
const z1 = 1.55;
face([0, 1, 0], [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], gold);
face([0, -1, 0], [[x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0]], dark);
face([0, 0, 1], [[x0, y0, z1], [x0, y1, z1], [x1, y1, z1], [x1, y0, z1]], gold);
face([0, 0, -1], [[x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z0]], gold);
face([-1, 0, 0], [[x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]], cyan);
face([1, 0, 0], [[x1, y0, z1], [x1, y1, z1], [x1, y1, z0], [x1, y0, z0]], dark);

const pos = Float32Array.from(positions);
const nor = Float32Array.from(normals);
const col = Float32Array.from(colors);
const idx = Uint16Array.from({ length: pos.length / 3 }, (_, i) => i);

const json = {
  asset: { version: '2.0', generator: 'GodsEye ONCF' },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0 }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1, COLOR_0: 2 }, indices: 3 }] }],
  accessors: [
    {
      bufferView: 0, componentType: 5126, count: pos.length / 3, type: 'VEC3',
      min: [-10, 0, -1.55], max: [10, 3.1, 1.55],
    },
    { bufferView: 1, componentType: 5126, count: nor.length / 3, type: 'VEC3' },
    { bufferView: 2, componentType: 5126, count: col.length / 3, type: 'VEC3' },
    { bufferView: 3, componentType: 5123, count: idx.length, type: 'SCALAR' },
  ],
  bufferViews: [
    { buffer: 0, byteOffset: 0, byteLength: pos.byteLength, target: 34962 },
    { buffer: 0, byteOffset: pad4(pos.byteLength), byteLength: nor.byteLength, target: 34962 },
    { buffer: 0, byteOffset: pad4(pos.byteLength) + pad4(nor.byteLength), byteLength: col.byteLength, target: 34962 },
    {
      buffer: 0,
      byteOffset: pad4(pos.byteLength) + pad4(nor.byteLength) + pad4(col.byteLength),
      byteLength: idx.byteLength,
      target: 34963,
    },
  ],
};
const binLen = pad4(pos.byteLength) + pad4(nor.byteLength) + pad4(col.byteLength) + pad4(idx.byteLength);
json.buffers = [{ byteLength: binLen }];

const jsonBuf = Buffer.from(JSON.stringify(json));
const jsonPad = pad4(jsonBuf.length);
const total = 12 + 8 + jsonPad + 8 + binLen;
const out = Buffer.alloc(total);
out.write('glTF', 0);
out.writeUInt32LE(2, 4);
out.writeUInt32LE(total, 8);
out.writeUInt32LE(jsonPad, 12);
out.writeUInt32LE(0x4E4F534A, 16);
jsonBuf.copy(out, 20);
out.writeUInt32LE(binLen, 20 + jsonPad);
out.writeUInt32LE(0x004E4942, 24 + jsonPad);
let o = 28 + jsonPad;
Buffer.from(pos.buffer, pos.byteOffset, pos.byteLength).copy(out, o);
o += pad4(pos.byteLength);
Buffer.from(nor.buffer, nor.byteOffset, nor.byteLength).copy(out, o);
o += pad4(nor.byteLength);
Buffer.from(col.buffer, col.byteOffset, col.byteLength).copy(out, o);
o += pad4(col.byteLength);
Buffer.from(idx.buffer, idx.byteOffset, idx.byteLength).copy(out, o);

const dest = path.join(path.dirname(fileURLToPath(import.meta.url)), '../public/models/train.glb');
writeFileSync(dest, out);
console.log(dest, out.length);
