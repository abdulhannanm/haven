FROM node:20-bookworm

# basics
RUN apt-get update && apt-get install -y --no-install-recommends \
  git ca-certificates curl bash gnupg \
  && rm -rf /var/lib/apt/lists/*

# install k6 (direct release binary to avoid apt repo issues)
ARG K6_VERSION=0.49.0
RUN arch="$(dpkg --print-architecture)" \
  && if [ "$arch" = "amd64" ]; then k6_arch="linux-amd64"; \
     elif [ "$arch" = "arm64" ]; then k6_arch="linux-arm64"; \
     else echo "Unsupported arch: $arch" && exit 1; fi \
  && curl -fsSL -o /tmp/k6.tgz "https://github.com/grafana/k6/releases/download/v${K6_VERSION}/k6-v${K6_VERSION}-${k6_arch}.tar.gz" \
  && tar -xzf /tmp/k6.tgz -C /tmp \
  && mv "/tmp/k6-v${K6_VERSION}-${k6_arch}/k6" /usr/local/bin/k6 \
  && rm -rf /tmp/k6.tgz "/tmp/k6-v${K6_VERSION}-${k6_arch}"

# install opencode (npm global install is documented) :contentReference[oaicite:3]{index=3}
RUN npm install -g opencode-ai

WORKDIR /repo
COPY . /repo

# default: just open a shell (compose can override)
CMD ["bash", "-lc", "opencode --help && sleep infinity"]
