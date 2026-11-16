/**
 * Pure zero-dependency Code 128 Barcode & Label Generation Engine (Module 2.3.2)
 * Supports standard Code 128 Auto/Subtype B encoding to generate high-resolution,
 * crisp SVG vector bars suitable for 203 DPI and 300 DPI thermal label printers.
 */

// Official ISO/IEC 15417 Code 128 element-width table (symbols 0..106)
// Each symbol 0..105 sums to 11 modules (b1,s1,b2,s2,b3,s3); symbol 106 (STOP) is 13 modules including termination bar (2331112).
const CODE128_WIDTHS: string[] = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213", // 0-9
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132", // 10-19
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211", // 20-29
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313", // 30-39
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331", // 40-49
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111", // 50-59
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214", // 60-69
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111", // 70-79
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141", // 80-89
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141", // 90-99
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",                              // 100-106
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
    const widths = CODE128_WIDTHS[codes[idx]] ?? CODE128_WIDTHS[0];
    for (let i = 0; i < widths.length; i++) {
      const moduleCount = Number(widths[i]);
      const bit = i % 2 === 0 ? "1" : "0";
      binaryString += bit.repeat(moduleCount);
    }
  }

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

