const https = require("https");
const http = require("http");

const M3U_URL = "https://github.com/drmlive/fancode-live-events/blob/main/fancode.m3u";

function fetchUrl(targetUrl, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const lib = targetUrl.startsWith("https") ? https : http;
    const req = lib.get(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "*/*",
        ...extraHeaders,
      },
    }, resolve);
    req.on("error", reject);
  });
}

function readBody(res) {
  return new Promise((resolve, reject) => {
    let data = "";
    res.on("data", c => (data += c));
    res.on("end", () => resolve(data));
    res.on("error", reject);
  });
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  try {
    const upstream = await fetchUrl(M3U_URL);
    const body = await readBody(upstream);
    res.setHeader("Content-Type", "application/x-mpegurl");
    res.status(200).send(body);
  } catch (e) {
    res.status(502).send("Failed to fetch playlist: " + e.message);
  }
};
