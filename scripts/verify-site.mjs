import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const PUBLIC_HTML_FILES = [
  "404.html",
  "index.html",
  "join.html",
  "legal.html",
  "privacy.html",
  "support.html",
];

export const PUBLIC_TEXT_FILES = [
  ...PUBLIC_HTML_FILES,
  "support-form.js",
  "styles.css",
];

export const PUBLIC_BINARY_FILES = [
  "assets/feature-graphic-1024x500.png",
  "assets/icon-512x512.png",
];

export const PUBLIC_PAYLOAD_FILES = [
  ".nojekyll",
  "app-ads.txt",
  ...PUBLIC_TEXT_FILES,
  ...PUBLIC_BINARY_FILES,
].sort((left, right) => left.localeCompare(right, "en"));

export const REPOSITORY_TOOLING_FILES = [
  ".github/workflows/verify-site.yml",
  "scripts/verify-site.mjs",
];

export const REPOSITORY_FILES = [
  ...PUBLIC_PAYLOAD_FILES,
  ...REPOSITORY_TOOLING_FILES,
].sort((left, right) => left.localeCompare(right, "en"));

export const EXPECTED_PAYLOAD_OBJECTS = Object.freeze({
  "app-ads.txt": { bytes: 59, sha256: "64d900de2f034d5459a6a7f339be68f2c7304ea417eadf6f37236cdc5310b49b" },
  ".nojekyll": { bytes: 42, sha256: "00dfd28be377b76a6af53a9e45df109a348f2b9c831c0aabd085ab7ca8587e82" },
  "404.html": { bytes: 2_441, sha256: "3ee6bb1a6d1ea836c69ea48b6487a0fe04832b9fcf9a963c8699ef347eee8a80" },
  "assets/feature-graphic-1024x500.png": { bytes: 45_875, sha256: "c65c332716277644c95fe05f465972a0baa6641d7d4bfbd86bde332ac3168ec9" },
  "assets/icon-512x512.png": { bytes: 7_639, sha256: "7fefdd49d6f32ece075b5cfe69c2ae03ed7899c4e9c8c3a51a267e1299cf15a9" },
  "index.html": { bytes: 9114, sha256: "22c1607e366a71a86ded2315de8d8a5fca26d0129d90a6bd003beb42b5b2de8e" },
  "join.html": { bytes: 8738, sha256: "cf46fa815177e2e498dc3fcd051c40025813786fe7f14eee8286a2f9a32e24ae" },
  "legal.html": { bytes: 3_923, sha256: "caad8e3ad1d5937b73f9737f00233aa1d1799846706d0d821f829cdc3884e1ff" },
  "privacy.html": { bytes: 41646, sha256: "aaedb3e5266b5984429598feb64bc598a069934887b232f28ff3f231d8693a4e" },
  "styles.css": { bytes: 8_662, sha256: "b086fed4d4154ffe549a646fecf77b33c3a5cb8f03f61be7072333472ebb32e2" },
  "support-form.js": { bytes: 5_866, sha256: "662d58c3f666c73d54f0b15241b45199195f15f5fc5d8bae2dde986df5ecab89" },
  "support.html": { bytes: 20617, sha256: "a8f6240a274d5cf1611327d640a911daeaa0684ec9ff9c05b0ce63a0964c02da" },
});

export const DEFAULT_PUBLIC_URL = "https://dearlittleroads.github.io/";
export const FORM_ENDPOINT = "https://forms.formward.eu/f/7da41dbf-4dca-4835-ab97-129857fc20f5";
export const LIVE_FETCH_TIMEOUT_MS = 15_000;

const scriptPath = fileURLToPath(import.meta.url);
const defaultRoot = resolve(dirname(scriptPath), "..");
const normalize = (value) => value.replace(/\r\n/gu, "\n");
const delay = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
const expectedNoJekyll = "# Static site; disable Jekyll processing.\n";
const expectedWorkflow = {
  bytes: 540,
  sha256: "819478a325976edd0506e523d1733486aee3f0d0834c011fb334239cebeeedfb",
};
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function assertExactObject(name, value, expected, label) {
  const observedHash = sha256(value);
  if (value.length !== expected.bytes || observedHash !== expected.sha256) {
    throw new Error(
      `${label}/${name} does not match the approved object: expected ${expected.bytes} bytes / ${expected.sha256}, observed ${value.length} bytes / ${observedHash}.`,
    );
  }
}

function assertExactPayload(payload, label) {
  for (const name of PUBLIC_PAYLOAD_FILES) {
    assertExactObject(name, payload[name], EXPECTED_PAYLOAD_OBJECTS[name], label);
  }
}

function assertExactLocalFileSet(root) {
  if (!existsSync(root) || !lstatSync(root).isDirectory()) {
    throw new Error(`Public-site root is not a directory: ${root}`);
  }

  const allowedFiles = new Set(REPOSITORY_FILES);
  const foundFiles = new Set();
  const allowedDirectoryPrefixes = new Set(
    [...allowedFiles].flatMap((name) => {
      const segments = name.split("/");
      return segments.slice(0, -1).map((_, index) => segments.slice(0, index + 1).join("/"));
    }),
  );

  const visit = (directory, relativeDirectory = "") => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const name = relativeDirectory === "" ? entry.name : `${relativeDirectory}/${entry.name}`;
      if (relativeDirectory === "" && name === ".git") continue;
      if (entry.isSymbolicLink()) throw new Error(`Public-site tree contains a symbolic link: ${name}`);
      if (entry.isDirectory()) {
        if (!allowedDirectoryPrefixes.has(name)) {
          throw new Error(`Public-site tree contains an unexpected directory: ${name}`);
        }
        visit(resolve(directory, entry.name), name);
      } else if (entry.isFile()) {
        if (!allowedFiles.has(name)) throw new Error(`Public-site tree contains an unexpected file: ${name}`);
        foundFiles.add(name);
      } else {
        throw new Error(`Public-site tree contains an unsupported entry: ${name}`);
      }
    }
  };

  visit(root);
  const missingFiles = REPOSITORY_FILES.filter((name) => !foundFiles.has(name));
  if (missingFiles.length > 0) {
    throw new Error(`Public-site tree is missing required files: ${missingFiles.join(", ")}`);
  }
}

function requireFile(root, name, encoding = null) {
  const path = resolve(root, name);
  if (!existsSync(path) || !lstatSync(path).isFile()) throw new Error(`Missing public-site file: ${name}`);
  return encoding === null ? readFileSync(path) : normalize(readFileSync(path, encoding));
}

function parseStartTag(tag) {
  const opening = tag.match(/^<([a-z][^\s/>]*)/iu);
  const tagName = opening?.[1]?.toLowerCase();
  if (!tagName || !opening) throw new Error(`Malformed HTML start tag: ${tag}`);
  const attributes = new Map();
  let index = opening[0].length;
  const end = tag.endsWith("/>") ? tag.length - 2 : tag.length - 1;

  while (index < end) {
    while (index < end && /\s/u.test(tag[index])) index += 1;
    if (index >= end) break;
    const nameMatch = tag.slice(index, end).match(/^[^\s"'<>/=]+/u);
    if (!nameMatch) throw new Error(`Malformed attribute syntax in <${tagName}>.`);
    const originalName = nameMatch[0];
    const name = originalName.toLowerCase();
    if (attributes.has(name)) throw new Error(`<${tagName}> contains duplicate ${name} attributes.`);
    index += originalName.length;
    while (index < end && /\s/u.test(tag[index])) index += 1;

    let value = null;
    if (tag[index] === "=") {
      index += 1;
      while (index < end && /\s/u.test(tag[index])) index += 1;
      const quote = tag[index];
      if (quote !== '"' && quote !== "'") {
        throw new Error(`<${tagName}> ${name} must use a quoted value.`);
      }
      const closingQuote = tag.indexOf(quote, index + 1);
      if (closingQuote < 0 || closingQuote > end) {
        throw new Error(`<${tagName}> ${name} has an unterminated value.`);
      }
      value = tag.slice(index + 1, closingQuote);
      index = closingQuote + 1;
    }
    attributes.set(name, value);
  }

  return { tagName, attributes };
}

function attribute(parsedTag, name) {
  if (!parsedTag.attributes.has(name)) return null;
  const value = parsedTag.attributes.get(name);
  if (value === null) throw new Error(`<${parsedTag.tagName}> ${name} must use a quoted value.`);
  return value;
}

function startTags(html) {
  return [...html.matchAll(/<[a-z][^>]*>/giu)].map((match) => parseStartTag(match[0]));
}

export function assertLinksResolve(root, text) {
  const idsByFile = Object.fromEntries(PUBLIC_HTML_FILES.map((name) => {
    const ids = new Set();
    for (const tag of startTags(text[name])) {
      const id = attribute(tag, "id");
      if (id === null) continue;
      if (ids.has(id)) throw new Error(`${name} contains duplicate id: ${id}`);
      ids.add(id);
    }
    return [name, ids];
  }));

  for (const name of PUBLIC_HTML_FILES) {
    const html = text[name];
    for (const tag of startTags(html).filter(({ tagName }) => tagName === "a")) {
      const href = attribute(tag, "href");
      const target = attribute(tag, "target");
      const rel = attribute(tag, "rel") ?? "";
      if (target?.toLowerCase() === "_blank" && !rel.toLowerCase().split(/\s+/u).includes("noopener")) {
        throw new Error(`${name} has a target=_blank link without rel=noopener.`);
      }
      if (tag.attributes.has("ping")) throw new Error(`${name} contains a forbidden anchor ping.`);
      if (href === null) continue;
      if (/^(?:https?:|mailto:)/iu.test(href)) continue;
      const [targetPathRaw, fragment] = href.split("#", 2);
      const targetPath = targetPathRaw || name;
      if (!PUBLIC_PAYLOAD_FILES.includes(targetPath)) {
        throw new Error(`${name} links outside the public payload: ${href}`);
      }
      if (!existsSync(resolve(root, targetPath))) throw new Error(`${name} links to missing file: ${href}`);
      if (fragment && targetPath.endsWith(".html") && !idsByFile[targetPath]?.has(fragment)) {
        throw new Error(`${name} links to missing fragment: ${href}`);
      }
    }
  }
}

export function assertRequestSurface(text) {
  const allHtml = PUBLIC_HTML_FILES.map((name) => text[name]).join("\n");
  if (/<!--|<(?:base|iframe|frame|object|embed|audio|video|source|track|style|template|image|use|foreignobject|math)\b/iu.test(allHtml)) {
    throw new Error("The public pages contain an unsupported active, embedded, or request-bearing element.");
  }

  const tags = startTags(allHtml);
  for (const tag of tags) {
    for (const name of tag.attributes.keys()) {
      if (/^on/iu.test(name)) throw new Error(`<${tag.tagName}> contains an inline event handler.`);
    }
    if (tag.attributes.has("formaction")) throw new Error(`<${tag.tagName}> contains a forbidden formaction override.`);
    if (tag.attributes.has("style")) throw new Error(`<${tag.tagName}> contains a forbidden inline style.`);
    for (const name of ["srcset", "poster", "background"]) {
      if (tag.attributes.has(name)) throw new Error(`<${tag.tagName}> contains unsupported request-bearing ${name}.`);
    }
  }

  const forms = tags.filter(({ tagName }) => tagName === "form");
  if (forms.length !== 2) throw new Error(`Expected exactly two localized forms, found ${forms.length}.`);
  for (const form of forms) {
    if (attribute(form, "method")?.toUpperCase() !== "POST" || attribute(form, "action") !== FORM_ENDPOINT) {
      throw new Error("A support form does not use the approved POST endpoint.");
    }
    if (attribute(form, "target") !== null) throw new Error("A support form contains an unexpected target.");
  }

  const scripts = tags.filter(({ tagName }) => tagName === "script");
  if (scripts.length !== 1 || attribute(scripts[0], "src") !== "support-form.js" || attribute(scripts[0], "type") !== "module") {
    throw new Error("The public pages do not contain exactly the approved local module script.");
  }

  for (const tag of tags.filter(({ attributes }) => attributes.has("src"))) {
    const source = attribute(tag, "src");
    if (!["img", "input", "script"].includes(tag.tagName) || !PUBLIC_PAYLOAD_FILES.includes(source)) {
      throw new Error(`Unexpected request-bearing source on <${tag.tagName}>: ${source}`);
    }
  }
  for (const tag of tags.filter(({ tagName }) => tagName === "link")) {
    const href = attribute(tag, "href");
    const rel = (attribute(tag, "rel") ?? "").toLowerCase().split(/\s+/u).filter(Boolean);
    if (href === null) throw new Error("A link element is missing href.");
    if (rel.length === 1 && rel[0] === "canonical") {
      let canonical;
      try {
        canonical = new URL(href);
      } catch {
        throw new Error(`Invalid canonical URL: ${href}`);
      }
      if (
        canonical.origin !== new URL(DEFAULT_PUBLIC_URL).origin ||
        canonical.username ||
        canonical.password ||
        canonical.href.includes("?") ||
        canonical.href.includes("#")
      ) {
        throw new Error(`Unexpected canonical URL: ${href}`);
      }
      continue;
    }
    if (rel.length === 0 || !rel.every((value) => value === "stylesheet" || value === "icon") || !PUBLIC_PAYLOAD_FILES.includes(href)) {
      throw new Error(`Unexpected request-bearing link: ${href}`);
    }
  }

  for (const tag of tags.filter(({ tagName }) => tagName === "meta")) {
    if (attribute(tag, "http-equiv")?.toLowerCase() === "refresh") {
      throw new Error("The public pages contain a meta refresh.");
    }
  }

  if (/@import\b|url\s*\(/iu.test(text["styles.css"])) {
    throw new Error("styles.css contains a forbidden import or URL request.");
  }
}

export function assertRequiredCopyMarkers(text) {
  const requiredMarkers = {
    "index.html": [
      "The following applies when Settings shows version 1.0.1 or 1.0.2.",
      "This page does not announce that the update is available",
      "Die folgenden Angaben gelten, wenn in den Einstellungen Version 1.0.1 oder 1.0.2 steht.",
      "Diese Seite kündigt keine Verfügbarkeit des Updates an",
      "<strong>Version 1.0.0:</strong> 63 campaign routes",
      "<strong>Version 1.0.0:</strong> 63 Kampagnenrouten",
      "All 100 campaign routes are free to reach as you progress",
      "No ads, in-app purchases, or subscriptions in this version",
      "Alle 100 Kampagnenrouten sind im Spielverlauf kostenlos erreichbar",
      "Keine Werbung, In-App-Käufe oder Abos in dieser Fassung",
    ],
    "join.html": [
      "Older test builds distributed through Google Play may still show optional diagnostics.",
      "Versions 0.13.6 and 0.13.7 use their older control",
      "In version 0.13.6, open About; in version 0.13.7, open Settings; then switch Beta diagnostics off.",
      "Ältere über Google Play verteilte Testfassungen können noch einen optionalen Diagnoseschalter anzeigen.",
      "Die Versionen 0.13.6 und 0.13.7 verwenden diesen älteren Schalter",
      "Öffne in Version 0.13.6 „Über“ beziehungsweise in Version 0.13.7 „Einstellungen“ und schalte die Beta-Diagnose aus.",
    ],
    "privacy.html": [
      "<strong>Effective:</strong> 4 October 2026",
      "<strong>Gültig ab:</strong> 4. Oktober 2026",
      "<strong>Internal-test addendum published:</strong> 17 September 2026",
      "<strong>Ergänzung zum internen Test veröffentlicht:</strong> 17. September 2026",
      '<h2 id="internal-ad-test">Optional internal consent and demo-ad test</h2>',
      '<h2 id="interner-werbetest">Freiwilliger interner Test der Einwilligungsabfrage und von Demoanzeigen</h2>',
      "The initial diagnostic host is UMP-only: it contains no Google advertising SDK dependency or demo-ad implementation.",
      "Die erste Diagnose-App verwendet ausschließlich UMP; sie enthält weder eine Abhängigkeit von Googles Werbe-SDK noch eine Implementierung von Demoanzeigen.",
      "Closing does not cancel already-started SDK work, in-flight network requests or processing of data already received by Google.",
      "Das Schließen bricht bereits gestartete SDK-Abläufe, laufende Netzwerkanfragen oder die Verarbeitung schon bei Google eingegangener Daten nicht ab.",
      "Version 1.0.1 or 1.0.2 does not collect or send analytics or diagnostic events.",
      "Version 1.0.1 oder 1.0.2 erfasst und sendet keine Analyse- oder Diagnoseereignisse.",
      "Older invitation-only test versions distributed through Google Play—including 0.13.6 and 0.13.7—",
      "in version 0.13.6, open About; in version 0.13.7, open Settings; then switch Beta diagnostics off.",
      "Die älteren, über Google Play nur an eingeladene Testpersonen verteilten Testfassungen – darunter die Versionen 0.13.6 und 0.13.7 –",
      "Öffne in Version 0.13.6 „Über“ beziehungsweise in Version 0.13.7 „Einstellungen“ und schalte die Beta-Diagnose aus.",
    ],
    "support.html": [
      "The free version does not check or restore purchase ownership, including after a fresh installation.",
      "Existing local access records are left untouched.",
      "Die kostenlose Fassung prüft Kaufberechtigungen nicht und stellt sie auch nach einer Neuinstallation nicht wieder her.",
      "Vorhandene lokale Zugriffsdatensätze bleiben unangetastet.",
      FORM_ENDPOINT,
      "Send message",
      "Nachricht senden",
      "support-form.js",
      "Older invitation-only test versions distributed through Google Play—including 0.13.6 and 0.13.7—",
      "in version 0.13.6, open About; in version 0.13.7, open Settings; then switch Beta diagnostics off.",
      "Die älteren, über Google Play nur an eingeladene Testpersonen verteilten Testfassungen – darunter die Versionen 0.13.6 und 0.13.7 –",
      "Öffne in Version 0.13.6 „Über“ beziehungsweise in Version 0.13.7 „Einstellungen“ und schalte die Beta-Diagnose aus.",
    ],
    "support-form.js": [FORM_ENDPOINT, "AbortController", "application/json", "response.ok"],
  };
  for (const [name, markers] of Object.entries(requiredMarkers)) {
    for (const marker of markers) {
      if (!text[name].includes(marker)) throw new Error(`${name} is missing approved marker: ${marker}`);
    }
  }
}

export function readAndAssertLocalContract(root = defaultRoot) {
  assertExactLocalFileSet(root);

  const payload = Object.fromEntries(PUBLIC_PAYLOAD_FILES.map((name) => [name, requireFile(root, name)]));
  assertExactPayload(payload, "local");
  if (!payload[".nojekyll"].equals(Buffer.from(expectedNoJekyll, "utf8"))) {
    throw new Error(".nojekyll contains an unexpected value.");
  }
  const workflow = requireFile(root, ".github/workflows/verify-site.yml");
  assertExactObject(".github/workflows/verify-site.yml", workflow, expectedWorkflow, "local");
  const packagedVerifier = requireFile(root, "scripts/verify-site.mjs");
  if (!packagedVerifier.equals(readFileSync(scriptPath))) {
    throw new Error("local/scripts/verify-site.mjs does not match the executing reviewed verifier.");
  }

  const text = Object.fromEntries(
    PUBLIC_TEXT_FILES.map((name) => [name, normalize(payload[name].toString("utf8"))]),
  );
  const binary = Object.fromEntries(PUBLIC_BINARY_FILES.map((name) => [name, payload[name]]));

  assertRequiredCopyMarkers(text);
  for (const name of PUBLIC_HTML_FILES) {
    if (!/href=["']legal\.html(?:#[^"']*)?["']/iu.test(text[name])) {
      throw new Error(`${name} does not link to the legal notice.`);
    }
  }
  const combined = PUBLIC_TEXT_FILES.map((name) => text[name]).join("\n");
  if (/22 July 2026|22\. Juli 2026|Google Group|Google-Gruppe|groups\.google\.com|self-join|direktem Beitritt/iu.test(combined)) {
    throw new Error("The site contains an invalidated date or retired closed-beta copy.");
  }
  if (/googletagmanager|google-analytics|posthog\.com|plausible\.io|segment\.com|mixpanel\.com/iu.test(combined)) {
    throw new Error("The site contains an analytics or tracker endpoint.");
  }

  assertLinksResolve(root, text);
  assertRequestSurface(text);
  return { payload, text, binary };
}

export function parseArguments(argv) {
  const result = {
    root: defaultRoot,
    live: false,
    baseUrl: DEFAULT_PUBLIC_URL,
    attempts: 1,
    delayMs: 10_000,
  };
  const seen = new Set();
  const readValue = (index, name) => {
    const value = argv[index + 1];
    if (value === undefined || value === "" || value.startsWith("--")) {
      throw new Error(`${name} requires a value.`);
    }
    return value;
  };
  const readInteger = (value, name, minimum, maximum) => {
    if (!/^(?:0|[1-9]\d*)$/u.test(value)) {
      throw new Error(`${name} must be an integer from ${minimum} to ${maximum}.`);
    }
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
      throw new Error(`${name} must be an integer from ${minimum} to ${maximum}.`);
    }
    return parsed;
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!["--root", "--live", "--attempts", "--delay-ms"].includes(argument)) {
      throw new Error(`Unknown option: ${argument}`);
    }
    if (seen.has(argument)) throw new Error(`Duplicate option: ${argument}`);
    seen.add(argument);

    if (argument === "--live") {
      result.live = true;
    } else {
      const value = readValue(index, argument);
      index += 1;
      if (argument === "--root") result.root = resolve(value);
      else if (argument === "--attempts") result.attempts = readInteger(value, argument, 1, 120);
      else result.delayMs = readInteger(value, argument, 0, 60_000);
    }
  }
  return result;
}

export async function fetchLive(baseUrl, attempt, dependencies = {}) {
  if (baseUrl !== DEFAULT_PUBLIC_URL) {
    throw new Error(`Live verification is restricted to ${DEFAULT_PUBLIC_URL}`);
  }
  const fetchImplementation = dependencies.fetchImplementation ?? globalThis.fetch;
  const now = dependencies.now ?? Date.now;
  const fetchTimeoutMs = dependencies.fetchTimeoutMs ?? LIVE_FETCH_TIMEOUT_MS;
  if (typeof fetchImplementation !== "function") throw new Error("A Fetch API implementation is required.");
  if (!Number.isSafeInteger(fetchTimeoutMs) || fetchTimeoutMs < 1 || fetchTimeoutMs > 60_000) {
    throw new Error("Live fetch timeout must be an integer from 1 to 60000 milliseconds.");
  }
  const cacheBuster = `${now()}-${attempt}`;
  const controller = new AbortController();
  let timeoutId;

  const fetchAll = async () => {
    const fetchPath = async (name) => {
      const url = new URL(name === "" ? "./" : name, baseUrl);
      url.searchParams.set("verify", cacheBuster);
      const response = await fetchImplementation(url, {
        cache: "no-store",
        headers: { "cache-control": "no-cache, no-store", pragma: "no-cache" },
        redirect: "error",
        signal: controller.signal,
      });
      if (response.redirected) throw new Error(`${name || "/"} unexpectedly redirected.`);
      if (!response.ok) throw new Error(`${name || "/"} returned HTTP ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    };

    const payloadEntries = await Promise.all(PUBLIC_PAYLOAD_FILES.map(async (name) => [name, await fetchPath(name)]));
    const payload = Object.fromEntries(payloadEntries);
    const text = Object.fromEntries(
      PUBLIC_TEXT_FILES.map((name) => [name, normalize(payload[name].toString("utf8"))]),
    );
    const binary = Object.fromEntries(PUBLIC_BINARY_FILES.map((name) => [name, payload[name]]));
    const root = await fetchPath("");
    return { payload, text, binary, root };
  };

  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Live fetch attempt timed out after ${fetchTimeoutMs} milliseconds.`));
      controller.abort();
    }, fetchTimeoutMs);
  });

  try {
    return await Promise.race([fetchAll(), timeout]);
  } finally {
    clearTimeout(timeoutId);
    controller.abort();
  }
}

export function assertLiveMatchesLocal(local, live) {
  assertExactPayload(live.payload, "live");
  for (const name of PUBLIC_PAYLOAD_FILES) {
    if (!live.payload[name].equals(local.payload[name])) {
      throw new Error(`live/${name} is not byte-equivalent to the approved local object.`);
    }
  }
  if (!live.root.equals(local.payload["index.html"])) {
    throw new Error("live root is not byte-equivalent to the approved index.html object.");
  }
}

export async function run(argv = process.argv.slice(2), dependencies = {}) {
  const options = parseArguments(argv);
  const local = readAndAssertLocalContract(options.root);
  if (!options.live) {
    (dependencies.output ?? process.stdout).write("Local public-site contract passed.\n");
    return;
  }

  let lastError = null;
  const delayImplementation = dependencies.delayImplementation ?? delay;
  if (typeof delayImplementation !== "function") throw new Error("A delay implementation is required.");
  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    try {
      const live = await fetchLive(options.baseUrl, attempt, dependencies);
      assertRequestSurface(live.text);
      assertLiveMatchesLocal(local, live);
      (dependencies.output ?? process.stdout).write(
        `Live public-site contract passed for ${DEFAULT_PUBLIC_URL} on attempt ${attempt}.\n`,
      );
      return;
    } catch (error) {
      lastError = error;
      if (attempt < options.attempts) await delayImplementation(options.delayMs);
    }
  }
  throw new Error(`Live public-site verification failed: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  run().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
