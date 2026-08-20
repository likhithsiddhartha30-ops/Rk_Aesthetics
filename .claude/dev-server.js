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
  const ext = path.extname(file).toLowerCase();
  const headers = { "Content-Type": types[ext] || "application/octet-stream" };
  // Mirror what a real host should do: PDFs are products, not pages.
  if (ext === ".pdf") headers["Content-Disposition"] = 'attachment; filename="' + path.basename(file) + '"';
  res.writeHead(200, headers);
  fs.createReadStream(file).pipe(res);
}).listen(5173, () => console.log("serving on http://localhost:5173"));
