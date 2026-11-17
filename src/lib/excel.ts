import AdmZip from "adm-zip";

export interface ExcelSheetData {
  name: string;
  headers: string[];
  rows: Array<Array<string | number | boolean | null | undefined>>;
}

function escapeXml(value: string): string {
  return value
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function sanitizeSheetName(name: string, index: number): string {
  const cleaned = name.replace(/[\\/*?:[\]]/g, " ").trim().slice(0, 31);
  return cleaned || `Sheet${index + 1}`;
}

function colIndexToLetter(colIdx: number): string {
  let n = colIdx + 1;
  let letters = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

function escapeSpreadsheetFormula(value: string): string {
  if (/^[=+\-@\t\r]/.test(value)) {
    return `'${value}`;
  }
  return value;
}

function buildCellXml(colIdx: number, rowNumber: number, val: any, styleIdx = 0): string {
  const ref = `${colIndexToLetter(colIdx)}${rowNumber}`;
  const styleAttr = styleIdx > 0 ? ` s="${styleIdx}"` : "";

  if (val === null || val === undefined || val === "") {
    return `<c r="${ref}"${styleAttr}/>`;
  }

  if (typeof val === "number" && Number.isFinite(val)) {
    return `<c r="${ref}" t="n"${styleAttr}><v>${val}</v></c>`;
  }

  if (typeof val === "boolean") {
    return `<c r="${ref}" t="b"${styleAttr}><v>${val ? 1 : 0}</v></c>`;
  }

  const text = escapeXml(escapeSpreadsheetFormula(String(val)));
  return `<c r="${ref}" t="inlineStr"${styleAttr}><is><t xml:space="preserve">${text}</t></is></c>`;
}

function buildWorksheetXml(sheet: ExcelSheetData): string {
  const allRows: Array<{ cells: any[]; isHeader: boolean }> = [
    { cells: sheet.headers, isHeader: true },
    ...sheet.rows.map((r) => ({ cells: r, isHeader: false })),
  ];

  // Auto-calculate sensible column widths
  const maxCols = Math.max(sheet.headers.length, ...sheet.rows.map((r) => r.length), 1);
  const colWidths: number[] = Array(maxCols).fill(12);
  for (const row of allRows) {
    row.cells.forEach((cell, idx) => {
      const len = String(cell ?? "").length + 3;
      if (len > colWidths[idx]) colWidths[idx] = Math.min(48, len);
    });
  }

  const colsXml = `<cols>${colWidths
    .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
    .join("")}</cols>`;

  const sheetDataXml = allRows
    .map((row, rIdx) => {
      const rowNum = rIdx + 1;
      const styleIdx = row.isHeader ? 1 : 0;
      const cellsXml = row.cells
        .map((cell, cIdx) => buildCellXml(cIdx, rowNum, cell, styleIdx))
        .join("");
      return `<row r="${rowNum}">${cellsXml}</row>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  ${colsXml}
  <sheetData>${sheetDataXml}</sheetData>
</worksheet>`;
}

/**
 * Generates a standards-compliant multi-sheet OpenXML `.xlsx` workbook Buffer using AdmZip.
 */
export function buildXlsxBuffer(sheets: ExcelSheetData[]): Buffer {
  const zip = new AdmZip();
  const safeSheets = sheets.length > 0 ? sheets : [{ name: "Report", headers: ["Empty"], rows: [] }];

  // Ensure deduplicated, valid <=31 char Excel worksheet names
  const usedNames = new Set<string>();
  const resolvedSheetNames = safeSheets.map((s, idx) => {
    const base = sanitizeSheetName(s.name, idx);
    let candidate = base;
    let counter = 2;
    while (usedNames.has(candidate.toLowerCase())) {
      const suffix = `_${counter++}`;
      candidate = `${base.slice(0, 31 - suffix.length)}${suffix}`;
    }
    usedNames.add(candidate.toLowerCase());
    return candidate;
  });

  const contentTypesOverrides = safeSheets
    .map(
      (_, idx) =>
        `<Override PartName="/xl/worksheets/sheet${idx + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    )
    .join("");

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.workbook+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${contentTypesOverrides}
</Types>`;

  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const workbookRels = [
    ...safeSheets.map(
      (_, idx) =>
        `<Relationship Id="rId${idx + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${idx + 1}.xml"/>`
    ),
    `<Relationship Id="rId${safeSheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`,
  ].join("");

  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${workbookRels}
</Relationships>`;

  const sheetsListXml = safeSheets
    .map(
      (_, idx) =>
        `<sheet name="${escapeXml(resolvedSheetNames[idx])}" sheetId="${idx + 1}" r:id="rId${idx + 1}"/>`
    )
    .join("");

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>${sheetsListXml}</sheets>
</workbook>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font><sz val="11"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1F4E5B"/></patternFill></fill>
  </fills>
  <borders count="1">
    <border><left/><right/><top/><bottom/><diagonal/></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="2">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
  </cellXfs>
</styleSheet>`;

  zip.addFile("[Content_Types].xml", Buffer.from(contentTypesXml, "utf8"));
  zip.addFile("_rels/.rels", Buffer.from(rootRelsXml, "utf8"));
  zip.addFile("xl/_rels/workbook.xml.rels", Buffer.from(workbookRelsXml, "utf8"));
  zip.addFile("xl/workbook.xml", Buffer.from(workbookXml, "utf8"));
  zip.addFile("xl/styles.xml", Buffer.from(stylesXml, "utf8"));

  safeSheets.forEach((s, idx) => {
    zip.addFile(`xl/worksheets/sheet${idx + 1}.xml`, Buffer.from(buildWorksheetXml(s), "utf8"));
  });

  return zip.toBuffer();
}
