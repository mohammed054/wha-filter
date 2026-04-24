import fs from "fs";
import path from "path";

/**
 * Read phone numbers from a file.
 * Supports: plain text (one per line), or CSV (reads first column only).
 * Strips +, spaces, dashes, parentheses. Skips blank lines and # comments.
 * Numbers must already be in international format (country code included).
 */
export function readNumbersFromFile(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split(/\r?\n/);

  const numbers = [];
  for (const raw of lines) {
    const line = raw.trim();

    // Skip blank lines and comments
    if (!line || line.startsWith("#")) continue;

    // If CSV-ish, take only the first column
    const cell = line.split(",")[0].trim();

    // Normalize: strip +, spaces, dashes, parentheses
    const normalized = cell.replace(/[\s\-\(\)]/g, "").replace(/^\+/, "");

    // Must be 7–15 digits (ITU E.164 range)
    if (/^\d{7,15}$/.test(normalized)) {
      numbers.push(normalized);
    }
  }

  // Deduplicate while preserving order
  return [...new Set(numbers)];
}

/**
 * Escape a CSV field value (wrap in quotes if it contains comma/quote/newline).
 */
function csvField(value) {
  const str = String(value ?? "");
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Write the CSV header row to a file (overwrites if exists).
 * Columns: number, name, name_source, status
 */
export function writeCsvHeader(filePath) {
  fs.writeFileSync(filePath, "number,name,name_source,status\n", "utf-8");
}

/**
 * Append one result row to a CSV file.
 * Fields: number, name, name_source, status
 *
 * status values:
 *   valid          — registered, has a name or profile pic
 *   suspicious     — registered, completely anonymous (no name, no profile pic)
 *   blocked        — registered, but all contact lookups fail (likely blocked you)
 *   invalid        — not registered on WhatsApp
 */
export function appendCsvRow(filePath, { number, name, nameSource, status }) {
  const row = [
    csvField(number),
    csvField(name),
    csvField(nameSource),
    csvField(status),
  ].join(",");
  fs.appendFileSync(filePath, row + "\n", "utf-8");
}

/**
 * Write a plain-text summary report alongside the output CSV.
 */
export function writeSummaryReport({
  outputPath,
  invalidPath,
  total,
  valid,
  suspicious,
  blocked,
  invalid,
  duration,
}) {
  const reportPath = outputPath.replace(/(\.[^.]+)?$/, "_report.txt");
  const waTotal = valid + suspicious + blocked;

  const lines = [
    "=== WhatsApp Checker — Run Report ===",
    `Date            : ${new Date().toLocaleString()}`,
    `Duration        : ${duration}`,
    "",
    "── Numbers checked ──────────────────",
    `Total           : ${total}`,
    `Has WhatsApp    : ${waTotal}  (valid: ${valid}  suspicious: ${suspicious}  blocked: ${blocked})`,
    `No WhatsApp     : ${invalid}`,
    "",
    "── Output files ─────────────────────",
    `WA numbers CSV  : ${outputPath}`,
    `Invalid CSV     : ${invalidPath}`,
    "",
    "── Status legend ────────────────────",
    "  valid      = registered, has a name or profile picture",
    "  suspicious = registered but completely anonymous (no name, no profile pic)",
    "               — could be a burner or spam account",
    "  blocked    = registered but all contact lookups failed",
    "               — strong signal the account has blocked you",
    "  invalid    = not registered on WhatsApp",
    "",
    "── name_source legend ───────────────",
    "  contact    = name from your phone's address book",
    "  pushname   = the person's own WhatsApp display name",
    "  none       = registered but no name available",
    "  blocked    = contact info could not be fetched",
    "  not_registered = number is not on WhatsApp",
    "  error      = unexpected error during lookup",
  ];

  fs.writeFileSync(reportPath, lines.join("\n") + "\n", "utf-8");
  return reportPath;
}

/**
 * Ensure the directory for a given file path exists.
 */
export function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
