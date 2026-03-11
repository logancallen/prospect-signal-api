const http = require("http");
const https = require("https");

const PORT = process.env.PORT || 3000;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || process.env.PROSPECT_ANTHROPIC_KEY;

const ALLOWED_ORIGINS = [
  "https://prospect-signal.netlify.app",
  "https://heroic-salmiakki-0cce69.netlify.app",
  "http://localhost:3000",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
];

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

const server = http.createServer((req, res) => {
  const origin = req.headers.origin || "";
  const cors = corsHeaders(origin);

  // Health check
  if (req.method === "GET" && req.url === "/") {
    res.writeHead(200, { ...cors, "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", service: "prospect-signal-api" }));
    return;
  }

  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, cors);
    res.end();
    return;
  }

  // AI endpoint
  if (req.method === "POST" && req.url === "/api/ai") {
    if (!ANTHROPIC_KEY) {
      res.writeHead(500, { ...cors, "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }));
      return;
    }

    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const postData = Buffer.from(body, "utf-8");

      const options = {
        hostname: "api.anthropic.com",
        path: "/v1/messages",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Length": postData.length,
        },
      };

      const proxyReq = https.request(options, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, {
          ...cors,
          "Content-Type": "application/json",
        });
        proxyRes.pipe(res);
      });

      proxyReq.on("error", (err) => {
        console.error("Proxy error:", err.message);
        res.writeHead(502, { ...cors, "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Upstream error: " + err.message }));
      });

      proxyReq.write(postData);
      proxyReq.end();
    });
    return;
  }

  // 404
  res.writeHead(404, { ...cors, "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, () => {
  console.log(`ProspectSignal API proxy running on port ${PORT}`);
  console.log(`Anthropic key: ${ANTHROPIC_KEY ? "configured (" + ANTHROPIC_KEY.substring(0, 10) + "...)" : "MISSING"}`);
});
