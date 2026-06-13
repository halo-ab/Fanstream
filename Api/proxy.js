const https = require("https");
const http = require("http");
const { URL } = require("url");

function fetchUrl(targetUrl, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const lib = targetUrl.startsWith("https") ? https : http;
    const req = lib.get(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "*/*",
        "Accept-Encoding": "identity",
        ...extraHeaders,
      },
    }, resolve);
    req.on("error", reject);
  });
}

function readBody(res) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    res.on("data", c => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    res.on("end", () => resolve(Buffer.concat(chunks)));
    res.on("error", reject);
  });
}

function resolveUrl(base, relative) {
  if (/^https?:\/\//i.test(relative)) return relative;
  const b = new URL(base);
  if (relative.startsWith("/")) return `${b.protocol}//${b.host}${relative}`;
  const dir = b.pathname.substring(0, b.pathname.lastIndexOf("/") + 1);
  return `${b.protocol}//${b.host}${dir}${relative}`;
}

function rewriteM3u8(text, baseUrl, headers, proxyBase) {
  const hQS = encodeURIComponent(JSON.stringify(headers));
  return text
    .split("\n")
    .map(line => {
      const t = line.trim();
      if (!t || t.startsWith("#")) return line;
      const abs = resolveUrl(baseUrl, t);
      return `${proxyBase}?url=${encodeURIComponent(abs)}&headers=${hQS}`;
    })
    .join("\n");
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  const { url: targetUrl, headers: headersParam } = req.query;

  if (!targetUrl) {
    res.status(400).send("Missing url param");
    return;
  }

  let extraHeaders = {};
  try {
    extraHeaders = JSON.parse(decodeURIComponent(headersParam || "{}"));
  } catch (_) {}

  try {
    const upstream = await fetchUrl(targetUrl, extraHeaders);
    const contentType = upstream.headers["content-type"] || "";
    const isM3u8 =
      contentType.includes("mpegurl") ||
      contentType.includes("x-mpegurl") ||
      targetUrl.includes(".m3u8");

    res.setHeader("Access-Control-Allow-Origin", "*");

    if (isM3u8) {
      const body = await readBody(upstream);
      const text = body.toString("utf8");
      // Build proxy base URL from the incoming request
      const proto = req.headers["x-forwarded-proto"] || "https";
      const host = req.headers["x-forwarded-host"] || req.headers.host;
      const proxyBase = `${proto}://${host}/api/proxy`;
      const rewritten = rewriteM3u8(text, targetUrl, extraHeaders, proxyBase);
      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      res.status(200).send(rewritten);
    } else {
      // Binary passthrough for TS segments, encryption keys, etc.
      res.setHeader("Content-Type", contentType || "application/octet-stream");
      if (upstream.headers["content-length"]) {
        res.setHeader("Content-Length", upstream.headers["content-length"]);
      }
      const body = await readBody(upstream);
      res.status(upstream.statusCode || 200).send(body);
    }
  } catch (e) {
    res.status(502).send("Proxy error: " + e.message);
  }
};
