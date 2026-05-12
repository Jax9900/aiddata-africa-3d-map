import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";

const port = Number(process.argv[2] ?? 5180);
const root = resolve("dist");

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

function resolveFile(url) {
  const cleanUrl = decodeURIComponent(url.split("?")[0]);
  const requested = normalize(join(root, cleanUrl));
  if (!requested.startsWith(root)) return join(root, "index.html");
  if (existsSync(requested) && statSync(requested).isFile()) return requested;
  return join(root, "index.html");
}

createServer((request, response) => {
  const file = resolveFile(request.url ?? "/");
  const type = mimeTypes[extname(file)] ?? "application/octet-stream";
  response.writeHead(200, {
    "Content-Type": type,
    "Cache-Control": file.endsWith("index.html") ? "no-cache" : "public, max-age=31536000, immutable",
  });
  createReadStream(file).pipe(response);
}).listen(port, "0.0.0.0", () => {
  console.log(`Static build available at http://127.0.0.1:${port}/`);
});
