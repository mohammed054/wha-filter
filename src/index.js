#!/usr/bin/env node

import { program } from "commander";
import chalk from "chalk";
import { checkNumbers } from "./checker.js";
import { readNumbersFromFile } from "./fileUtils.js";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const banner = `
${chalk.green("██╗    ██╗ █████╗      ██████╗██╗  ██╗███████╗ ██████╗██╗  ██╗███████╗██████╗ ")}
${chalk.green("██║    ██║██╔══██╗    ██╔════╝██║  ██║██╔════╝██╔════╝██║ ██╔╝██╔════╝██╔══██╗")}
${chalk.green("██║ █╗ ██║███████║    ██║     ███████║█████╗  ██║     █████╔╝ █████╗  ██████╔╝")}
${chalk.green("██║███╗██║██╔══██║    ██║     ██╔══██║██╔══╝  ██║     ██╔═██╗ ██╔══╝  ██╔══██╗")}
${chalk.green("╚███╔███╔╝██║  ██║    ╚██████╗██║  ██║███████╗╚██████╗██║  ██╗███████╗██║  ██║")}
${chalk.green(" ╚══╝╚══╝ ╚═╝  ╚═╝     ╚═════╝╚═╝  ╚═╝╚══════╝ ╚═════╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝")}
${chalk.gray("                    WhatsApp Number Verifier — CLI Tool")}
`;

program
  .name("wa-checker")
  .description("Verify which phone numbers have active WhatsApp accounts")
  .version("1.0.0");

program
  .command("check")
  .description("Check a list of phone numbers for WhatsApp registration")
  .requiredOption(
    "-i, --input <file>",
    "Input file with phone numbers (one per line)"
  )
  .option(
    "-o, --output <file>",
    "Output CSV for WhatsApp numbers (valid / suspicious / blocked)",
    "whatsapp_valid.csv"
  )
  .option(
    "--invalid <file>",
    "Output CSV for numbers not on WhatsApp",
    "whatsapp_invalid.csv"
  )
  .option(
    "-d, --delay <ms>",
    "Delay between checks in milliseconds (avoid rate limits)",
    "1500"
  )
  .option("--no-session", "Don't save WhatsApp session (fresh login every time)")
  .action(async (options) => {
    console.log(banner);

    // Resolve input path
    const inputPath = path.resolve(process.cwd(), options.input);
    if (!fs.existsSync(inputPath)) {
      console.error(chalk.red(`\n✖  Input file not found: ${inputPath}`));
      process.exit(1);
    }

    // Read numbers
    console.log(chalk.cyan(`\n📂  Reading numbers from: ${chalk.white(inputPath)}`));
    const numbers = readNumbersFromFile(inputPath);

    if (numbers.length === 0) {
      console.error(chalk.red("✖  No valid phone numbers found in input file."));
      console.log(chalk.gray("   Format: one number per line, e.g. 971501234567 or +971501234567"));
      process.exit(1);
    }

    console.log(chalk.cyan(`📋  Found ${chalk.white.bold(numbers.length)} number(s) to check\n`));

    // Resolve output paths
    const outputPath = path.resolve(process.cwd(), options.output);
    const invalidPath = path.resolve(process.cwd(), options.invalid);

    const delay = parseInt(options.delay, 10);
    const saveSession = options.session !== false;

    // Status legend
    console.log(chalk.gray("  Status legend:"));
    console.log(chalk.green("  ✔  valid")      + chalk.gray("      = registered, has a name or profile pic"));
    console.log(chalk.yellow("  ⚠  suspicious") + chalk.gray("  = registered but fully anonymous"));
    console.log(chalk.magenta("  ⛔  blocked")    + chalk.gray("     = registered but contact lookup failed (likely blocked you)"));
    console.log(chalk.red("  ✖  invalid")    + chalk.gray("     = not on WhatsApp"));
    console.log();

    // Run checker
    await checkNumbers({
      numbers,
      outputPath,
      invalidPath,
      delay,
      saveSession,
    });
  });

program
  .command("clear-session")
  .description("Delete saved WhatsApp session (forces re-login next time)")
  .action(() => {
    const sessionDir = path.resolve(process.cwd(), ".wwebjs_auth");
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
      console.log(chalk.green("✔  Session cleared. You will need to scan QR code again."));
    } else {
      console.log(chalk.yellow("⚠  No saved session found."));
    }
  });

// Show help if no command provided
if (process.argv.length <= 2) {
  console.log(banner);
  program.help();
}

program.parse();
