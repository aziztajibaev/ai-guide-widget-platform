import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const adminDataDir = path.join(root, "apps", "admin", "data");
const seedStorePath = path.join(adminDataDir, "store.json");
const localStorePath = path.join(adminDataDir, "store.local.json");
const snapshotPath = path.join(adminDataDir, "tilda-docs.snapshot.json");

const defaultSeeds = ["https://smartup-doc.tilda.ws/"];
const defaultAllowedHosts = new Set(["smartup-doc.tilda.ws", "smartup-doc-uz.tilda.ws"]);
const maxDocumentChars = 7200;
const requestTimeoutMs = Number(process.env.TILDA_IMPORT_TIMEOUT_MS || 20000);

function parseArgs(argv) {
  const args = {
    seeds: [],
    projectId: "demo-project",
    maxPages: Number(process.env.TILDA_IMPORT_MAX_PAGES || 400),
    dryRun: false,
    merge: false
  };

  for (const arg of argv) {
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--merge") args.merge = true;
    else if (arg.startsWith("--project=")) args.projectId = arg.slice("--project=".length);
    else if (arg.startsWith("--max-pages=")) args.maxPages = Number(arg.slice("--max-pages=".length));
    else if (arg.startsWith("--seed=")) args.seeds.push(arg.slice("--seed=".length));
  }

  if (!args.seeds.length) args.seeds = defaultSeeds;
  if (!Number.isFinite(args.maxPages) || args.maxPages < 1) args.maxPages = 400;
  return args;
}

function normalizeUrl(value, baseUrl) {
  try {
    const url = new URL(value, baseUrl);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    if (defaultAllowedHosts.has(url.hostname)) url.protocol = "https:";
    url.hash = "";
    url.search = "";
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString();
  } catch {
    return null;
  }
}

function isStaticUrl(url) {
  return /\.(?:png|jpe?g|gif|webp|svg|ico|css|js|pdf|zip|mp4|webm|mp3|woff2?|ttf|eot)$/i.test(url.pathname);
}

function shouldCrawl(url, allowedHosts) {
  if (!allowedHosts.has(url.hostname)) return false;
  if (isStaticUrl(url)) return false;
  if (url.pathname.startsWith("/tilda")) return false;
  if (url.hostname === "smartup-doc-uz.tilda.ws") return false;
  if (url.pathname.startsWith("/uz/")) return false;
  if (url.pathname.startsWith("/markirovka")) return false;
  if (url.pathname === "/ru/markirovka" || url.pathname === "/ru/relizi") return false;
  return true;
}

function shouldImport(url) {
  if (url.pathname === "/" || url.pathname === "/ru" || url.pathname === "/uz") return false;
  return url.pathname.split("/").filter(Boolean).length >= 2;
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number.parseInt(number, 10)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function stripTags(html) {
  return decodeEntities(
    String(html || "")
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<svg\b[\s\S]*?<\/svg>/gi, " ")
      .replace(/<(?:br|p|div|section|article|li|h[1-6]|tr|td|th|blockquote)\b[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  );
}

function cleanTextLine(line) {
  return decodeEntities(line)
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function htmlToLines(html) {
  return stripTags(html)
    .split(/\r?\n+/)
    .map(cleanTextLine)
    .filter(Boolean);
}

function metaContent(html, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const propertyPattern = new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, "i");
  const contentPattern = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, "i");
  return decodeEntities(html.match(propertyPattern)?.[1] || html.match(contentPattern)?.[1] || "").trim();
}

function extractTitle(html, url) {
  const ogTitle = metaContent(html, "og:title");
  if (ogTitle) return ogTitle;
  const title = decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").trim();
  if (title) return title.replace(/\s*\|\s*.*$/, "").trim();
  return decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() || url.hostname);
}

function extractLinks(html, baseUrl, allowedHosts) {
  const links = [];
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)) {
    const normalized = normalizeUrl(match[1], baseUrl);
    if (!normalized) continue;
    const url = new URL(normalized);
    if (shouldCrawl(url, allowedHosts)) links.push(url.toString());
  }
  return links;
}

function lineKey(line) {
  return line.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function isNoiseLine(line, navNoise, title) {
  const key = lineKey(line);
  if (!key || key.length < 2) return true;
  if (line.length > 520) return true;
  if (line === title) return false;
  if (navNoise.has(key)) return true;
  if (/^(smartup|ru|o'z|oz|uz|p|pr|prp|п|пр|прп)$/i.test(line)) return true;
  if (/^(связаться с поддержкой|справочный центр|быстрый старт-главное)$/i.test(line)) return true;
  if (/^\+?\d[\d\s()+-]{7,}$/.test(line)) return true;
  if (/^(copyright|all rights reserved)/i.test(line)) return true;
  if (/https?:\/\//i.test(line) && line.length > 120) return true;
  if (/[{};]{4,}/.test(line)) return true;
  if (/(#rec\d+|tilda|background-color|font-family|transition|data-tilda)/i.test(line)) return true;
  return false;
}

function extractArticleContent(html, pageUrl, navNoise) {
  const url = new URL(pageUrl);
  const title = extractTitle(html, url);
  const description = metaContent(html, "description") || metaContent(html, "og:description");
  const rawLines = htmlToLines(html);
  const seen = new Set();
  const lines = [];

  for (const line of rawLines) {
    if (isNoiseLine(line, navNoise, title)) continue;
    const key = lineKey(line);
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(line);
  }

  const titleIndex = lines.findIndex((line) => lineKey(line) === lineKey(title));
  const articleLines = titleIndex >= 0 ? lines.slice(titleIndex + 1) : lines;
  const contentLines = [
    `Source URL: ${pageUrl}`,
    `Title: ${title}`,
    ...articleLines
  ].filter(Boolean);

  return {
    title,
    description,
    content: contentLines.join("\n").trim()
  };
}

function chunkText(text, maxChars) {
  const paragraphs = String(text || "").split(/\n{1,}/);
  const chunks = [];
  let current = "";

  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) continue;
    const next = current ? `${current}\n${paragraph}` : paragraph;
    if (next.length > maxChars && current) {
      chunks.push(current);
      current = paragraph;
    } else {
      current = next;
    }
  }

  if (current) chunks.push(current);
  return chunks.length ? chunks : [String(text || "").slice(0, maxChars)];
}

function stableHash(input) {
  let hash = 5381;
  for (let index = 0; index < input.length; index += 1) {
    hash = ((hash << 5) + hash + input.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}

function tagsForUrl(url, title) {
  const pathTags = url.pathname
    .split("/")
    .filter(Boolean)
    .map((part) => decodeURIComponent(part).replace(/[-_]+/g, " "))
    .filter((part) => part.length > 1);
  const language = pathTags.includes("ru") || url.hostname.endsWith(".ws") ? pathTags[0] : "";
  return Array.from(new Set(["tilda", "smartup-doc", language, ...pathTags, ...title.split(/\s+/).slice(0, 4)].filter(Boolean)));
}

async function fetchHtml(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "SmartupAIGuideImporter/1.0",
        accept: "text/html,application/xhtml+xml"
      }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) throw new Error(`Unsupported content type: ${contentType}`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function readStore() {
  const source = existsSync(localStorePath) ? localStorePath : seedStorePath;
  return JSON.parse(await readFile(source, "utf8"));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const allowedHosts = new Set(defaultAllowedHosts);
  for (const seed of args.seeds) {
    const url = new URL(seed);
    allowedHosts.add(url.hostname);
  }

  const store = await readStore();
  const project = store.projects.find((item) => item.publicId === args.projectId || item.id === args.projectId);
  if (!project) throw new Error(`Project not found: ${args.projectId}`);

  const queue = args.seeds.map((seed) => normalizeUrl(seed, seed)).filter(Boolean);
  const queued = new Set(queue);
  const visited = new Set();
  const importedPages = [];
  const failedPages = [];
  let navNoise = new Set();

  while (queue.length && visited.size < args.maxPages) {
    const current = queue.shift();
    if (!current || visited.has(current)) continue;
    visited.add(current);

    try {
      const html = await fetchHtml(current);
      const links = extractLinks(html, current, allowedHosts);
      for (const link of links) {
        if (!queued.has(link) && visited.size + queue.length < args.maxPages * 3) {
          queued.add(link);
          queue.push(link);
        }
      }

      const currentUrl = new URL(current);
      if (!navNoise.size && currentUrl.pathname === "/") {
        navNoise = new Set(htmlToLines(html).map(lineKey).filter((line) => line.length >= 2 && line.length <= 160));
      }

      if (!shouldImport(currentUrl)) continue;
      const article = extractArticleContent(html, current, navNoise);
      if (article.content.length < 300) continue;
      importedPages.push({ url: current, ...article });
      process.stdout.write(`Imported ${importedPages.length}: ${article.title}\n`);
    } catch (error) {
      failedPages.push({ url: current, error: error instanceof Error ? error.message : String(error) });
      process.stderr.write(`Failed: ${current} (${failedPages.at(-1).error})\n`);
    }
  }

  const now = new Date().toISOString();
  const documents = [];
  for (const page of importedPages) {
    const url = new URL(page.url);
    const chunks = chunkText(page.content, maxDocumentChars);
    const baseId = `doc_tilda_${stableHash(page.url)}`;
    for (let index = 0; index < chunks.length; index += 1) {
      documents.push({
        id: chunks.length === 1 ? baseId : `${baseId}_${index + 1}`,
        projectId: project.id,
        title: chunks.length === 1 ? page.title : `${page.title} (${index + 1})`,
        content: chunks[index],
        tags: tagsForUrl(url, page.title),
        enabled: true,
        createdAt: now,
        updatedAt: now
      });
    }
  }

  const report = {
    projectId: project.publicId,
    seeds: args.seeds,
    visited: visited.size,
    pages: importedPages.length,
    documents: documents.length,
    failed: failedPages.length,
    failedPages,
    importedUrls: importedPages.map((page) => page.url),
    importedAt: now
  };

  if (args.dryRun) {
    process.stdout.write(JSON.stringify(report, null, 2));
    return;
  }

  const previousById = new Map((store.documents || []).map((document) => [document.id, document]));
  for (const document of documents) {
    const previous = previousById.get(document.id);
    if (previous?.createdAt) document.createdAt = previous.createdAt;
  }

  if (args.merge) {
    const incomingIds = new Set(documents.map((document) => document.id));
    store.documents = [
      ...(store.documents || []).filter((document) => !incomingIds.has(document.id)),
      ...documents
    ];
  } else {
    store.documents = [
      ...(store.documents || []).filter((document) => document.projectId !== project.id),
      ...documents
    ];
  }

  await mkdir(adminDataDir, { recursive: true });
  await writeFile(localStorePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  await writeFile(snapshotPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exitCode = 1;
});
