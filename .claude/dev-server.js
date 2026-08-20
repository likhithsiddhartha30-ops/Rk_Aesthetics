// Minimal static file server for local preview.
const http = require("http");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const types = {
  ".html": "text/html", ".css": "text/css", ".js": "text/javascript",
  ".pdf": "application/pdf", ".jpeg": "image/jpeg", ".jpg": "image/jpeg",
  ".png": "image/png", ".svg": "image/svg+xml"
};

http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p === "/") p = "/index.html";
  const file = path.join(root, p);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); return res.end("Not found");
  }
  res.writeHead(200, { "Content-Type": types[path.extname(file).toLowerCase()] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}).listen(5173, () => console.log("serving on http://localhost:5173"));
