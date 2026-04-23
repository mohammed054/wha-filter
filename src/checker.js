import pkg from "whatsapp-web.js";
const { Client, LocalAuth } = pkg;
import qrcode from "qrcode-terminal";
import chalk from "chalk";
import cliProgress from "cli-progress";
import {
  writeCsvHeader,
  appendCsvRow,
  writeSummaryReport,
  ensureDir,
} from "./fileUtils.js";
import path from "path";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function formatDuration(ms) {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return min > 0 ? `${min}m ${sec}s` : `${sec}s`;
}

/**
 * Initialize WhatsApp Web client and wait until ready.
 */
async function initClient(saveSession) {
  const authStrategy = saveSession
    ? new LocalAuth({ dataPath: path.resolve(process.cwd(), ".wwebjs_auth") })
    : undefined;

  const client = new Client({
    authStrategy,
    puppeteer: {
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--disable-gpu",
      ],
    },
  });

  return new Promise((resolve, reject) => {
    let qrShown = false;

    client.on("qr", (qr) => {
      if (!qrShown) {
        console.log(chalk.yellow("\n📱  Scan this QR code with WhatsApp on your phone:"));
        console.log(chalk.gray("    (Settings → Linked Devices → Link a Device)\n"));
        qrShown = true;
      }
      qrcode.generate(qr, { small: true });
    });

    client.on("authenticated", () => {
      console.log(chalk.green("\n✔  Authenticated!"));
      if (saveSession) {
        console.log(chalk.gray("   Session saved — no QR scan needed next time.\n"));
      }
    });

    client.on("auth_failure", (msg) => reject(new Error(`Auth failed: ${msg}`)));

    client.on("ready", () => {
      console.log(chalk.green("✔  WhatsApp client ready. Starting checks...\n"));
      resolve(client);
    });

    client.on("disconnected", (reason) => {
      console.log(chalk.red(`\n⚠  Disconnected: ${reason}`));
    });

    client.initialize();
  });
}

/**
 * Resolve the best available name for a contact.
 *
 * Priority:
 *   1. contact.name     — saved in your phone's address book (most reliable)
 *   2. contact.pushname — the person's own WhatsApp display name
 *   3. ""               — registered on WA but no name available
 *
 * Returns { name, nameSource }
 */
async function resolveName(client, wid) {
  try {
    const contact = await client.getContactById(wid);

    if (contact.name && contact.name.trim()) {
      return { name: contact.name.trim(), nameSource: "contact" };
    }
    if (contact.pushname && contact.pushname.trim()) {
      return { name: contact.pushname.trim(), nameSource: "pushname" };
    }
    return { name: "", nameSource: "unknown" };
  } catch {
    return { name: "", nameSource: "unknown" };
  }
}

/**
 * Main checker — iterates numbers, checks WA registration, fetches names, writes CSV.
 */
export async function checkNumbers({
  numbers,
  outputPath,
  invalidPath,
  delay,
  saveSession,
}) {
  ensureDir(outputPath);
  if (invalidPath) ensureDir(invalidPath);

  // Write CSV headers upfront
  writeCsvHeader(outputPath);
  if (invalidPath) writeCsvHeader(invalidPath);

  let client;
  try {
    client = await initClient(saveSession);
  } catch (err) {
    console.error(chalk.red(`\n✖  Failed to start WhatsApp client: ${err.message}`));
    process.exit(1);
  }

  const bar = new cliProgress.SingleBar(
    {
      format:
        chalk.cyan(" {bar}") +
        " {percentage}% | {value}/{total} | " +
        chalk.green("✔ {valid}") +
        " | " +
        chalk.red("✖ {invalid}") +
        " | ETA: {eta}s",
      barCompleteChar: "█",
      barIncompleteChar: "░",
      hideCursor: true,
    },
    cliProgress.Presets.shades_classic
  );

  let validCount = 0;
  let invalidCount = 0;
  const startTime = Date.now();

  bar.start(numbers.length, 0, { valid: 0, invalid: 0 });

  for (const number of numbers) {
    const wid = `${number}@c.us`;

    try {
      const isRegistered = await client.isRegisteredUser(wid);

      if (isRegistered) {
        // Fetch name — runs in parallel with the delay below
        const { name, nameSource } = await resolveName(client, wid);

        appendCsvRow(outputPath, { number, name, nameSource });
        validCount++;
      } else {
        if (invalidPath) {
          appendCsvRow(invalidPath, { number, name: "", nameSource: "not_registered" });
        }
        invalidCount++;
      }
    } catch (err) {
      if (invalidPath) {
        appendCsvRow(invalidPath, { number, name: "", nameSource: `error: ${err.message}` });
      }
      invalidCount++;
    }

    bar.update(validCount + invalidCount, { valid: validCount, invalid: invalidCount });

    if (delay > 0) await sleep(delay);
  }

  bar.stop();

  const duration = formatDuration(Date.now() - startTime);

  const reportPath = writeSummaryReport({
    outputPath,
    total: numbers.length,
    valid: validCount,
    invalid: invalidCount,
    duration,
  });

  console.log("\n" + chalk.bold("─".repeat(52)));
  console.log(chalk.bold("  📊  Results Summary"));
  console.log(chalk.bold("─".repeat(52)));
  console.log(`  Total checked  : ${chalk.white.bold(numbers.length)}`);
  console.log(`  Has WhatsApp   : ${chalk.green.bold(validCount)}`);
  console.log(`  No WhatsApp    : ${chalk.red.bold(invalidCount)}`);
  console.log(`  Duration       : ${chalk.yellow(duration)}`);
  console.log(chalk.bold("─".repeat(52)));
  console.log(`\n  ${chalk.green("✔")} Valid CSV saved to      : ${chalk.white(outputPath)}`);
  if (invalidPath) {
    console.log(`  ${chalk.red("✖")} Invalid CSV saved to    : ${chalk.white(invalidPath)}`);
  }
  console.log(`  📄 Report saved to       : ${chalk.white(reportPath)}`);
  console.log();

  await client.destroy();
  process.exit(0);
}