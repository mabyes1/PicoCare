# PicoCare cloud deploy (only if judges ask for a live backend)

The hackathon judges almost certainly will NOT install the app — the film + repo
carry the entry. Use this only if a finalist round requires a live demo.

## Why fly.io

Backend is zero-dependency Node 24 + SQLite. One 256MB machine with a 1GB
volume is plenty. Free tier covers the judging window (Nov 4–8).

## Steps (30 min, needs the owner's fly.io account)

1. `fly auth login`, then in the repo root:
   `fly launch --no-deploy --name picocare-demo --region sin --no-postgres`
2. `fly volumes create picocare_data --size 1 --region sin`
3. Secrets (never commit): `fly secrets set MODEL_API_KEY=... BASENTEN_API_KEY=...`
4. `fly deploy`, then `fly open` → note the `https://*.fly.dev` URL.
5. In the phone apps: Settings → Service connection → paste the fly.dev URL.
   (Care app: rebuild is not needed; the setup screen takes any URL. The elder
   app needs pairing again against the new backend, or ship a build with the
   URL prefilled.)
6. Seed demo data: open `https://<app>.fly.dev` → create workspace → Join demo.
   Real field data stays home; do NOT copy `care.sqlite` to the cloud.

## After judging

`fly apps destroy picocare-demo` and rotate any keys that were set as secrets.

## Dockerfile (reference, create when deploying)

```dockerfile
FROM node:24-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . ./
RUN npm run build
ENV PORT=8080 PICOCARE_DB=/data/care.sqlite
VOLUME /data
CMD ["npm", "start", "--", "--demo"]
```

`fly.toml` needs `[[mounts]] source="picocare_data" destination="/data"`
and `[[services]] internal_port=8080`.
