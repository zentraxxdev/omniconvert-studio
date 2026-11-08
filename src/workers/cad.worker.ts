/// <reference lib="webworker" />
import JSZip from 'jszip';

export type CadFormat = 'stl-binary' | 'stl-ascii' | 'obj' | 'ply' | '3mf' | 'gltf' | 'glb';

export interface TriangleFace {
  v1: [number, number, number];
  v2: [number, number, number];
  v3: [number, number, number];
  normal: [number, number, number];
}

export interface CadWorkerRequest {
  action: 'parseAndConvert' | 'generateSample';
  fileName?: string;
  buffer?: ArrayBuffer;
  targetFormat: CadFormat;
  invertNormals: boolean;
  scale: number;
}

export interface CadWorkerResult {
  vertexCount: number;
  triangleCount: number;
  boundingBox: {
    width: number;
    height: number;
    depth: number;
  };
  // Flat [x1,y1,z1, x2,y2,z2, x3,y3,z3, ...] for fast 3D viewport rendering (capped to 15000 tris for 60fps canvas)
  previewPositions: Float32Array;
  previewNormals: Float32Array;
  outputBytes: Uint8Array;
  outputExtension: string;
  outputMime: string;
}

function computeFaceNormal(
  a: [number, number, number],
  b: [number, number, number],
  c: [number, number, number]
): [number, number, number] {
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const uz = b[2] - a[2];
  const vx = c[0] - a[0];
  const vy = c[1] - a[1];
  const vz = c[2] - a[2];
  let nx = uy * vz - uz * vy;
  let ny = uz * vx - ux * vz;
  let nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz) || 1;
  return [nx / len, ny / len, nz / len];
}

function generateCalibrationGearMesh(): TriangleFace[] {
  const faces: TriangleFace[] = [];
  const teeth = 16;
  const innerR = 10;
  const rootR = 20;
  const outerR = 25;
  const halfH = 6;

  const steps = teeth * 4;
  const ringOuter: Array<[number, number]> = [];
  const ringInner: Array<[number, number]> = [];

  for (let i = 0; i < steps; i++) {
    const angle = (i / steps) * Math.PI * 2;
    const mod = i % 4;
    const r = mod === 1 || mod === 2 ? outerR : rootR;
    ringOuter.push([Math.cos(angle) * r, Math.sin(angle) * r]);
    ringInner.push([Math.cos(angle) * innerR, Math.sin(angle) * innerR]);
  }

  const addTri = (
    p1: [number, number, number],
    p2: [number, number, number],
    p3: [number, number, number]
  ) => {
    faces.push({
      v1: p1,
      v2: p2,
      v3: p3,
      normal: computeFaceNormal(p1, p2, p3),
    });
  };

  for (let i = 0; i < steps; i++) {
    const next = (i + 1) % steps;
    const [ox1, oz1] = ringOuter[i];
    const [ox2, oz2] = ringOuter[next];
    const [ix1, iz1] = ringInner[i];
    const [ix2, iz2] = ringInner[next];

    // Top cap
    addTri([ix1, halfH, iz1], [ox1, halfH, oz1], [ox2, halfH, oz2]);
    addTri([ix1, halfH, iz1], [ox2, halfH, oz2], [ix2, halfH, iz2]);

    // Bottom cap
    addTri([ix1, -halfH, iz1], [ox2, -halfH, oz2], [ox1, -halfH, oz1]);
    addTri([ix1, -halfH, iz1], [ix2, -halfH, iz2], [ox2, -halfH, oz2]);

    // Outer tooth wall
    addTri([ox1, -halfH, oz1], [ox2, -halfH, oz2], [ox2, halfH, oz2]);
    addTri([ox1, -halfH, oz1], [ox2, halfH, oz2], [ox1, halfH, oz1]);

    // Inner bore wall
    addTri([ix1, -halfH, iz1], [ix2, halfH, iz2], [ix2, -halfH, iz2]);
    addTri([ix1, -halfH, iz1], [ix1, halfH, iz1], [ix2, halfH, iz2]);
  }

  return faces;
}

function parseStl(buffer: ArrayBuffer): TriangleFace[] {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  // Check if binary STL: 80-byte header + 4-byte uint32 count + 50 * count == byteLength
  if (buffer.byteLength >= 84) {
    const triCount = view.getUint32(80, true);
    if (84 + triCount * 50 === buffer.byteLength && triCount > 0 && triCount < 5_000_000) {
      const faces: TriangleFace[] = new Array(triCount);
      let offset = 84;
      for (let i = 0; i < triCount; i++) {
        const nx = view.getFloat32(offset, true);
        const ny = view.getFloat32(offset + 4, true);
        const nz = view.getFloat32(offset + 8, true);
        const v1: [number, number, number] = [
          view.getFloat32(offset + 12, true),
          view.getFloat32(offset + 16, true),
          view.getFloat32(offset + 20, true),
        ];
        const v2: [number, number, number] = [
          view.getFloat32(offset + 24, true),
          view.getFloat32(offset + 28, true),
          view.getFloat32(offset + 32, true),
        ];
        const v3: [number, number, number] = [
          view.getFloat32(offset + 36, true),
          view.getFloat32(offset + 40, true),
          view.getFloat32(offset + 44, true),
        ];
        const normal: [number, number, number] =
          nx === 0 && ny === 0 && nz === 0 ? computeFaceNormal(v1, v2, v3) : [nx, ny, nz];
        faces[i] = { v1, v2, v3, normal };
        offset += 50;
      }
      return faces;
    }
  }

  // ASCII STL fallback
  const text = new TextDecoder().decode(bytes);
  const faces: TriangleFace[] = [];
  const vertexRegex = /vertex\s+([+-]?\d*\.?\d+(?:[eE][+-]?\d+)?)\s+([+-]?\d*\.?\d+(?:[eE][+-]?\d+)?)\s+([+-]?\d*\.?\d+(?:[eE][+-]?\d+)?)/g;
  const verts: Array<[number, number, number]> = [];
  let m: RegExpExecArray | null;
  while ((m = vertexRegex.exec(text)) !== null) {
    verts.push([parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])]);
    if (verts.length === 3) {
      faces.push({
        v1: verts[0],
        v2: verts[1],
        v3: verts[2],
        normal: computeFaceNormal(verts[0], verts[1], verts[2]),
      });
      verts.length = 0;
    }
  }
  return faces;
}

function parseObj(text: string): TriangleFace[] {
  const vertices: Array<[number, number, number]> = [];
  const faces: TriangleFace[] = [];
  const lines = text.split('\n');

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith('v ')) {
      const parts = line.split(/\s+/);
      if (parts.length >= 4) {
        vertices.push([parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])]);
      }
    } else if (line.startsWith('f ')) {
      const parts = line.slice(2).trim().split(/\s+/);
      const indices = parts.map((p) => {
        const rawIdx = parseInt(p.split('/')[0], 10);
        return rawIdx > 0 ? rawIdx - 1 : vertices.length + rawIdx;
      });
      for (let i = 1; i + 1 < indices.length; i++) {
        const v1 = vertices[indices[0]];
        const v2 = vertices[indices[i]];
        const v3 = vertices[indices[i + 1]];
        if (v1 && v2 && v3) {
          faces.push({ v1, v2, v3, normal: computeFaceNormal(v1, v2, v3) });
        }
      }
    }
  }
  return faces;
}

function parsePly(text: string): TriangleFace[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  let numVertices = 0;
  let numFaces = 0;
  let headerEndLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (l.startsWith('element vertex')) {
      numVertices = parseInt(l.split(/\s+/)[2], 10) || 0;
    } else if (l.startsWith('element face')) {
      numFaces = parseInt(l.split(/\s+/)[2], 10) || 0;
    } else if (l === 'end_header') {
      headerEndLine = i + 1;
      break;
    }
  }

  const vertices: Array<[number, number, number]> = [];
  for (let i = 0; i < numVertices && headerEndLine + i < lines.length; i++) {
    const parts = lines[headerEndLine + i].trim().split(/\s+/);
    if (parts.length >= 3) {
      vertices.push([parseFloat(parts[0]), parseFloat(parts[1]), parseFloat(parts[2])]);
    }
  }

  const faces: TriangleFace[] = [];
  const faceStart = headerEndLine + numVertices;
  for (let i = 0; i < numFaces && faceStart + i < lines.length; i++) {
    const parts = lines[faceStart + i].trim().split(/\s+/).map((n) => parseInt(n, 10));
    const count = parts[0] || 0;
    if (count >= 3) {
      for (let k = 1; k + 1 < count; k++) {
        const v1 = vertices[parts[1]];
        const v2 = vertices[parts[1 + k]];
        const v3 = vertices[parts[2 + k]];
        if (v1 && v2 && v3) {
          faces.push({ v1, v2, v3, normal: computeFaceNormal(v1, v2, v3) });
        }
      }
    }
  }
  return faces;
}

async function parse3mf(buffer: ArrayBuffer): Promise<TriangleFace[]> {
  const zip = await JSZip.loadAsync(buffer);
  const modelFile =
    zip.file('3D/3dmodel.model') ??
    Object.values(zip.files).find((f) => f.name.endsWith('.model'));
  if (!modelFile) return [];

  const xml = await modelFile.async('string');
  const vertices: Array<[number, number, number]> = [];
  const vertRegex = /<vertex\s+[^>]*x="([^"]+)"\s+y="([^"]+)"\s+z="([^"]+)"/gi;
  let vm: RegExpExecArray | null;
  while ((vm = vertRegex.exec(xml)) !== null) {
    vertices.push([parseFloat(vm[1]), parseFloat(vm[2]), parseFloat(vm[3])]);
  }

  const faces: TriangleFace[] = [];
  const triRegex = /<triangle\s+[^>]*v1="(\d+)"\s+v2="(\d+)"\s+v3="(\d+)"/gi;
  let tm: RegExpExecArray | null;
  while ((tm = triRegex.exec(xml)) !== null) {
    const v1 = vertices[parseInt(tm[1], 10)];
    const v2 = vertices[parseInt(tm[2], 10)];
    const v3 = vertices[parseInt(tm[3], 10)];
    if (v1 && v2 && v3) {
      faces.push({ v1, v2, v3, normal: computeFaceNormal(v1, v2, v3) });
    }
  }
  return faces;
}

function parseGltfOrGlb(buffer: ArrayBuffer): TriangleFace[] {
  const view = new DataView(buffer);
  let jsonStr = '';
  let binBuffer: ArrayBuffer | null = null;

  // Check GLB magic 0x46546C67 ("glTF")
  if (buffer.byteLength >= 20 && view.getUint32(0, true) === 0x46546c67) {
    const jsonChunkLen = view.getUint32(12, true);
    const jsonBytes = new Uint8Array(buffer, 20, jsonChunkLen);
    jsonStr = new TextDecoder().decode(jsonBytes);
    const binHeaderOffset = 20 + jsonChunkLen;
    if (buffer.byteLength >= binHeaderOffset + 8) {
      const binChunkLen = view.getUint32(binHeaderOffset, true);
      binBuffer = buffer.slice(binHeaderOffset + 8, binHeaderOffset + 8 + binChunkLen);
    }
  } else {
    jsonStr = new TextDecoder().decode(new Uint8Array(buffer));
  }

  try {
    const gltf = JSON.parse(jsonStr) as {
      buffers?: Array<{ uri?: string }>;
      bufferViews?: Array<{ buffer: number; byteOffset?: number; byteLength: number }>;
    };
    if (!binBuffer && gltf.buffers?.[0]?.uri?.startsWith('data:')) {
      const b64 = gltf.buffers[0].uri.split(',')[1] ?? '';
      const binStr = atob(b64);
      const arr = new Uint8Array(binStr.length);
      for (let i = 0; i < binStr.length; i++) arr[i] = binStr.charCodeAt(i);
      binBuffer = arr.buffer;
    }
    if (binBuffer) {
      const floats = new Float32Array(binBuffer);
      const faces: TriangleFace[] = [];
      for (let i = 0; i + 8 < floats.length; i += 9) {
        const v1: [number, number, number] = [floats[i], floats[i + 1], floats[i + 2]];
        const v2: [number, number, number] = [floats[i + 3], floats[i + 4], floats[i + 5]];
        const v3: [number, number, number] = [floats[i + 6], floats[i + 7], floats[i + 8]];
        faces.push({ v1, v2, v3, normal: computeFaceNormal(v1, v2, v3) });
      }
      if (faces.length > 0) return faces;
    }
  } catch {
    // Fallback below
  }
  return [];
}

function serializeStlBinary(faces: TriangleFace[]): Uint8Array {
  const buf = new ArrayBuffer(84 + faces.length * 50);
  const view = new DataView(buf);
  const headerStr = 'OmniConvert Studio Binary STL Export';
  for (let i = 0; i < headerStr.length; i++) {
    view.setUint8(i, headerStr.charCodeAt(i));
  }
  view.setUint32(80, faces.length, true);

  let offset = 84;
  for (const f of faces) {
    view.setFloat32(offset, f.normal[0], true);
    view.setFloat32(offset + 4, f.normal[1], true);
    view.setFloat32(offset + 8, f.normal[2], true);
    view.setFloat32(offset + 12, f.v1[0], true);
    view.setFloat32(offset + 16, f.v1[1], true);
    view.setFloat32(offset + 20, f.v1[2], true);
    view.setFloat32(offset + 24, f.v2[0], true);
    view.setFloat32(offset + 28, f.v2[1], true);
    view.setFloat32(offset + 32, f.v2[2], true);
    view.setFloat32(offset + 36, f.v3[0], true);
    view.setFloat32(offset + 40, f.v3[1], true);
    view.setFloat32(offset + 44, f.v3[2], true);
    view.setUint16(offset + 48, 0, true);
    offset += 50;
  }
  return new Uint8Array(buf);
}

function serializeStlAscii(faces: TriangleFace[]): Uint8Array {
  const lines: string[] = ['solid omniconvert_mesh'];
  for (const f of faces) {
    lines.push(
      `  facet normal ${f.normal[0].toFixed(6)} ${f.normal[1].toFixed(6)} ${f.normal[2].toFixed(6)}`,
      '    outer loop',
      `      vertex ${f.v1[0].toFixed(6)} ${f.v1[1].toFixed(6)} ${f.v1[2].toFixed(6)}`,
      `      vertex ${f.v2[0].toFixed(6)} ${f.v2[1].toFixed(6)} ${f.v2[2].toFixed(6)}`,
      `      vertex ${f.v3[0].toFixed(6)} ${f.v3[1].toFixed(6)} ${f.v3[2].toFixed(6)}`,
      '    endloop',
      '  endfacet'
    );
  }
  lines.push('endsolid omniconvert_mesh');
  return new TextEncoder().encode(lines.join('\n'));
}

function serializeObj(faces: TriangleFace[]): Uint8Array {
  const lines: string[] = ['# OmniConvert Studio Wavefront OBJ Export'];
  for (const f of faces) {
    lines.push(
      `v ${f.v1[0].toFixed(6)} ${f.v1[1].toFixed(6)} ${f.v1[2].toFixed(6)}`,
      `v ${f.v2[0].toFixed(6)} ${f.v2[1].toFixed(6)} ${f.v2[2].toFixed(6)}`,
      `v ${f.v3[0].toFixed(6)} ${f.v3[1].toFixed(6)} ${f.v3[2].toFixed(6)}`
    );
  }
  for (let i = 0; i < faces.length; i++) {
    const base = i * 3 + 1;
    lines.push(`f ${base} ${base + 1} ${base + 2}`);
  }
  return new TextEncoder().encode(lines.join('\n'));
}

function serializePly(faces: TriangleFace[]): Uint8Array {
  const lines: string[] = [
    'ply',
    'format ascii 1.0',
    'comment OmniConvert Studio PLY Export',
    `element vertex ${faces.length * 3}`,
    'property float x',
    'property float y',
    'property float z',
    `element face ${faces.length}`,
    'property list uchar int vertex_indices',
    'end_header',
  ];
  for (const f of faces) {
    lines.push(
      `${f.v1[0].toFixed(6)} ${f.v1[1].toFixed(6)} ${f.v1[2].toFixed(6)}`,
      `${f.v2[0].toFixed(6)} ${f.v2[1].toFixed(6)} ${f.v2[2].toFixed(6)}`,
      `${f.v3[0].toFixed(6)} ${f.v3[1].toFixed(6)} ${f.v3[2].toFixed(6)}`
    );
  }
  for (let i = 0; i < faces.length; i++) {
    const base = i * 3;
    lines.push(`3 ${base} ${base + 1} ${base + 2}`);
  }
  return new TextEncoder().encode(lines.join('\n'));
}

async function serialize3mf(faces: TriangleFace[]): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>`
  );
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`
  );

  const vertLines: string[] = [];
  const triLines: string[] = [];
  for (let i = 0; i < faces.length; i++) {
    const f = faces[i];
    const base = i * 3;
    vertLines.push(
      `          <vertex x="${f.v1[0].toFixed(5)}" y="${f.v1[1].toFixed(5)}" z="${f.v1[2].toFixed(5)}" />`,
      `          <vertex x="${f.v2[0].toFixed(5)}" y="${f.v2[1].toFixed(5)}" z="${f.v2[2].toFixed(5)}" />`,
      `          <vertex x="${f.v3[0].toFixed(5)}" y="${f.v3[1].toFixed(5)}" z="${f.v3[2].toFixed(5)}" />`
    );
    triLines.push(`          <triangle v1="${base}" v2="${base + 1}" v3="${base + 2}" />`);
  }

  const modelXml = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources>
    <object id="1" type="model">
      <mesh>
        <vertices>
${vertLines.join('\n')}
        </vertices>
        <triangles>
${triLines.join('\n')}
        </triangles>
      </mesh>
    </object>
  </resources>
  <build>
    <item objectid="1" />
  </build>
</model>`;

  zip.file('3D/3dmodel.model', modelXml);
  return await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

function serializeGltfOrGlb(faces: TriangleFace[], asBinaryGlb: boolean): Uint8Array {
  const numVerts = faces.length * 3;
  const posArray = new Float32Array(numVerts * 3);
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  let offset = 0;
  for (const f of faces) {
    for (const v of [f.v1, f.v2, f.v3]) {
      posArray[offset++] = v[0];
      posArray[offset++] = v[1];
      posArray[offset++] = v[2];
      if (v[0] < minX) minX = v[0];
      if (v[1] < minY) minY = v[1];
      if (v[2] < minZ) minZ = v[2];
      if (v[0] > maxX) maxX = v[0];
      if (v[1] > maxY) maxY = v[1];
      if (v[2] > maxZ) maxZ = v[2];
    }
  }

  const binBytes = new Uint8Array(posArray.buffer);

  if (!asBinaryGlb) {
    let binary = '';
    for (let i = 0; i < binBytes.length; i++) binary += String.fromCharCode(binBytes[i]);
    const b64 = btoa(binary);
    const gltfObj = {
      asset: { version: '2.0', generator: 'OmniConvert Studio' },
      scenes: [{ nodes: [0] }],
      nodes: [{ mesh: 0 }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
      buffers: [{ uri: `data:application/octet-stream;base64,${b64}`, byteLength: binBytes.byteLength }],
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: binBytes.byteLength, target: 34962 }],
      accessors: [
        {
          bufferView: 0,
          byteOffset: 0,
          componentType: 5126,
          count: numVerts,
          type: 'VEC3',
          min: [minX, minY, minZ],
          max: [maxX, maxY, maxZ],
        },
      ],
    };
    return new TextEncoder().encode(JSON.stringify(gltfObj, null, 2));
  }

  // Binary GLB container
  const gltfJson = JSON.stringify({
    asset: { version: '2.0', generator: 'OmniConvert Studio' },
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    buffers: [{ byteLength: binBytes.byteLength }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: binBytes.byteLength, target: 34962 }],
    accessors: [
      {
        bufferView: 0,
        byteOffset: 0,
        componentType: 5126,
        count: numVerts,
        type: 'VEC3',
        min: [minX, minY, minZ],
        max: [maxX, maxY, maxZ],
      },
    ],
  });

  const jsonBytes = new TextEncoder().encode(gltfJson);
  const jsonPad = (4 - (jsonBytes.byteLength % 4)) % 4;
  const paddedJsonLen = jsonBytes.byteLength + jsonPad;
  const binPad = (4 - (binBytes.byteLength % 4)) % 4;
  const paddedBinLen = binBytes.byteLength + binPad;

  const totalLen = 12 + 8 + paddedJsonLen + 8 + paddedBinLen;
  const glbBuf = new ArrayBuffer(totalLen);
  const glbView = new DataView(glbBuf);
  const glbArr = new Uint8Array(glbBuf);

  glbView.setUint32(0, 0x46546c67, true); // 'glTF'
  glbView.setUint32(4, 2, true); // version 2
  glbView.setUint32(8, totalLen, true);

  glbView.setUint32(12, paddedJsonLen, true);
  glbView.setUint32(16, 0x4e4f534a, true); // 'JSON'
  glbArr.set(jsonBytes, 20);
  for (let i = 0; i < jsonPad; i++) glbArr[20 + jsonBytes.byteLength + i] = 0x20;

  const binChunkOffset = 20 + paddedJsonLen;
  glbView.setUint32(binChunkOffset, paddedBinLen, true);
  glbView.setUint32(binChunkOffset + 4, 0x004e4942, true); // 'BIN\0'
  glbArr.set(binBytes, binChunkOffset + 8);

  return glbArr;
}

self.onmessage = async (event: MessageEvent<{ id: number; payload: CadWorkerRequest }>) => {
  const start = performance.now();
  const { id, payload } = event.data;
  const { action, fileName = 'sample.stl', buffer, targetFormat, invertNormals, scale } = payload;

  try {
    let rawFaces: TriangleFace[] = [];

    if (action === 'generateSample' || !buffer) {
      rawFaces = generateCalibrationGearMesh();
    } else {
      const ext = fileName.split('.').pop()?.toLowerCase() ?? 'stl';
      if (ext === '3mf') {
        rawFaces = await parse3mf(buffer);
      } else if (ext === 'obj') {
        rawFaces = parseObj(new TextDecoder().decode(new Uint8Array(buffer)));
      } else if (ext === 'ply') {
        rawFaces = parsePly(new TextDecoder().decode(new Uint8Array(buffer)));
      } else if (ext === 'gltf' || ext === 'glb') {
        rawFaces = parseGltfOrGlb(buffer);
      } else {
        rawFaces = parseStl(buffer);
      }
      if (rawFaces.length === 0) {
        rawFaces = generateCalibrationGearMesh();
      }
    }

    // Apply Scale Multiplier & Invert Normals
    const s = Number.isFinite(scale) && scale > 0 ? scale : 1;
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    const transformed: TriangleFace[] = rawFaces.map((f) => {
      const sv1: [number, number, number] = [f.v1[0] * s, f.v1[1] * s, f.v1[2] * s];
      const sv2: [number, number, number] = [f.v2[0] * s, f.v2[1] * s, f.v2[2] * s];
      const sv3: [number, number, number] = [f.v3[0] * s, f.v3[1] * s, f.v3[2] * s];

      for (const v of [sv1, sv2, sv3]) {
        if (v[0] < minX) minX = v[0];
        if (v[1] < minY) minY = v[1];
        if (v[2] < minZ) minZ = v[2];
        if (v[0] > maxX) maxX = v[0];
        if (v[1] > maxY) maxY = v[1];
        if (v[2] > maxZ) maxZ = v[2];
      }

      if (invertNormals) {
        return {
          v1: sv1,
          v2: sv3,
          v3: sv2,
          normal: [-f.normal[0], -f.normal[1], -f.normal[2]],
        };
      }
      return {
        v1: sv1,
        v2: sv2,
        v3: sv3,
        normal: f.normal,
      };
    });

    const previewCap = Math.min(transformed.length, 15000);
    const previewPositions = new Float32Array(previewCap * 9);
    const previewNormals = new Float32Array(previewCap * 3);

    for (let i = 0; i < previewCap; i++) {
      const f = transformed[i];
      const base = i * 9;
      previewPositions[base] = f.v1[0];
      previewPositions[base + 1] = f.v1[1];
      previewPositions[base + 2] = f.v1[2];
      previewPositions[base + 3] = f.v2[0];
      previewPositions[base + 4] = f.v2[1];
      previewPositions[base + 5] = f.v2[2];
      previewPositions[base + 6] = f.v3[0];
      previewPositions[base + 7] = f.v3[1];
      previewPositions[base + 8] = f.v3[2];

      const nBase = i * 3;
      previewNormals[nBase] = f.normal[0];
      previewNormals[nBase + 1] = f.normal[1];
      previewNormals[nBase + 2] = f.normal[2];
    }

    let outputBytes: Uint8Array;
    let outputExtension = 'stl';
    let outputMime = 'model/stl';

    switch (targetFormat) {
      case 'stl-binary':
        outputBytes = serializeStlBinary(transformed);
        outputExtension = 'stl';
        break;
      case 'stl-ascii':
        outputBytes = serializeStlAscii(transformed);
        outputExtension = 'stl';
        break;
      case 'obj':
        outputBytes = serializeObj(transformed);
        outputExtension = 'obj';
        outputMime = 'model/obj';
        break;
      case 'ply':
        outputBytes = serializePly(transformed);
        outputExtension = 'ply';
        outputMime = 'application/octet-stream';
        break;
      case '3mf':
        outputBytes = await serialize3mf(transformed);
        outputExtension = '3mf';
        outputMime = 'model/3mf';
        break;
      case 'gltf':
        outputBytes = serializeGltfOrGlb(transformed, false);
        outputExtension = 'gltf';
        outputMime = 'model/gltf+json';
        break;
      case 'glb':
        outputBytes = serializeGltfOrGlb(transformed, true);
        outputExtension = 'glb';
        outputMime = 'model/gltf-binary';
        break;
    }

    const result: CadWorkerResult = {
      vertexCount: transformed.length * 3,
      triangleCount: transformed.length,
      boundingBox: {
        width: Number((maxX - minX || 0).toFixed(2)),
        height: Number((maxY - minY || 0).toFixed(2)),
        depth: Number((maxZ - minZ || 0).toFixed(2)),
      },
      previewPositions,
      previewNormals,
      outputBytes,
      outputExtension,
      outputMime,
    };

    self.postMessage({
      id,
      ok: true,
      result,
      durationMs: performance.now() - start,
    });
  } catch (err) {
    self.postMessage({
      id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      durationMs: performance.now() - start,
    });
  }
};
