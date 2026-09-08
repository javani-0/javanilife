// ---------------------------------------------------------------------------
// A real .xlsx workbook, written by hand — no dependency, no CDN.
//
// The admin asked to download Finance as Excel. Every off-the-shelf writer
// (SheetJS & friends) is either a heavy dependency or ships known advisories,
// and a ".xls" HTML table makes Excel show a "the file format doesn't match"
// warning every single time. An .xlsx file is just a ZIP of small XML parts, so
// this module writes that ZIP directly (stored, uncompressed — a finance export
// is kilobytes) and Excel, Google Sheets, LibreOffice and Numbers all open it
// without a word of complaint.
//
// PURE: no DOM, no Firestore. `downloadBlob` is the only browser-facing helper.
// ---------------------------------------------------------------------------

export type CellValue = string | number | null | undefined;

export interface SheetSpec {
  /** Tab name. Sanitised to Excel's rules (≤31 chars, no []:*?/\). */
  name: string;
  /** Bolded first row. Omit for a sheet with no header. */
  header?: string[];
  rows: CellValue[][];
  /** 0-based column indexes shown with a ₹ number format. */
  moneyColumns?: number[];
  /** Column widths in characters, 0-based. */
  widths?: number[];
}

// ── XML helpers ───────────────────────────────────────────────────────────

/** XML-escape a cell's text. Control characters are dropped — Excel rejects them. */
// Control characters are illegal in XML 1.0 — Excel refuses a file containing one.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;

export const escapeXml = (value: string): string =>
  value
    .replace(CONTROL_CHARS, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

/** 0 → "A", 25 → "Z", 26 → "AA". */
export const columnLetter = (index: number): string => {
  let n = Math.max(0, Math.floor(index));
  let letters = "";
  for (;;) {
    letters = String.fromCharCode(65 + (n % 26)) + letters;
    n = Math.floor(n / 26) - 1;
    if (n < 0) break;
  }
  return letters;
};

/** Excel forbids []:*?/\ in a tab name and caps it at 31 characters. */
export const sanitizeSheetName = (name: string, fallback = "Sheet"): string => {
  const cleaned = (name || "").replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 31);
  return cleaned || fallback;
};

const STYLE_DEFAULT = 0;
const STYLE_HEADER = 1;
const STYLE_MONEY = 2;

const cellXml = (ref: string, value: CellValue, style: number): string => {
  if (value === null || value === undefined || value === "") {
    return style === STYLE_DEFAULT ? "" : `<c r="${ref}" s="${style}"/>`;
  }
  const styleAttr = style === STYLE_DEFAULT ? "" : ` s="${style}"`;
  if (typeof value === "number" && Number.isFinite(value)) {
    return `<c r="${ref}"${styleAttr}><v>${value}</v></c>`;
  }
  return `<c r="${ref}"${styleAttr} t="inlineStr"><is><t xml:space="preserve">${escapeXml(String(value))}</t></is></c>`;
};

/** One worksheet part. Exported for tests. */
export const buildSheetXml = (sheet: SheetSpec): string => {
  const money = new Set(sheet.moneyColumns || []);
  const allRows: { cells: CellValue[]; header: boolean }[] = [
    ...(sheet.header ? [{ cells: sheet.header as CellValue[], header: true }] : []),
    ...sheet.rows.map((cells) => ({ cells, header: false })),
  ];

  const widthCount = Math.max(
    sheet.widths?.length || 0,
    ...allRows.map((row) => row.cells.length),
    1,
  );
  const cols = Array.from({ length: widthCount }, (_, index) => {
    const width = sheet.widths?.[index] || 16;
    return `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`;
  }).join("");

  const rowsXml = allRows.map((row, rowIndex) => {
    const cells = row.cells.map((value, columnIndex) => {
      const style = row.header ? STYLE_HEADER : money.has(columnIndex) && typeof value === "number" ? STYLE_MONEY : STYLE_DEFAULT;
      return cellXml(`${columnLetter(columnIndex)}${rowIndex + 1}`, value, style);
    }).join("");
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");

  const freeze = sheet.header
    ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
    : "";

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
    + freeze
    + `<cols>${cols}</cols>`
    + `<sheetData>${rowsXml}</sheetData>`
    + `</worksheet>`;
};

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
  + `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
  + `<numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;₹&quot;#,##0.00"/></numFmts>`
  + `<fonts count="2">`
  + `<font><sz val="11"/><color theme="1"/><name val="Calibri"/></font>`
  + `<font><b/><sz val="11"/><color rgb="FF3B2C0A"/><name val="Calibri"/></font>`
  + `</fonts>`
  // Excel REQUIRES fill 0 = none and fill 1 = gray125; ours is index 2.
  + `<fills count="3">`
  + `<fill><patternFill patternType="none"/></fill>`
  + `<fill><patternFill patternType="gray125"/></fill>`
  + `<fill><patternFill patternType="solid"><fgColor rgb="FFF6E7BF"/><bgColor indexed="64"/></patternFill></fill>`
  + `</fills>`
  + `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>`
  + `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>`
  + `<cellXfs count="3">`
  + `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>`
  + `<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>`
  + `<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>`
  + `</cellXfs>`
  + `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>`
  + `</styleSheet>`;

// ── ZIP (stored entries) ──────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xEDB88320 ^ (value >>> 1) : value >>> 1;
    table[i] = value >>> 0;
  }
  return table;
})();

/** Standard CRC-32 (the checksum every ZIP entry carries). */
export const crc32 = (bytes: Uint8Array): number => {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i += 1) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
};

const encoder = new TextEncoder();

interface ZipEntry { name: string; bytes: Uint8Array }

const u16 = (value: number): number[] => [value & 0xFF, (value >>> 8) & 0xFF];
const u32 = (value: number): number[] => [value & 0xFF, (value >>> 8) & 0xFF, (value >>> 16) & 0xFF, (value >>> 24) & 0xFF];

const concatBytes = (chunks: Uint8Array[]): Uint8Array => {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) { out.set(chunk, at); at += chunk.length; }
  return out;
};

/**
 * A ZIP archive with every entry STORED (compression method 0). Deflate would
 * only shave kilobytes off a spreadsheet this size and would mean shipping a
 * compressor; stored entries are valid ZIP and open everywhere.
 *
 * Byte chunks are concatenated, never spread into an array literal: a big
 * export is megabytes and `push(...bytes)` blows the call stack.
 */
export const zipStore = (entries: ZipEntry[]): Uint8Array => {
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  let centralSize = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const crc = crc32(entry.bytes);
    const size = entry.bytes.length;

    const header = Uint8Array.from([
      ...u32(0x04034B50), ...u16(20), ...u16(0x0800), ...u16(0), // flag 0x800 = UTF-8 names
      ...u16(0), ...u16(0x21), // fixed 1980-01-01 timestamp — deterministic output
      ...u32(crc), ...u32(size), ...u32(size),
      ...u16(nameBytes.length), ...u16(0),
    ]);
    local.push(header, nameBytes, entry.bytes);

    const centralEntry = Uint8Array.from([
      ...u32(0x02014B50), ...u16(20), ...u16(20), ...u16(0x0800),
      ...u16(0), ...u16(0), ...u16(0x21),
      ...u32(crc), ...u32(size), ...u32(size),
      ...u16(nameBytes.length), ...u16(0), ...u16(0),
      ...u16(0), ...u16(0), ...u32(0),
      ...u32(offset),
      ...nameBytes,
    ]);
    central.push(centralEntry);
    centralSize += centralEntry.length;
    offset += header.length + nameBytes.length + size;
  }

  const end = Uint8Array.from([
    ...u32(0x06054B50), ...u16(0), ...u16(0),
    ...u16(entries.length), ...u16(entries.length),
    ...u32(centralSize), ...u32(offset), ...u16(0),
  ]);

  return concatBytes([...local, ...central, end]);
};

// ── Workbook ──────────────────────────────────────────────────────────────

/** The raw bytes of an .xlsx workbook holding one part per sheet. */
export const buildXlsx = (sheets: SheetSpec[]): Uint8Array => {
  const used = new Set<string>();
  const named = (sheets.length > 0 ? sheets : [{ name: "Sheet1", rows: [] }]).map((sheet, index) => {
    let name = sanitizeSheetName(sheet.name, `Sheet${index + 1}`);
    // Excel refuses a workbook with two identically-named tabs.
    let suffix = 2;
    while (used.has(name.toLowerCase())) name = `${sanitizeSheetName(sheet.name, "Sheet").slice(0, 28)} ${suffix++}`;
    used.add(name.toLowerCase());
    return { ...sheet, name };
  });

  const sheetParts = named.map((sheet, index) => ({
    file: `xl/worksheets/sheet${index + 1}.xml`,
    id: index + 1,
    name: sheet.name,
    xml: buildSheetXml(sheet),
  }));

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
    + `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`
    + `<Default Extension="xml" ContentType="application/xml"/>`
    + `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>`
    + `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>`
    + sheetParts.map((part) => `<Override PartName="/${part.file}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")
    + `</Types>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>`
    + `</Relationships>`;

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`
    + `<sheets>`
    + sheetParts.map((part) => `<sheet name="${escapeXml(part.name)}" sheetId="${part.id}" r:id="rId${part.id}"/>`).join("")
    + `</sheets></workbook>`;

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + sheetParts.map((part) => `<Relationship Id="rId${part.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${part.id}.xml"/>`).join("")
    + `<Relationship Id="rId${sheetParts.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`
    + `</Relationships>`;

  return zipStore([
    { name: "[Content_Types].xml", bytes: encoder.encode(contentTypes) },
    { name: "_rels/.rels", bytes: encoder.encode(rootRels) },
    { name: "xl/workbook.xml", bytes: encoder.encode(workbook) },
    { name: "xl/_rels/workbook.xml.rels", bytes: encoder.encode(workbookRels) },
    { name: "xl/styles.xml", bytes: encoder.encode(STYLES_XML) },
    ...sheetParts.map((part) => ({ name: part.file, bytes: encoder.encode(part.xml) })),
  ]);
};

// ── CSV ───────────────────────────────────────────────────────────────────

/** One CSV table. Excel needs the BOM to read ₹ and Indian names correctly. */
export const toCsv = (rows: CellValue[][]): string =>
  rows
    .map((row) => row.map((value) => {
      if (value === null || value === undefined) return "";
      const text = String(value);
      return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    }).join(","))
    .join("\r\n");

/** Several sheets in one CSV file, each under its own title line. */
export const sheetsToCsv = (sheets: SheetSpec[]): string =>
  sheets
    .map((sheet) => [
      toCsv([[sheet.name]]),
      toCsv([...(sheet.header ? [sheet.header as CellValue[]] : []), ...sheet.rows]),
    ].join("\r\n"))
    .join("\r\n\r\n");

// ── Download (browser) ────────────────────────────────────────────────────

/** Save bytes as a file from the browser. */
export const downloadBlob = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoking immediately can cancel the download in Safari.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
};

export const downloadXlsx = (sheets: SheetSpec[], filename: string): void => {
  const bytes = buildXlsx(sheets);
  downloadBlob(
    new Blob([bytes.buffer as ArrayBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`,
  );
};

export const downloadCsv = (sheets: SheetSpec[], filename: string): void => {
  downloadBlob(
    new Blob(["﻿", sheetsToCsv(sheets)], { type: "text/csv;charset=utf-8" }),
    filename.endsWith(".csv") ? filename : `${filename}.csv`,
  );
};
