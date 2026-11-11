/**
 * Pure zero-dependency Code 128 Barcode & Label Generation Engine (Module 2.3.2)
 * Supports standard Code 128 Auto/Subtype B encoding to generate high-resolution,
 * crisp SVG vector bars suitable for 203 DPI and 300 DPI thermal label printers.
 */

// Code 128 Patterns (B and C)
// Each character is encoded as 11 modules: 3 bars and 3 spaces (except stop which has 13 modules)
const CODE128_PATTERNS: number[] = [
  0x6cc, 0x66c, 0x666, 0x498, 0x48c, 0x44c, 0x4c8, 0x4c4, 0x464, 0x648, // 0-9
  0x644, 0x624, 0x59c, 0x4dc, 0x4ce, 0x59e, 0x4de, 0x4ee, 0x72c, 0x6ac, // 10-19
  0x6b4, 0x7ac, 0x7b4, 0x7b6, 0x76c, 0x764, 0x734, 0x736, 0x774, 0x776, // 20-29
  0x76e, 0x77c, 0x77e, 0x52c, 0x54c, 0x546, 0x526, 0x564, 0x566, 0x748, // 30-39
  0x744, 0x724, 0x5ac, 0x5b4, 0x5b6, 0x7a8, 0x7a4, 0x726, 0x768, 0x738, // 40-49
  0x5dc, 0x5ee, 0x5ae, 0x7b8, 0x7b2, 0x762, 0x732, 0x71a, 0x716, 0x75a, // 50-59
  0x756, 0x778, 0x772, 0x73a, 0x76a, 0x56a, 0x5aa, 0x69c, 0x6ce, 0x6b6, // 60-69
  0x676, 0x6ec, 0x6f4, 0x6f6, 0x74c, 0x754, 0x756, 0x73c, 0x73e, 0x766, // 70-79
  0x75e, 0x6da, 0x6ec, 0x6f6, 0x76e, 0x77c, 0x77e, 0x7b8, 0x7b2, 0x762, // 80-89
  0x71a, 0x75a, 0x756, 0x778, 0x772, 0x73a, 0x76a, 0x56a, 0x5aa, 0x69c, // 90-99
  0x6ce, 0x6b6, 0x676, 0x67a, 0x72a, 0x74a, 0x76a, 0x772, 0x18eb,       // 100-106 (106 is STOP pattern: 13 modules)
];

const START_B = 104;
const STOP = 106;

/**
 * Encodes an ASCII alphanumeric string into Code 128 bar patterns.
 * Returns a binary module string (e.g. "11010010000...").
 */
export function encodeCode128B(text: string): string {
  if (!text) text = "DRX-0000";

  // Filter to printable ASCII chars 32-126
  const cleanText = text.replace(/[^\x20-\x7E]/g, "-");
  
  const codes: number[] = [START_B];
  let checkSum = START_B;

  for (let i = 0; i < cleanText.length; i++) {
    const charCode = cleanText.charCodeAt(i) - 32;
    codes.push(charCode);
    checkSum += charCode * (i + 1);
  }

  const checkDigit = checkSum % 103;
  codes.push(checkDigit);
  codes.push(STOP);

  // Convert each code index into binary modules (1=bar, 0=space)
  let binaryString = "";
  for (let idx = 0; idx < codes.length; idx++) {
    const code = codes[idx];
    const isStop = idx === codes.length - 1;
    const moduleCount = isStop ? 13 : 11;
    const pattern = CODE128_PATTERNS[code] ?? 0x6cc;

    for (let bit = moduleCount - 1; bit >= 0; bit--) {
      binaryString += ((pattern >> bit) & 1) ? "1" : "0";
    }
  }

  // Final termination bar (2 modules)
  binaryString += "11";

  return binaryString;
}

export interface BarcodeSvgOptions {
  width?: number; // Total rendered width in px
  height?: number; // Total rendered height in px
  includeText?: boolean;
  quietZone?: boolean;
}

/**
 * Generates an SVG string representation of a Code 128 barcode.
 */
export function generateBarcodeSvg(text: string, options: BarcodeSvgOptions = {}): string {
  const {
    width = 240,
    height = 60,
    includeText = true,
    quietZone = true,
  } = options;

  const binary = encodeCode128B(text);
  const totalModules = binary.length + (quietZone ? 20 : 0);
  const moduleWidth = width / totalModules;
  const barHeight = includeText ? height - 16 : height;

  let x = quietZone ? 10 * moduleWidth : 0;
  let rects = "";

  for (let i = 0; i < binary.length; i++) {
    if (binary[i] === "1") {
      rects += `<rect x="${x.toFixed(2)}" y="0" width="${(moduleWidth + 0.1).toFixed(2)}" height="${barHeight}" fill="#000" />`;
    }
    x += moduleWidth;
  }

  let textSvg = "";
  if (includeText) {
    textSvg = `<text x="${(width / 2).toFixed(2)}" y="${(height - 2).toFixed(2)}" text-anchor="middle" font-family="monospace, monospace" font-size="11" font-weight="bold" fill="#111">${escapeXml(text)}</text>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" style="background:#fff;display:block;">${rects}${textSvg}</svg>`;
}

function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case "<": return "&lt;";
      case ">": return "&gt;";
      case "&": return "&amp;";
      case "'": return "&apos;";
      case '"': return "&quot;";
      default: return c;
    }
  });
}

