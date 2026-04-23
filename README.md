# 📱 WA Checker — WhatsApp Number Verifier

A CLI tool that verifies which phone numbers have active WhatsApp accounts and filters them into separate files.

## How It Works

1. You provide a file with phone numbers (one per line)
2. The tool opens a headless browser and connects to WhatsApp Web
3. You scan a QR code once with your phone — session is saved for future runs
4. It checks every number and writes valid ones to an output file

---

## Requirements

- Node.js >= 18
- A WhatsApp account (to authenticate)
- Google Chrome or Chromium (used by Puppeteer under the hood)

---

## Installation

```bash
# 1. Clone / copy the project
cd your-project-folder

# 2. Install dependencies
npm install

# 3. (Optional) Make the CLI globally available
npm link
```

---

## Usage

### Basic — check numbers from a file

```bash
node src/index.js check -i numbers.txt
```

This will:
- Ask you to scan a QR code on first run
- Check every number in `numbers.txt`
- Save valid WhatsApp numbers to `whatsapp_valid.txt`
- Save a summary report to `whatsapp_valid_report.txt`

---

### All Options

```bash
node src/index.js check [options]

Options:
  -i, --input <file>      Input file with phone numbers (required)
  -o, --output <file>     Output file for valid numbers (default: whatsapp_valid.txt)
  --invalid <file>        Output file for numbers WITHOUT WhatsApp (optional)
  -d, --delay <ms>        Delay between checks in ms (default: 1500)
  --no-session            Don't save session — fresh QR login every time
  -h, --help              Show help
```

---

### Examples

**Check a list, output valid + invalid separately:**
```bash
node src/index.js check -i contacts.txt -o valid.txt --invalid no_whatsapp.txt
```

**Faster checking (reduce delay — use carefully):**
```bash
node src/index.js check -i numbers.txt -d 800
```

**Fresh login (no saved session):**
```bash
node src/index.js check -i numbers.txt --no-session
```

**Clear saved session:**
```bash
node src/index.js clear-session
```

---

## Input File Format

One phone number per line. The tool accepts:

```
# This is a comment — ignored
971501234567
+1 (555) 000-1234
+44-7700-900123
0044 7700 900456
```

- International format required (country code included)
- `+`, spaces, dashes, parentheses are stripped automatically
- Duplicate numbers are removed
- CSV files are supported — the tool reads the first column

---

## Output Files

| File | Contents |
|---|---|
| `whatsapp_valid.txt` | Numbers confirmed to have WhatsApp |
| `whatsapp_valid_report.txt` | Summary: total, valid, invalid, duration |
| `no_whatsapp.txt` | (optional) Numbers without WhatsApp |

---

## Session Persistence

On first run, a QR code is displayed in the terminal. Scan it with WhatsApp on your phone (**Settings → Linked Devices → Link a Device**).

The session is saved to `.wwebjs_auth/` so you don't need to scan again on future runs.

To log out / reset:
```bash
node src/index.js clear-session
```

---

## Rate Limiting

WhatsApp may temporarily block checks if you send too many requests too fast. The default delay of **1500ms** between checks is a safe starting point.

- For small lists (< 100): `--delay 1000` is fine
- For large lists (1000+): keep `--delay 1500` or higher
- If you get disconnected, wait a few minutes and retry

---

## Tips

- Run in a screen/tmux session for large lists so it keeps running if your terminal closes
- The tool resumes appending to the output file — safe to restart after an interruption

---

## Project Structure

```
wa-checker/
├── src/
│   ├── index.js       # CLI entry point & commands
│   ├── checker.js     # WhatsApp client + checking logic
│   └── fileUtils.js   # File reading/writing helpers
├── .gitignore
├── package.json
└── README.md
```
