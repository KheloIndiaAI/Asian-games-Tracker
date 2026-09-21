#!/usr/bin/env bash
# Renders /etc/cheer4bharat/env from SSM Parameter Store, for systemd's
# EnvironmentFile= to load into the web and worker services. Run by
# infra/scripts/deploy.sh on every deploy, using the EC2 instance role
# (no AWS credentials are stored on the box).
set -euo pipefail

PREFIX="${SSM_PREFIX:-/cheer4bharat/prod}"
OUT="/etc/cheer4bharat/env"
REGION="${AWS_REGION:-ap-south-1}"
SERVICE_USER="${SERVICE_USER:-cheer4bharat}"

mkdir -p "$(dirname "$OUT")"
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

aws ssm get-parameters-by-path \
  --path "$PREFIX" \
  --with-decryption \
  --region "$REGION" \
  --query "Parameters[].{Name:Name,Value:Value}" \
  --output json |
  node -e '
    const params = JSON.parse(require("fs").readFileSync(0, "utf8"));
    const prefix = process.argv[1];
    for (const p of params) {
      const key = p.Name.slice(prefix.length + 1);
      const value = String(p.Value).replace(/"/g, "\\\"");
      process.stdout.write(`${key}="${value}"\n`);
    }
  ' "$PREFIX" > "$tmp"

if [ ! -s "$tmp" ]; then
  echo "render-env.sh: no parameters found under $PREFIX — refusing to write an empty env file" >&2
  exit 1
fi

install -o "$SERVICE_USER" -g "$SERVICE_USER" -m 600 "$tmp" "$OUT"
echo "render-env.sh: wrote $(grep -c = "$OUT") variable(s) to $OUT"
