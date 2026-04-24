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
 * Determine full status for a registered number.
 *
 * Status values:
 *   valid      — registered, has a name or pushname
 *   suspicious — registered, but zero name/pushname AND no profile picture
 *                (burner / spam / freshly-created account)
 *   blocked    — registered, but contact lookup fails entirely
 *                (strong signal the account has blocked you)
 *
 * Returns { name, nameSource, status }
 */
async function resolveRegisteredContact(client, wid) {
  let contact;
  try {
    contact = await client.getContactById(wid);
  } catch {
    // Can't retrieve contact info at all — almost certainly blocked
    return { name: "—", nameSource: "blocked", status: "blocked" };
  }

  // Resolve best available name
  const rawName =
    (contact.name && contact.name.trim()) ||
    (contact.pushname && contact.pushname.trim()) ||
    "";

  const nameSource = contact.name?.trim()
    ? "contact"
    : contact.pushname?.trim()
    ? "pushname"
    : "none";

  // Try to fetch profile picture — blocked contacts hide it
  let hasProfilePic = false;
  try {
    const pic = await client.getProfilePicUrl(wid);
    hasProfilePic = !!pic;
  } catch {
    // Silently ignore — some accounts restrict profile pic visibility
  }

  // Suspicious: registered but completely anonymous (no name, no pic)
  if (!rawName && !hasProfilePic) {
    return { name: "—", nameSource: "none", status: "suspicious" };
  }

  return {
    name: rawName || "—",
    nameSource,
    status: "valid",
  };
}

/**
 * Main checker — iterates numbers, checks WA registration, fetches names, writes CSVs.
 */
export async function checkNumbers({
  numbers,
  outputPath,
  invalidPath,
  delay,
  saveSession,
}) {
  ensureDir(outputPath);
  ensureDir(invalidPath);

  // Write CSV headers upfront (overwrites any previous run)
  writeCsvHeader(outputPath);
  writeCsvHeader(invalidPath);

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
        chalk.yellow("⚠ {suspicious}") +
        " | " +
        chalk.magenta("⛔ {blocked}") +
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
  let suspiciousCount = 0;
  let blockedCount = 0;
  let invalidCount = 0;
  const startTime = Date.now();

  bar.start(numbers.length, 0, {
    valid: 0,
    suspicious: 0,
    blocked: 0,
    invalid: 0,
  });

  for (const number of numbers) {
    const wid = `${number}@c.us`;

    try {
      const isRegistered = await client.isRegisteredUser(wid);

      if (isRegistered) {
        const { name, nameSource, status } = await resolveRegisteredContact(client, wid);

        // Valid, suspicious, and blocked all go to the valid output (they ARE on WA)
        appendCsvRow(outputPath, { number, name, nameSource, status });

        if (status === "valid") validCount++;
        else if (status === "suspicious") suspiciousCount++;
        else if (status === "blocked") blockedCount++;
      } else {
        // Not on WhatsApp — write to invalid file
        appendCsvRow(invalidPath, {
          number,
          name: "—",
          nameSource: "not_registered",
          status: "invalid",
        });
        invalidCount++;
      }
    } catch (err) {
      // Unexpected error — treat as invalid
      appendCsvRow(invalidPath, {
        number,
        name: "—",
        nameSource: "error",
        status: "invalid",
      });
      invalidCount++;
    }

    bar.update(validCount + suspiciousCount + blockedCount + invalidCount, {
      valid: validCount,
      suspicious: suspiciousCount,
      blocked: blockedCount,
      invalid: invalidCount,
    });

    if (delay > 0) await sleep(delay);
  }

  bar.stop();

  const duration = formatDuration(Date.now() - startTime);

  const reportPath = writeSummaryReport({
    outputPath,
    invalidPath,
    total: numbers.length,
    valid: validCount,
    suspicious: suspiciousCount,
    blocked: blockedCount,
    invalid: invalidCount,
    duration,
  });

  const waTotal = validCount + suspiciousCount + blockedCount;

  console.log("\n" + chalk.bold("─".repeat(56)));
  console.log(chalk.bold("  📊  Results Summary"));
  console.log(chalk.bold("─".repeat(56)));
  console.log(`  Total checked   : ${chalk.white.bold(numbers.length)}`);
  console.log(`  ✔  Valid        : ${chalk.green.bold(validCount)}`);
  console.log(`  ⚠  Suspicious  : ${chalk.yellow.bold(suspiciousCount)}`);
  console.log(`  ⛔  Blocked     : ${chalk.magenta.bold(blockedCount)}`);
  console.log(`  ✖  No WhatsApp  : ${chalk.red.bold(invalidCount)}`);
  console.log(`  Duration        : ${chalk.yellow(duration)}`);
  console.log(chalk.bold("─".repeat(56)));
  console.log(
    `\n  ${chalk.green("✔")} WA numbers CSV  : ${chalk.white(outputPath)}  ${chalk.gray(`(${waTotal} rows)`)}`
  );
  console.log(
    `  ${chalk.red("✖")} Invalid CSV     : ${chalk.white(invalidPath)}  ${chalk.gray(`(${invalidCount} rows)`)}`
  );
  console.log(`  📄 Report        : ${chalk.white(reportPath)}`);
  console.log();

  await client.destroy();
  process.exit(0);
}
