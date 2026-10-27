const fs = require("fs");
const path = require("path");

const CACHE_FILE = path.join(__dirname, "og-cache.json");
const TIMEOUT_MS = 3000;
const UA =
  "Mozilla/5.0 (compatible; og-preview-cards/1.0; +https://rapsealk.github.io)";
const MAX_HTML = 300000;

let cache = {};
try {
  cache = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
} catch (e) {
  cache = {};
}

// Serialized writes: Gatsby may transform files concurrently within one process.
let writeChain = Promise.resolve();
function persist() {
  writeChain = writeChain
    .then(() =>
      fs.promises.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2) + "\n")
    )
    .catch(() => {});
  return writeChain;
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function decodeEntities(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x0?27;/gi, "'");
}

function trimOrNull(value) {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

async function fetchOg(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": UA, Accept: "text/html" },
      redirect: "follow",
    });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) return null;
    const html = (await res.text()).slice(0, MAX_HTML);

    // og: tags can appear as property-then-content or content-then-property
    const pick = pattern => {
      const match = html.match(pattern);
      return match ? decodeEntities(match[1]) : null;
    };
    const ogTitle =
      pick(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i) ||
      pick(/<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:title["']/i);
    const title =
      trimOrNull(ogTitle) ||
      trimOrNull(pick(/<title[^>]*>([^<]*)<\/title>/i));
    if (!title) return null;

    const description = trimOrNull(
      pick(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i) ||
        pick(/<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:description["']/i)
    );

    let image = trimOrNull(
      pick(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*)["']/i) ||
        pick(/<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:image["']/i)
    );
    if (image) {
      try {
        image = new URL(image, res.url).href;
      } catch (e) {
        image = null;
      }
    }

    return { title, description, image, host: new URL(url).host };
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function getOg(url) {
  if (!(url in cache)) {
    // failures are cached too, so blocked sites are not re-fetched every build
    cache[url] = await fetchOg(url);
    persist();
  }
  return cache[url];
}

function isStandaloneLinkParagraph(node) {
  if (
    !node ||
    node.type !== "paragraph" ||
    !Array.isArray(node.children) ||
    node.children.length !== 1
  ) {
    return false;
  }
  const child = node.children[0];
  return child.type === "link" && /^https?:\/\//i.test(child.url || "");
}

module.exports = async ({ markdownAST, markdownNode }) => {
  const targets = [];
  const walk = node => {
    if (!Array.isArray(node.children)) return;
    node.children.forEach((child, index) => {
      if (isStandaloneLinkParagraph(child)) {
        targets.push({ parent: node, index, paragraph: child });
      } else {
        walk(child);
      }
    });
  };
  walk(markdownAST);

  for (const { parent, index, paragraph } of targets) {
    const url = paragraph.children[0].url;
    const data = await getOg(url);
    if (!data) continue; // graceful fallback: leave the original link untouched

    const image = data.image
      ? `<img class="og-card-image" src="${escapeHtml(
          data.image
        )}" alt="" loading="lazy" decoding="async" />`
      : "";
    const description = data.description
      ? `<span class="og-card-desc">${escapeHtml(data.description)}</span>`
      : "";
    parent.children[index] = {
      type: "html",
      value:
        `<a class="og-card" href="${escapeHtml(
          url
        )}" target="_blank" rel="noopener noreferrer">` +
        `<span class="og-card-body">` +
        `<span class="og-card-title">${escapeHtml(data.title)}</span>` +
        description +
        `<span class="og-card-host">${escapeHtml(data.host)}</span>` +
        `</span>` +
        image +
        `</a>`,
    };
  }
};
