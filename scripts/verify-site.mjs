import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const textFiles = ["404.html", "index.html", "join.html", "privacy.html", "support.html", "styles.css"];
const binaryFiles = ["assets/feature-graphic-1024x500.png", "assets/icon-512x512.png"];
const normalize = (value) => value.replace(/\r\n/gu, "\n");
const noJekyllPath = resolve(root, ".nojekyll");
if (!existsSync(noJekyllPath)) throw new Error("Missing committed GitHub Pages marker: .nojekyll");
const localText = Object.fromEntries(textFiles.map((name) => {
  const path = resolve(root, name);
  if (!existsSync(path)) throw new Error(`Missing public-site file: ${name}`);
  return [name, normalize(readFileSync(path, "utf8"))];
}));
const localBinary = Object.fromEntries(binaryFiles.map((name) => {
  const path = resolve(root, name);
  if (!existsSync(path)) throw new Error(`Missing public-site file: ${name}`);
  return [name, readFileSync(path)];
}));

const requiredMarkers = {
  "404.html": ["This road ends here.", "href=\"index.html\""],
  "index.html": ["href=\"join.html\"", "Android closed beta"],
  "join.html": [
    "Two steps, then play.",
    "Zwei Schritte, dann geht’s los.",
    "add and manage your Google Play test access",
    "deinen Google-Play-Testzugang einzurichten und zu verwalten",
    "https://play.google.com/apps/testing/com.dearlittleroads.puzzle",
  ],
  "privacy.html": [
    "<strong>Effective:</strong> 22 July 2026",
    "<strong>Gültig ab:</strong> 22. Juli 2026",
    "organizer-managed Google Play tester list",
  ],
  "support.html": ["To request removal", "Um die Entfernung anzufordern"],
  "styles.css": [".join-steps", ".join-step"],
};
const stalePattern = /Google Group|Google-Gruppe|groups\.google\.com|self-join|direktem Beitritt/iu;

function assertContract(contents, label) {
  for (const [name, markers] of Object.entries(requiredMarkers)) {
    for (const marker of markers) {
      if (!contents[name]?.includes(marker)) throw new Error(`${label}/${name} is missing: ${marker}`);
    }
  }
  const combined = Object.values(contents).join("\n");
  if (stalePattern.test(combined)) throw new Error(`${label} still contains retired Google Group copy.`);
}

const delay = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));

function parseArguments(argv) {
  const result = { live: false, attempts: 1, delayMs: 10_000 };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--live") result.live = true;
    else if (argument === "--attempts") result.attempts = Number(argv[++index]);
    else if (argument === "--delay-ms") result.delayMs = Number(argv[++index]);
    else throw new Error(`Unknown option: ${argument}`);
  }
  if (!Number.isSafeInteger(result.attempts) || result.attempts < 1 || result.attempts > 120) {
    throw new Error("--attempts must be an integer from 1 to 120.");
  }
  if (!Number.isSafeInteger(result.delayMs) || result.delayMs < 0 || result.delayMs > 60_000) {
    throw new Error("--delay-ms must be an integer from 0 to 60000.");
  }
  return result;
}

async function fetchLive(attempt) {
  const cacheBuster = `verify=${Date.now()}-${attempt}`;
  const textEntries = await Promise.all(textFiles.map(async (name) => {
    const response = await fetch(`https://dearlittleroads.github.io/${name}?${cacheBuster}`, {
      headers: { "cache-control": "no-cache" },
    });
    if (!response.ok) throw new Error(`${name} returned HTTP ${response.status}`);
    return [name, normalize(await response.text())];
  }));
  const binaryEntries = await Promise.all(binaryFiles.map(async (name) => {
    const response = await fetch(`https://dearlittleroads.github.io/${name}?${cacheBuster}`, {
      headers: { "cache-control": "no-cache" },
    });
    if (!response.ok) throw new Error(`${name} returned HTTP ${response.status}`);
    return [name, Buffer.from(await response.arrayBuffer())];
  }));
  return {
    text: Object.fromEntries(textEntries),
    binary: Object.fromEntries(binaryEntries),
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  assertContract(localText, "local");
  if (!options.live) {
    process.stdout.write("Local public-site contract passed.\n");
    return;
  }

  let lastError = null;
  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    try {
      const live = await fetchLive(attempt);
      assertContract(live.text, "live");
      for (const name of textFiles) {
        if (live.text[name] !== localText[name]) {
          throw new Error(`live/${name} does not match the committed source after line-ending normalization.`);
        }
      }
      for (const name of binaryFiles) {
        if (!live.binary[name].equals(localBinary[name])) {
          throw new Error(`live/${name} is not byte-equivalent to the committed source.`);
        }
      }
      process.stdout.write(`Live public-site contract passed on attempt ${attempt}.\n`);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < options.attempts) await delay(options.delayMs);
    }
  }
  throw new Error(`Live public-site verification failed: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
