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
    if (!res.ok) {
      console.warn(`[og-cards] non-OK response (${res.status}) for ${url}`);
      return null;
    }
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) return null;
    const html = (await res.text()).slice(0, MAX_HTML);

    // og: tags can appear as property-then-content or content-then-property
    const pick = pattern => {
      const match = html.match(pattern);
      if (!match) return null;
      return decodeEntities(match[1] !== undefined ? match[1] : match[2]);
    };
    const ogTitle =
      pick(/<meta[^>]+property=["']og:title["'][^>]+content=(?:"([^"]*)"|'([^']*)')/i) ||
      pick(/<meta[^>]+content=(?:"([^"]*)"|'([^']*)')[^>]+property=["']og:title["']/i);
    const title =
      trimOrNull(ogTitle) ||
      trimOrNull(pick(/<title[^>]*>([^<]*)<\/title>/i));
    if (!title) return null;

    const description = trimOrNull(
      pick(/<meta[^>]+property=["']og:description["'][^>]+content=(?:"([^"]*)"|'([^']*)')/i) ||
        pick(/<meta[^>]+content=(?:"([^"]*)"|'([^']*)')[^>]+property=["']og:description["']/i)
    );

    let image = trimOrNull(
      pick(/<meta[^>]+property=["']og:image["'][^>]+content=(?:"([^"]*)"|'([^']*)')/i) ||
        pick(/<meta[^>]+content=(?:"([^"]*)"|'([^']*)')[^>]+property=["']og:image["']/i)
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
    console.warn(`[og-cards] fetch failed for ${url}:`, (e && e.message) || e);
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

const isExternalLink = node =>
  node.type === "link" && /^https?:\/\//i.test(node.url || "");

function isCardCandidateParagraph(node, isRoot) {
  if (
    !node ||
    node.type !== "paragraph" ||
    !Array.isArray(node.children) ||
    node.children.length === 0
  ) {
    return false;
  }
  const links = node.children.filter(isExternalLink);
  if (links.length !== 1) return false;
  const rest = node.children.filter(c => !isExternalLink(c));
  if (rest.length === 0) return true; // standalone: exactly one external link
  // labeled form: root-level paragraphs only (never blockquotes or list
  // items, so attribution lines like `> 링크:` / `- 출처:` stay plain), a
  // short plain-text label ending in a colon with the link last, and no
  // markdown-artifact prefixes (`> `, `- `, `* `, `+ `, `#`).
  if (!isRoot) return false;
  if (node.children[node.children.length - 1] !== links[0]) return false;
  const label = rest
    .map(c => (c.type === "text" ? c.value : ""))
    .join("")
    .trim();
  return (
    rest.every(c => c.type === "text") &&
    label.length > 0 &&
    label.length <= 40 &&
    /[:：]$/.test(label) &&
    !/^[>\-*+#]/.test(label)
  );
}

module.exports = async ({ markdownAST, markdownNode }) => {
  const targets = [];
  const walk = (node, isRoot) => {
    if (!Array.isArray(node.children)) return;
    node.children.forEach((child, index) => {
      if (isCardCandidateParagraph(child, isRoot)) {
        targets.push({ parent: node, index, paragraph: child });
      } else {
        walk(child, false);
      }
    });
  };
  walk(markdownAST, true);

  for (const { parent, index, paragraph } of targets) {
    const url = paragraph.children.find(isExternalLink).url;
    const data = await getOg(url);
    if (!data) continue; // graceful fallback: leave the original link untouched

    const thumbnail = data.image
      ? escapeHtml(data.image)
      : escapeHtml(
          `https://www.google.com/s2/favicons?domain=${encodeURIComponent(
            data.host
          )}&sz=128`
        );
    const faviconSrc = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(
      data.host
    )}&sz=128`;
    const image = `<img class="og-card-image" src="${thumbnail}" alt="" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${faviconSrc}';" />`;
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
