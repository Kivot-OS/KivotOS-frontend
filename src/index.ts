/**
 * KivotOS APT Repository - Cloudflare Worker
 *
 * Serves the KivotOS APT repository from an R2 bucket (published by aptly).
 *
 * Features:
 *  - GET file: returns object from R2 with proper Content-Type & Cache-Control
 *  - GET / or path ending with '/': renders dynamic HTML index from R2 list
 *  - ETag / If-None-Match: returns 304 (apt update will skip re-download)
 *  - Edge cache (Cache API) for every response
 */

export interface Env {
  REPO: R2Bucket;
}

function contentType(key: string): string {
  if (key.endsWith(".deb"))            return "application/vnd.debian.binary-package";
  if (key.endsWith(".gpg"))            return "application/pgp-keys";
  if (key.endsWith(".gz"))             return "application/gzip";
  if (key.endsWith(".bz2"))            return "application/x-bzip2";
  if (key.endsWith(".xz"))             return "application/x-xz";
  if (key.endsWith(".html"))           return "text/html; charset=utf-8";
  if (key.endsWith(".txt"))            return "text/plain; charset=utf-8";

  const base = key.split("/").pop() ?? "";
  if (base === "Release" || base === "InRelease" || base === "Release.gpg")
                                        return "text/plain; charset=utf-8";
  if (base.startsWith("Packages"))      return "text/plain; charset=utf-8";
  if (base.startsWith("Contents-"))     return "text/plain; charset=utf-8";

  return "application/octet-stream";
}

function cacheControl(key: string): string {
  if (key.endsWith(".deb")) {
    return "public, max-age=31536000, immutable";
  }
  const base = key.split("/").pop() ?? "";
  if (
    base === "Release" || base === "InRelease" || base === "Release.gpg" ||
    base.startsWith("Packages") || base.startsWith("Contents-")
  ) {
    return "public, max-age=300, must-revalidate";
  }
  if (key === "pubkey.gpg") return "public, max-age=86400";
  return "public, max-age=3600";
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

async function renderIndex(env: Env, prefix: string): Promise<Response> {
  const listing = await env.REPO.list({
    prefix,
    delimiter: "/",
    limit: 1000,
  });

  const dirs = (listing.delimitedPrefixes ?? []).sort();
  const files = (listing.objects ?? []).sort((a, b) => a.key.localeCompare(b.key));

  const title = `Index of /${prefix}`;
  const parent = prefix ? "../" : null;

  let rows = "";
  if (parent) {
    rows += `<a href="${parent}">../</a>\n`;
  }

  for (const dir of dirs) {
    const name = dir.slice(prefix.length);
    rows += `<a href="${esc(name)}">${esc(name)}</a>\n`;
  }

  for (const obj of files) {
    const name = obj.key.slice(prefix.length);
    if (!name) continue;
    const mtime = obj.uploaded.toISOString().replace("T", " ").slice(0, 19);
    const size = fmtSize(obj.size);
    const namePadded = name.padEnd(50, " ");
    rows += `<a href="${esc(name)}">${esc(namePadded)}</a> ${mtime}  ${size.padStart(10, " ")}\n`;
  }

  if (!dirs.length && !files.length && !parent) {
    rows = "(empty bucket)\n";
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
         background: #fafafa; color: #222; margin: 0; padding: 2rem; }
  h1 { font-size: 1.2rem; font-weight: 600; margin: 0 0 1rem; }
  hr { border: 0; border-top: 1px solid #ddd; margin: 1rem 0; }
  pre { font-size: 0.9rem; line-height: 1.5; margin: 0; }
  a { color: #0366d6; text-decoration: none; }
  a:hover { text-decoration: underline; }
  .footer { margin-top: 2rem; font-size: 0.85rem; color: #888; }
  .footer code { background: #eee; padding: 0.1rem 0.3rem; border-radius: 3px; }
  @media (prefers-color-scheme: dark) {
    body { background: #1a1a1a; color: #ddd; }
    hr { border-top-color: #333; }
    a { color: #58a6ff; }
    .footer { color: #888; }
    .footer code { background: #2a2a2a; }
  }
</style>
</head>
<body>
<h1>${esc(title)}</h1>
<hr>
<pre>${rows}</pre>
<hr>
<div class="footer">
  KivotOS APT Repository — served by Cloudflare Workers + R2<br>
</div>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=60",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function renderIndexWithUrl(env: Env, prefix: string, baseUrl: string): Promise<Response> {
  const resp = await renderIndex(env, prefix);
  let html = await resp.text();
  html = html.replaceAll("${URL}", baseUrl);
  return new Response(html, { headers: resp.headers });
}

async function serveFile(env: Env, key: string, request: Request): Promise<Response> {
  const ifNoneMatch = request.headers.get("If-None-Match");

  // HEAD first so we can short-circuit a 304 without streaming the body.
  const head = await env.REPO.head(key);
  if (!head) {
    return new Response("Not Found", { status: 404 });
  }

  const etag = `"${head.httpEtag.replace(/"/g, "")}"`;
  if (ifNoneMatch && ifNoneMatch === etag) {
    return new Response(null, {
      status: 304,
      headers: {
        ETag: etag,
        "Cache-Control": cacheControl(key),
      },
    });
  }

  const obj = await env.REPO.get(key);
  if (!obj) {
    return new Response("Not Found", { status: 404 });
  }

  const headers = new Headers();
  headers.set("Content-Type", contentType(key));
  headers.set("Cache-Control", cacheControl(key));
  headers.set("ETag", etag);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Last-Modified", obj.uploaded.toUTCString());
  if (obj.size !== undefined) headers.set("Content-Length", String(obj.size));

  return new Response(obj.body, { headers });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: { Allow: "GET, HEAD" },
      });
    }

    const cache = caches.default;
    const cacheKey = new Request(url.toString(), request);
    const cached = await cache.match(cacheKey);
    if (cached) {
      const ifNoneMatch = request.headers.get("If-None-Match");
      const cachedEtag = cached.headers.get("ETag");
      if (ifNoneMatch && cachedEtag && ifNoneMatch === cachedEtag) {
        return new Response(null, { status: 304, headers: cached.headers });
      }
      return cached;
    }

    let path = decodeURIComponent(url.pathname);
    if (path.startsWith("/")) path = path.slice(1);

    let response: Response;

    if (path === "" || path.endsWith("/")) {
      const baseUrl = `${url.protocol}//${url.host}`;
      response = await renderIndexWithUrl(env, path, baseUrl);
    } else {
      response = await serveFile(env, path, request);
    }

    if (response.status === 200 || response.status === 304) {
      const cacheable = response.clone();
      ctx.waitUntil(cache.put(cacheKey, cacheable));
    }

    return response;
  },
};
