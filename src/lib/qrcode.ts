/**
 * Zero-dependency offline QR Code SVG Generator (ISO/IEC 18004 Byte Mode, ECC Level M, Versions 1-10).
 * Used for offline Dynamic UPI QR rendering in POS without external network dependencies.
 */

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) {
    GF_EXP[i] = GF_EXP[i - 255];
  }
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function rsComputeEc(data: Uint8Array, ecCount: number): Uint8Array {
  // Build generator polynomial
  let gen = [1];
  for (let i = 0; i < ecCount; i++) {
    const next = new Array(gen.length + 1).fill(0);
    const factor = GF_EXP[i];
    for (let j = 0; j < gen.length; j++) {
      next[j] ^= gen[j];
      next[j + 1] ^= gfMul(gen[j], factor);
    }
    gen = next;
  }

  const res = new Uint8Array(ecCount);
  for (let i = 0; i < data.length; i++) {
    const coef = data[i] ^ res[0];
    res.copyWithin(0, 1);
    res[ecCount - 1] = 0;
    if (coef !== 0) {
      for (let j = 0; j < ecCount; j++) {
        res[j] ^= gfMul(gen[j + 1], coef);
      }
    }
  }
  return res;
}

interface VersionSpec {
  version: number;
  ecPerBlock: number;
  blocks: Array<[count: number, dataCw: number]>;
  align: number[];
}

// ECC Level M specs for Versions 1-10
const VERSION_SPECS: VersionSpec[] = [
  { version: 1, ecPerBlock: 10, blocks: [[1, 16]], align: [] },
  { version: 2, ecPerBlock: 16, blocks: [[1, 28]], align: [6, 18] },
  { version: 3, ecPerBlock: 26, blocks: [[1, 44]], align: [6, 22] },
  { version: 4, ecPerBlock: 18, blocks: [[2, 32]], align: [6, 26] },
  { version: 5, ecPerBlock: 24, blocks: [[2, 43]], align: [6, 30] },
  { version: 6, ecPerBlock: 16, blocks: [[4, 27]], align: [6, 34] },
  { version: 7, ecPerBlock: 18, blocks: [[4, 31]], align: [6, 22, 38] },
  { version: 8, ecPerBlock: 22, blocks: [[2, 38], [2, 39]], align: [6, 24, 42] },
  { version: 9, ecPerBlock: 22, blocks: [[3, 36], [2, 37]], align: [6, 26, 46] },
  { version: 10, ecPerBlock: 26, blocks: [[4, 43], [1, 44]], align: [6, 28, 50] },
];

function getFormatBitsM(mask: number): number {
  // ECC Level M = 00
  const data = mask & 7;
  let rem = data << 10;
  for (let i = 4; i >= 0; i--) {
    if ((rem >> (i + 10)) & 1) {
      rem ^= 0x537 << i;
    }
  }
  return ((data << 10) | rem) ^ 0x5412;
}

function getVersionBits(version: number): number {
  let rem = version << 12;
  for (let i = 5; i >= 0; i--) {
    if ((rem >> (i + 12)) & 1) {
      rem ^= 0x1f25 << i;
    }
  }
  return (version << 12) | rem;
}

function buildCodewords(bytes: Uint8Array): { spec: VersionSpec; codewords: Uint8Array } {
  const len = bytes.length;
  let chosen: VersionSpec | null = null;
  for (const spec of VERSION_SPECS) {
    const totalDataCw = spec.blocks.reduce((sum, [c, d]) => sum + c * d, 0);
    const headerBits = 4 + (spec.version >= 10 ? 16 : 8);
    const maxBytes = Math.floor((totalDataCw * 8 - headerBits) / 8);
    if (len <= maxBytes) {
      chosen = spec;
      break;
    }
  }
  if (!chosen) {
    throw new Error("QR payload exceeds Version 10 capacity");
  }

  const totalDataCw = chosen.blocks.reduce((sum, [c, d]) => sum + c * d, 0);
  const bits: number[] = [];
  const pushBits = (val: number, count: number) => {
    for (let i = count - 1; i >= 0; i--) {
      bits.push((val >> i) & 1);
    }
  };

  // Mode 0100 (Byte), Char Count
  pushBits(0b0100, 4);
  pushBits(len, chosen.version >= 10 ? 16 : 8);
  for (let i = 0; i < len; i++) {
    pushBits(bytes[i], 8);
  }

  // Terminator (up to 4 zero bits)
  const capBits = totalDataCw * 8;
  const term = Math.min(4, capBits - bits.length);
  for (let i = 0; i < term; i++) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);

  const dataCw = new Uint8Array(totalDataCw);
  for (let i = 0; i < bits.length / 8; i++) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i * 8 + j];
    dataCw[i] = b;
  }
  let padIdx = 0;
  for (let i = bits.length / 8; i < totalDataCw; i++) {
    dataCw[i] = padIdx % 2 === 0 ? 0xec : 0x11;
    padIdx++;
  }

  // Split into RS blocks & interleave
  const dataBlocks: Uint8Array[] = [];
  const ecBlocks: Uint8Array[] = [];
  let offset = 0;
  for (const [count, cwLen] of chosen.blocks) {
    for (let b = 0; b < count; b++) {
      const slice = dataCw.subarray(offset, offset + cwLen);
      offset += cwLen;
      dataBlocks.push(slice);
      ecBlocks.push(rsComputeEc(slice, chosen.ecPerBlock));
    }
  }

  const maxDataLen = Math.max(...dataBlocks.map((b) => b.length));
  const out: number[] = [];
  for (let i = 0; i < maxDataLen; i++) {
    for (const blk of dataBlocks) {
      if (i < blk.length) out.push(blk[i]);
    }
  }
  for (let i = 0; i < chosen.ecPerBlock; i++) {
    for (const blk of ecBlocks) {
      out.push(blk[i]);
    }
  }

  return { spec: chosen, codewords: new Uint8Array(out) };
}

function buildMatrix(spec: VersionSpec, codewords: Uint8Array): boolean[][] {
  const size = spec.version * 4 + 17;
  const grid: (boolean | null)[][] = Array.from({ length: size }, () => Array(size).fill(null));
  const isFunc: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  const setFunc = (r: number, c: number, val: boolean) => {
    if (r >= 0 && r < size && c >= 0 && c < size) {
      grid[r][c] = val;
      isFunc[r][c] = true;
    }
  };

  // Finder patterns + separators
  const drawFinder = (top: number, left: number) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const r = top + dr;
        const c = left + dc;
        if (r < 0 || r >= size || c < 0 || c >= size) continue;
        const inOuter = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
        const val =
          inOuter &&
          (dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4));
        setFunc(r, c, val);
      }
    }
  };

  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  // Alignment patterns
  const pos = spec.align;
  for (const ar of pos) {
    for (const ac of pos) {
      if (isFunc[ar][ac]) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const val = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
          setFunc(ar + dr, ac + dc, val);
        }
      }
    }
  }

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    if (!isFunc[6][i]) setFunc(6, i, i % 2 === 0);
    if (!isFunc[i][6]) setFunc(i, 6, i % 2 === 0);
  }

  // Dark module + reserve format info areas
  setFunc(size - 8, 8, true);
  for (let i = 0; i < 9; i++) {
    if (!isFunc[8][i]) setFunc(8, i, false);
    if (!isFunc[i][8]) setFunc(i, 8, false);
  }
  for (let i = size - 8; i < size; i++) {
    if (!isFunc[8][i]) setFunc(8, i, false);
    if (!isFunc[i][8]) setFunc(i, 8, false);
  }

  // Reserve & write version info for V7+
  if (spec.version >= 7) {
    const vBits = getVersionBits(spec.version);
    for (let i = 0; i < 18; i++) {
      const bit = ((vBits >> i) & 1) === 1;
      const a = Math.floor(i / 3);
      const b = size - 11 + (i % 3);
      setFunc(a, b, bit);
      setFunc(b, a, bit);
    }
  }

  // Place data bits in zig-zag
  let bitIdx = 0;
  const totalBits = codewords.length * 8;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const c = right - j;
        const upward = ((right + 1) & 2) === 0;
        const r = upward ? size - 1 - vert : vert;
        if (!isFunc[r][c]) {
          let bit = false;
          if (bitIdx < totalBits) {
            bit = ((codewords[bitIdx >> 3] >> (7 - (bitIdx & 7))) & 1) === 1;
            bitIdx++;
          }
          grid[r][c] = bit;
        }
      }
    }
  }

  // Evaluate best mask (0..7)
  const maskFns: Array<(r: number, c: number) => boolean> = [
    (r, c) => (r + c) % 2 === 0,
    (r) => r % 2 === 0,
    (_, c) => c % 3 === 0,
    (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
    (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
  ];

  let bestMask = 0;
  let bestScore = Infinity;
  let bestGrid: boolean[][] = [];

  for (let m = 0; m < 8; m++) {
    const candidate: boolean[][] = grid.map((row, r) =>
      row.map((val, c) => (!isFunc[r][c] && maskFns[m](r, c) ? !val : Boolean(val)))
    );

    // Apply format bits for mask m
    const fBits = getFormatBitsM(m);
    for (let i = 0; i <= 5; i++) candidate[8][i] = ((fBits >> i) & 1) === 1;
    candidate[8][7] = ((fBits >> 6) & 1) === 1;
    candidate[8][8] = ((fBits >> 7) & 1) === 1;
    candidate[7][8] = ((fBits >> 8) & 1) === 1;
    for (let i = 9; i < 15; i++) candidate[14 - i][8] = ((fBits >> i) & 1) === 1;
    for (let i = 0; i < 8; i++) candidate[8][size - 1 - i] = ((fBits >> i) & 1) === 1;
    for (let i = 8; i < 15; i++) candidate[size - 15 + i][8] = ((fBits >> i) & 1) === 1;

    // Penalty score (Rule 1 + Rule 4)
    let penalty = 0;
    for (let r = 0; r < size; r++) {
      let run = 1;
      for (let c = 1; c < size; c++) {
        if (candidate[r][c] === candidate[r][c - 1]) {
          run++;
          if (run === 5) penalty += 3;
          else if (run > 5) penalty += 1;
        } else {
          run = 1;
        }
      }
    }
    for (let c = 0; c < size; c++) {
      let run = 1;
      for (let r = 1; r < size; r++) {
        if (candidate[r][c] === candidate[r - 1][c]) {
          run++;
          if (run === 5) penalty += 3;
          else if (run > 5) penalty += 1;
        } else {
          run = 1;
        }
      }
    }
    for (let r = 0; r < size - 1; r++) {
      for (let c = 0; c < size - 1; c++) {
        const v = candidate[r][c];
        if (v === candidate[r][c + 1] && v === candidate[r + 1][c] && v === candidate[r + 1][c + 1]) {
          penalty += 3;
        }
      }
    }

    if (penalty < bestScore) {
      bestScore = penalty;
      bestMask = m;
      bestGrid = candidate;
    }
  }

  void bestMask;
  return bestGrid;
}

/**
 * Generates an inline SVG string for any UTF-8 text (such as a UPI payment URI).
 */
export function generateQrCodeSvg(text: string, sizePx: number = 160): string {
  const bytes = new TextEncoder().encode(text);
  const { spec, codewords } = buildCodewords(bytes);
  const matrix = buildMatrix(spec, codewords);
  const n = matrix.length;
  const quiet = 2;
  const total = n + quiet * 2;

  let paths = "";
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (matrix[r][c]) {
        paths += `M${c + quiet},${r + quiet}h1v1h-1z`;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${sizePx}" height="${sizePx}" shape-rendering="crispEdges"><rect width="${total}" height="${total}" fill="#ffffff"/><path d="${paths}" fill="#0f172a"/></svg>`;
}

export function generateQrCodeDataUri(text: string, sizePx: number = 160): string {
  const svg = generateQrCodeSvg(text, sizePx);
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
