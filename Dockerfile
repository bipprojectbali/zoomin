# Image produksi zoomin: single binary (server + SPA + migrasi tertanam) di atas distroless. Dibangun oleh
# .github/workflows/docker.yml → ghcr.io/bipprojectbali/zoomin; dijalankan lewat compose.yml (stack Portainer).
# Lokal: docker build --platform linux/amd64 -t zoomin .

# Versi Bun = versi yang diverifikasi repo (CLAUDE.md, Bun 1.4.2); naikkan bersama setup-bun di workflow.
FROM oven/bun:1.4.2 AS build
WORKDIR /src
COPY package.json bun.lock ./
# --production: devDependencies (Playwright, rtc-node, typescript) tidak dibutuhkan untuk build SPA + compile.
RUN bun install --frozen-lockfile --production
COPY . .
# Target eksplisit linux-x64 (image hanya linux/amd64); build.binary.ts menjalankan build.web.ts dulu.
RUN bun scripts/build.binary.ts --target bun-linux-x64 --outdir /out \
 && mkdir -p /data

# Binary Bun butuh glibc + libstdc++/libgcc; distroless/cc menyediakannya tanpa shell/package manager.
FROM gcr.io/distroless/cc-debian12:nonroot
LABEL org.opencontainers.image.source="https://github.com/bipprojectbali/zoomin" \
      org.opencontainers.image.title="zoomin" \
      org.opencontainers.image.description="Ruang meeting self-hosted di atas LiveKit dengan multi screen share"
COPY --from=build /out/zoomin-linux-x64 /usr/local/bin/zoomin
# /data milik user nonroot (65532) agar named volume baru ikut dimiliki user itu (Docker menyalin owner dari image).
COPY --from=build --chown=65532:65532 /data /data
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DB_PATH=/data/zoomin.sqlite
WORKDIR /data
VOLUME ["/data"]
EXPOSE 3000
USER nonroot
# Distroless tanpa curl: probe lewat CLI sendiri (GET http://127.0.0.1:$PORT/api/health).
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD ["/usr/local/bin/zoomin", "healthcheck"]
ENTRYPOINT ["/usr/local/bin/zoomin"]
CMD ["serve"]
