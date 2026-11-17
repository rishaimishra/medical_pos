/**
 * Shared CSV cell serialization and date formatting helpers.
 */

/**
 * Escapes a value for RFC-4180 CSV and prevents spreadsheet formula injection (=, +, -, @, tab, CR).
 */
export function escapeCsvCell(val: string | number | boolean | null | undefined): string {
  if (val === null || val === undefined) return '""';
  let str = String(val);
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  return `"${str.replace(/"/g, '""')}"`;
}

/**
 * Builds a complete UTF-8 BOM CSV string from headers, data rows, and optional footer rows.
 */
export function buildCsvContent(
  headers: string[],
  rows: Array<Array<string | number | boolean | null | undefined>>,
  footerLines: string[] = []
): string {
  const csvLines: string[] = [headers.map((h) => escapeCsvCell(h)).join(",")];
  for (const row of rows) {
    csvLines.push(row.map((cell) => escapeCsvCell(cell)).join(","));
  }
  for (const footer of footerLines) {
    csvLines.push(footer);
  }
  return "\uFEFF" + csvLines.join("\r\n");
}

/**
 * Formats a Date into local YYYY-MM-DD without UTC midnight shift.
 */
export function toLocalYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
