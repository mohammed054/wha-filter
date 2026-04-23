import fs from "fs";
import path from "path";

/**
 * Read phone numbers from a file.
 * Supports: one number per line, CSV (first column), or space-separated.
 * Strips +, spaces, dashes. Skips blank lines and comments (#).
 */
export function readNumbersFromFile(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split(/\r?\n/);

  const numbers = [];
  for (const raw of lines) {
    const line = raw.trim();

    // Skip blank lines and comments
    if (!line || line.startsWith("#")) continue;

    // Handle CSV: take first column
    const cell = line.split(",")[0].trim();

    // Normalize: strip +, spaces, dashes, parentheses
    const normalized = cell.replace(/[\s\-\(\)]/g, "").replace(/^\+/, "");

    // Basic validation: must be 7–15 digits
    if (/^\d{7,15}$/.test(normalized)) {
      numbers.push(normalized);
    }
  }

  // Deduplicate
  return [...new Set(numbers)];
}

/**
 * Append a number to a file (creates file if it doesn't exist).
 */
export function appendToFile(filePath, number) {
  fs.appendFileSync(filePath, number + "\n", "utf-8");
}

/**
 * Write a summary report next to the output file.
 */
export function writeSummaryReport({ outputPath, total, valid, invalid, duration }) {
  const reportPath = outputPath.replace(/(\.[^.]+)?$/, "_report.txt");
  const lines = [
    "=== WhatsApp Checker Report ===",
    `Date       : ${new Date().toLocaleString()}`,
    `Total      : ${total}`,
    `Valid (WA) : ${valid}`,
    `Invalid    : ${invalid}`,
    `Duration   : ${duration}`,
    `Output     : ${outputPath}`,
  ];
  fs.writeFileSync(reportPath, lines.join("\n") + "\n", "utf-8");
  return reportPath;
}

/**
 * Ensure a directory exists for a given file path.
 */
export function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
