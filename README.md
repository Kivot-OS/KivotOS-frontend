# kivotos-repo-worker

Cloudflare Worker phục vụ APT repo KivotOS từ R2 bucket — dynamic index page + ETag/304 cho `apt update`.

## Architecture

```
GitHub Actions (KivotOS-repo)
   └─ aptly publish → R2 bucket "kivotos-repo"
                            ▲
                            │ R2 binding "REPO"
                            │
              Cloudflare Worker (this repo)
                            │
                            ▼
                  https://kivotos-repo.<sub>.workers.dev
                            │
                            ▼
                       end-user apt
```

## Deploy

```bash
# 1. Cài deps
npm install

# 2. Đảm bảo đã login Cloudflare
npx wrangler whoami

# 3. Tạo R2 bucket nếu chưa có
npx wrangler r2 bucket create kivotos-repo

# 4. Deploy
npm run deploy
```

Sau khi deploy lần đầu wrangler sẽ in URL `https://kivotos-repo.<your-subdomain>.workers.dev`.

## Development

```bash
npm run dev       # local dev server (gọi R2 thật)
npm run tail      # xem log realtime
npm run typecheck # TypeScript check
```

## Files

| File | Mục đích |
|---|---|
| `src/index.ts` | Logic Worker: serve R2 + render index + ETag |
| `wrangler.toml` | Bind R2 bucket `kivotos-repo`, workers.dev |
| `package.json` | Deps: wrangler, typescript |
| `tsconfig.json` | TypeScript config cho Worker |

## Cache strategy

| Loại file | Cache-Control |
|---|---|
| `*.deb` | `public, max-age=31536000, immutable` |
| `Release`, `InRelease`, `Packages*` | `public, max-age=300, must-revalidate` |
| `pubkey.gpg` | `public, max-age=86400` |
| Index HTML | `public, max-age=60` |

ETag được forward từ R2 → `If-None-Match` request → 304 Not Modified, giảm bandwidth khi `apt update` lặp lại.

## License

MIT
