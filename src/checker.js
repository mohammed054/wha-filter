import pkg from "whatsapp-web.js";
const { Client, LocalAuth } = pkg;
import qrcode from "qrcode-terminal";
import chalk from "chalk";
import cliProgress from "cli-progress";
import { appendToFile, writeSummaryReport, ensureDir } from "./fileUtils.js";
import path from "path";

/**
 * Sleep helper
 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Format milliseconds into a human-readable duration.
 */
function formatDuration(ms) {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return min > 0 ? `${min}m ${sec}s` : `${sec}s`;
}

/**
 * Initialize the WhatsApp Web client and wait until it's ready.
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
      console.log(chalk.green("\n✔  Authenticated successfully!"));
      if (saveSession) {
        console.log(chalk.gray("   Session saved — no QR scan needed next time.\n"));
      }
    });

    client.on("auth_failure", (msg) => {
      reject(new Error(`Authentication failed: ${msg}`));
    });

    client.on("ready", () => {
      console.log(chalk.green("✔  WhatsApp client is ready. Starting checks...\n"));
      resolve(client);
    });

    client.on("disconnected", (reason) => {
      console.log(chalk.red(`\n⚠  Client disconnected: ${reason}`));
    });

    client.initialize();
  });
}

/**
 * Main checker function.
 */
export async function checkNumbers({ numbers, outputPath, invalidPath, delay, saveSession }) {
  // Ensure output directories exist
  ensureDir(outputPath);
  if (invalidPath) ensureDir(invalidPath);

  let client;
  try {
    client = await initClient(saveSession);
  } catch (err) {
    console.error(chalk.red(`\n✖  Failed to start WhatsApp client: ${err.message}`));
    process.exit(1);
  }

  // Progress bar
  const bar = new cliProgress.SingleBar(
    {
      format:
        chalk.cyan(" {bar}") +
        " {percentage}% | {value}/{total} | " +
        chalk.green("✔ {valid}") +
        " valid | " +
        chalk.red("✖ {invalid}") +
        " invalid | ETA: {eta}s",
      barCompleteChar: "█",
      barIncompleteChar: "░",
      hideCursor: true,
    },
    cliProgress.Presets.shades_classic
  );

  let validCount = 0;
  let invalidCount = 0;
  const startTime = Date.now();
  const results = [];

  bar.start(numbers.length, 0, { valid: 0, invalid: 0 });

  for (const number of numbers) {
    const wid = `${number}@c.us`;

    try {
      const isRegistered = await client.isRegisteredUser(wid);

      results.push({ number, isRegistered });

      if (isRegistered) {
        validCount++;
        appendToFile(outputPath, number);
      } else {
        invalidCount++;
        if (invalidPath) appendToFile(invalidPath, number);
      }
    } catch (err) {
      // On error, treat as unknown — log and skip
      results.push({ number, isRegistered: false, error: err.message });
      invalidCount++;
      if (invalidPath) appendToFile(invalidPath, number);
    }

    bar.update(validCount + invalidCount, { valid: validCount, invalid: invalidCount });

    // Delay between checks to avoid rate limiting
    if (delay > 0) await sleep(delay);
  }

  bar.stop();

  const duration = formatDuration(Date.now() - startTime);

  // Write summary report
  const reportPath = writeSummaryReport({
    outputPath,
    total: numbers.length,
    valid: validCount,
    invalid: invalidCount,
    duration,
  });

  // Print results
  console.log("\n" + chalk.bold("─".repeat(50)));
  console.log(chalk.bold("  📊  Results Summary"));
  console.log(chalk.bold("─".repeat(50)));
  console.log(`  Total checked  : ${chalk.white.bold(numbers.length)}`);
  console.log(`  Has WhatsApp   : ${chalk.green.bold(validCount)}`);
  console.log(`  No WhatsApp    : ${chalk.red.bold(invalidCount)}`);
  console.log(`  Duration       : ${chalk.yellow(duration)}`);
  console.log(chalk.bold("─".repeat(50)));
  console.log(`\n  ${chalk.green("✔")} Valid numbers saved to  : ${chalk.white(outputPath)}`);
  if (invalidPath) {
    console.log(`  ${chalk.red("✖")} Invalid numbers saved to: ${chalk.white(invalidPath)}`);
  }
  console.log(`  📄 Report saved to       : ${chalk.white(reportPath)}`);
  console.log();

  await client.destroy();
  process.exit(0);
}
