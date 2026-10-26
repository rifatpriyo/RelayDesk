import Papa from "papaparse";
import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import { IntegrationError, redactHistory } from "./security";
import type {
  CatalogCandidate,
  ColumnMapping,
  ImportRow,
  RowError,
} from "./types";

export const IMPORT_LIMITS = {
  bytes: 2_000_000,
  expandedBytes: 20_000_000,
  rows: 2000,
  columns: 40,
  cell: 4000,
  documentCharacters: 80_000,
};
export function checkUpload(bytes: Uint8Array, maxBytes = IMPORT_LIMITS.bytes) {
  if (!bytes.length || bytes.length > maxBytes)
    throw new IntegrationError(
      "upload_size",
      `Choose a nonempty file no larger than ${maxBytes / 1_000_000} MB.`,
    );
}
function validateRows(rows: ImportRow[]): ImportRow[] {
  if (!rows.length)
    throw new IntegrationError("empty_import", "This file has no data rows.");
  if (rows.length > IMPORT_LIMITS.rows)
    throw new IntegrationError(
      "row_limit",
      "Split the source into snapshots of at most 2,000 rows.",
    );
  if (Object.keys(rows[0]).length > IMPORT_LIMITS.columns)
    throw new IntegrationError("column_limit", "Use at most 40 columns.");
  for (const row of rows)
    for (const [name, value] of Object.entries(row))
      if (name.length > 120 || value.length > IMPORT_LIMITS.cell)
        throw new IntegrationError(
          "cell_limit",
          "A header or cell is too long. Maximum cell length is 4,000 characters.",
        );
  return rows;
}
export function parseCsv(text: string): ImportRow[] {
  const result = Papa.parse<ImportRow>(text.replace(/^\uFEFF/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    dynamicTyping: false,
    transformHeader: (value) => value.trim(),
  });
  if (result.errors.length)
    throw new IntegrationError(
      "csv_invalid",
      `CSV row ${(result.errors[0].row || 0) + 2}: ${result.errors[0].message}`,
    );
  const headers = result.meta.fields || [];
  if (
    !headers.length ||
    headers.some((header) => !header) ||
    (result.meta as { renamedHeaders?: unknown }).renamedHeaders
  )
    throw new IntegrationError(
      "headers_invalid",
      "Every column needs a unique, nonempty header.",
    );
  return validateRows(result.data);
}
/** Check central-directory expansion BEFORE the XLSX parser allocates decompressed buffers. */
export function validateXlsxArchive(bytes: Buffer) {
  if (bytes.length < 22)
    throw new IntegrationError("xlsx_invalid", "Incomplete XLSX archive.");
  if (bytes.readUInt32LE(0) !== 0x04034b50)
    throw new IntegrationError(
      "xlsx_invalid",
      "The file is not an XLSX ZIP archive.",
    );
  let directory = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--)
    if (bytes.readUInt32LE(i) === 0x06054b50) {
      directory = i;
      break;
    }
  if (directory < 0)
    throw new IntegrationError("xlsx_invalid", "Incomplete XLSX archive.");
  const count = bytes.readUInt16LE(directory + 10),
    offset = bytes.readUInt32LE(directory + 16);
  if (count > 400 || count === 0 || offset >= directory)
    throw new IntegrationError(
      "xlsx_limit",
      "Unsupported or oversized XLSX archive.",
    );
  let cursor = offset,
    total = 0;
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > directory || bytes.readUInt32LE(cursor) !== 0x02014b50)
      throw new IntegrationError("xlsx_invalid", "Invalid XLSX directory.");
    const compressed = bytes.readUInt32LE(cursor + 20),
      expanded = bytes.readUInt32LE(cursor + 24);
    if (expanded === 0xffffffff || compressed === 0xffffffff)
      throw new IntegrationError(
        "xlsx_limit",
        "ZIP64 spreadsheets are unsupported.",
      );
    total += expanded;
    if (
      total > IMPORT_LIMITS.expandedBytes ||
      expanded > Math.max(200_000, compressed * 200)
    )
      throw new IntegrationError(
        "xlsx_expansion_limit",
        "The spreadsheet expands beyond the safe limit.",
      );
    const method = bytes.readUInt16LE(cursor + 10),
      flags = bytes.readUInt16LE(cursor + 8),
      local = bytes.readUInt32LE(cursor + 42);
    if (
      (flags & 1) !== 0 ||
      ![0, 8].includes(method) ||
      local + 30 > offset ||
      bytes.readUInt32LE(local) !== 0x04034b50
    )
      throw new IntegrationError(
        "xlsx_invalid",
        "Encrypted or malformed XLSX archives are unsupported.",
      );
    const start =
        local +
        30 +
        bytes.readUInt16LE(local + 26) +
        bytes.readUInt16LE(local + 28),
      end = start + compressed;
    if (end > offset || start < local)
      throw new IntegrationError(
        "xlsx_invalid",
        "Invalid XLSX entry boundaries.",
      );
    // Central-directory sizes are untrusted. Bounded inflation catches dishonest sizes before ExcelJS/JSZip.
    try {
      const actual =
        method === 0
          ? bytes.subarray(start, end)
          : inflateRawSync(bytes.subarray(start, end), {
              maxOutputLength: Math.max(
                1,
                Math.min(IMPORT_LIMITS.expandedBytes, expanded + 1),
              ),
            });
      if (actual.length !== expanded) throw new Error("size mismatch");
    } catch {
      throw new IntegrationError(
        "xlsx_expansion_limit",
        "A spreadsheet entry has an unsafe expansion or inconsistent size.",
      );
    }
    cursor +=
      46 +
      bytes.readUInt16LE(cursor + 28) +
      bytes.readUInt16LE(cursor + 30) +
      bytes.readUInt16LE(cursor + 32);
  }
}
export async function parseCatalogFile(
  name: string,
  bytes: Uint8Array,
  maxBytes = IMPORT_LIMITS.bytes,
): Promise<ImportRow[]> {
  checkUpload(bytes, maxBytes);
  if (/\.csv$/i.test(name))
    return parseCsv(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  if (!/\.xlsx$/i.test(name))
    throw new IntegrationError(
      "unsupported_file",
      "Upload CSV or XLSX. Macro-enabled spreadsheets are unsupported.",
    );
  validateXlsxArchive(Buffer.from(bytes));
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(bytes) as never);
  if (workbook.worksheets.length !== 1)
    throw new IntegrationError(
      "sheet_selection",
      "Upload a workbook with one worksheet, so its meaning is unambiguous.",
    );
  const sheet = workbook.worksheets[0];
  if (
    sheet.rowCount > IMPORT_LIMITS.rows + 1 ||
    sheet.columnCount > IMPORT_LIMITS.columns
  )
    throw new IntegrationError(
      "sheet_limit",
      "The worksheet exceeds the row or column limit.",
    );
  const headers = Array.from({ length: sheet.columnCount }, (_, i) =>
    sheet.getCell(1, i + 1).text.trim(),
  );
  if (
    headers.some((header) => !header) ||
    new Set(headers).size !== headers.length
  )
    throw new IntegrationError(
      "headers_invalid",
      "Every column needs a unique, nonempty header.",
    );
  const rows: ImportRow[] = [];
  for (let index = 2; index <= sheet.rowCount; index++) {
    const row: ImportRow = {};
    headers.forEach((header, column) => {
      const cell = sheet.getCell(index, column + 1);
      if (
        cell.formula ||
        cell.type === ExcelJS.ValueType.Hyperlink ||
        cell.type === ExcelJS.ValueType.Error
      )
        throw new IntegrationError(
          "unsafe_cell",
          `Row ${index} has a formula, hyperlink or error. Export plain values first.`,
        );
      row[header] = cell.text.trim();
    });
    if (Object.values(row).some(Boolean)) rows.push(row);
  }
  return validateRows(rows);
}
const aliases: Record<keyof ColumnMapping, string[]> = {
  sourceId: ["id", "source_id", "product_id", "record_id"],
  sku: ["sku", "code", "product_code"],
  name: ["name", "title", "product", "product_name", "service", "পণ্য", "নাম"],
  description: ["description", "details", "বিবরণ"],
  price: ["price", "price_bdt", "unit_price", "দাম", "মূল্য"],
  currency: ["currency", "মুদ্রা"],
  stock: ["stock", "quantity", "inventory", "মজুদ"],
  image: ["image", "image_url", "photo"],
  category: ["category", "type", "বিভাগ"],
  variant: ["variant", "size", "colour", "color"],
};
export function proposeMapping(headers: string[]): ColumnMapping {
  const result: ColumnMapping = {};
  for (const [field, names] of Object.entries(aliases)) {
    const matches = headers.filter((header) =>
      names.includes(header.toLocaleLowerCase().replace(/\s+/g, "_")),
    );
    if (matches.length === 1) result[field as keyof ColumnMapping] = matches[0];
  }
  return result;
}
function decimalMinor(value: string): number | null {
  if (!/^(0|[1-9]\d{0,8})(\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(result) ? result : null;
}
export function reviewRows(
  rows: ImportRow[],
  mapping: ColumnMapping,
): { candidates: CatalogCandidate[]; errors: RowError[] } {
  const errors: RowError[] = [],
    candidates: CatalogCandidate[] = [],
    seen = new Set<string>();
  const headers = new Set(Object.keys(rows[0] || {}));
  for (const header of Object.values(mapping))
    if (header && !headers.has(header))
      throw new IntegrationError(
        "mapping_invalid",
        `Column ${header} does not exist.`,
      );
  rows.forEach((row, index) => {
    const at = index + 2,
      read = (field: keyof ColumnMapping) =>
        (row[mapping[field] || ""] || "").trim(),
      before = errors.length;
    const fail = (field: string, message: string) =>
      errors.push({ row: at, field, message });
    const sourceId = read("sourceId") || read("sku"),
      sku = read("sku") || sourceId,
      name = read("name"),
      currency = read("currency").toUpperCase(),
      priceMinor = decimalMinor(read("price"));
    if (!sourceId || sourceId.length > 120)
      fail("sourceId", "Provide a stable ID or SKU, up to 120 characters.");
    if (seen.has(sourceId))
      fail("sourceId", "Duplicate source ID in this snapshot.");
    seen.add(sourceId);
    if (!name || name.length > 180)
      fail("name", "Provide a product/service name, up to 180 characters.");
    if (priceMinor === null)
      fail(
        "price",
        "Use a nonnegative decimal price without commas or currency symbols (for example 1290.00).",
      );
    if (!["BDT", "USD", "EUR", "GBP", "INR"].includes(currency))
      fail(
        "currency",
        "Set a supported explicit currency: BDT, USD, EUR, GBP or INR.",
      );
    const stockText = read("stock"),
      stock =
        stockText === ""
          ? null
          : /^\d{1,8}$/.test(stockText)
            ? Number(stockText)
            : null;
    if (stockText && stock === null)
      fail(
        "stock",
        "Use a whole nonnegative quantity or leave blank for unknown. “Available” is ambiguous.",
      );
    const image = read("image");
    if (image && !/^\/samples\/[a-z0-9-]+\.(svg|png|webp|jpg)$/.test(image))
      fail(
        "image",
        "Use an approved local /samples/ asset. Remote images require separate review and upload.",
      );
    if (errors.length !== before) return;
    const mapped = new Set(Object.values(mapping)),
      attributes = Object.fromEntries(
        Object.entries(row)
          .filter(([key]) => !mapped.has(key))
          .slice(0, 20),
      );
    const candidate = {
      sourceId,
      sku,
      name,
      description: read("description"),
      priceMinor: priceMinor!,
      currency,
      stock,
      image,
      category: read("category"),
      variant: read("variant"),
      attributes,
      row: at,
    };
    candidates.push({
      ...candidate,
      hash: createHash("sha256")
        .update(JSON.stringify(candidate))
        .digest("hex"),
    });
  });
  return { candidates, errors };
}
export async function parseDocument(
  name: string,
  bytes: Uint8Array,
  maxBytes = IMPORT_LIMITS.bytes,
): Promise<string> {
  checkUpload(bytes, maxBytes);
  let text: string;
  if (/\.(txt|md)$/i.test(name))
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  else if (/\.pdf$/i.test(name)) {
    if (Buffer.from(bytes).subarray(0, 5).toString() !== "%PDF-")
      throw new IntegrationError("pdf_invalid", "This is not a PDF document.");
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: bytes });
    try {
      const info = await parser.getInfo();
      if (info.total > 50)
        throw new IntegrationError(
          "pdf_limit",
          "Use a PDF with no more than 50 pages.",
        );
      const result = await parser.getText();
      text = result.text;
    } finally {
      await parser.destroy();
    }
    if (text.replace(/\s/g, "").length < 30)
      throw new IntegrationError(
        "ocr_required",
        "This PDF has too little readable text. Scanned documents need OCR, which is not configured.",
      );
  } else
    throw new IntegrationError(
      "unsupported_document",
      "Upload a text, Markdown or text-based PDF file.",
    );
  if (!text.trim() || text.length > IMPORT_LIMITS.documentCharacters)
    throw new IntegrationError(
      "document_limit",
      "Use a nonempty document of at most 80,000 characters.",
    );
  return text.trim();
}
export function documentChunks(text: string): string[] {
  const chunks: string[] = [];
  for (let offset = 0; offset < text.length; offset += 1000)
    chunks.push(text.slice(offset, offset + 1200));
  return chunks;
}
export type HistoricalPair = {
  question: string;
  answer: string;
  status: "draft";
  warning: string;
};
export function parseHistory(name: string, text: string): HistoricalPair[] {
  if (Buffer.byteLength(text) > IMPORT_LIMITS.bytes)
    throw new IntegrationError(
      "history_limit",
      "Chat exports must be smaller than 2 MB.",
    );
  let messages: { role: string; text: string }[] = [];
  if (/\.json$/i.test(name)) {
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      throw new IntegrationError(
        "history_invalid",
        "Expected a JSON array of {role,text} objects.",
      );
    }
    if (!Array.isArray(value))
      throw new IntegrationError("history_invalid", "Expected a JSON array.");
    messages = value.map((row) => ({ role: row?.role, text: row?.text }));
  } else if (/\.csv$/i.test(name))
    messages = parseCsv(text).map((row) => ({
      role: row.role,
      text: row.text,
    }));
  else if (/\.txt$/i.test(name)) {
    // Deliberately one export dialect: YYYY-MM-DD, HH:mm - Customer|Business: text.
    messages = text
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line, index) => {
        const match = line.match(
          /^\d{4}-\d{2}-\d{2}, \d{2}:\d{2} - (Customer|Business): (.+)$/,
        );
        if (!match)
          throw new IntegrationError(
            "history_dialect",
            `Line ${index + 1} does not match the documented WhatsApp text format.`,
          );
        return {
          role: match[1] === "Customer" ? "customer" : "business",
          text: match[2],
        };
      });
  } else
    throw new IntegrationError(
      "history_format",
      "Upload the documented CSV, JSON or WhatsApp TXT format.",
    );
  if (messages.length > 500)
    throw new IntegrationError(
      "history_limit",
      "Use at most 500 messages per review.",
    );
  if (
    messages.some(
      (row) =>
        !["customer", "business"].includes(row.role) ||
        typeof row.text !== "string" ||
        row.text.length > 4000,
    )
  )
    throw new IntegrationError(
      "history_invalid",
      "Each message requires role customer/business and text shorter than 4,000 characters.",
    );
  const result: HistoricalPair[] = [];
  for (let index = 0; index < messages.length - 1; index++)
    if (
      messages[index].role === "customer" &&
      messages[index + 1].role === "business"
    )
      result.push({
        question: redactHistory(messages[index].text),
        answer: redactHistory(messages[index + 1].text),
        status: "draft",
        warning:
          "Historical example only. Verify policy and remove personal details or one-off discounts before publishing.",
      });
  if (!result.length)
    throw new IntegrationError(
      "history_empty",
      "No customer/business answer pairs were found.",
    );
  return result.slice(0, 100);
}
