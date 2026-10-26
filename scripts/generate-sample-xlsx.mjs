import ExcelJS from "exceljs";
import Papa from "papaparse";
import { readFile, writeFile } from "node:fs/promises";

// Same reviewed synthetic catalog as the downloadable CSV; no macros or formulas.
const csv = await readFile(
  new URL("../public/samples/catalog.csv", import.meta.url),
  "utf8",
);
const parsed = Papa.parse(csv, { skipEmptyLines: true });
if (parsed.errors.length) throw new Error("Sample CSV could not be parsed.");
const workbook = new ExcelJS.Workbook();
workbook.creator = "RelayDesk synthetic fixtures";
workbook.created = new Date("2026-10-24T00:00:00Z");
workbook.modified = workbook.created;
const sheet = workbook.addWorksheet("Catalog");
for (const row of parsed.data) sheet.addRow(row);
sheet.getRow(1).font = { bold: true };
sheet.columns.forEach((column) => {
  column.width = 24;
});
sheet.views = [{ state: "frozen", ySplit: 1 }];
const bytes = await workbook.xlsx.writeBuffer();
await writeFile(
  new URL("../public/samples/catalog.xlsx", import.meta.url),
  bytes,
);
await writeFile(new URL("../fixtures/catalog.xlsx", import.meta.url), bytes);
console.log("Generated synthetic XLSX catalog in public/samples and fixtures.");
