#!/usr/bin/env bash
# Deploys one build artifact to this EC2 instance. Invoked via SSM Run
# Command from the GitHub Actions workflow (.github/workflows/deploy.yml)
# — never run manually against production except for a rollback.
#
# Usage: deploy.sh <s3-bucket> <s3-key>
set -euo pipefail

S3_BUCKET="${1:?usage: deploy.sh <s3-bucket> <s3-key>}"
S3_KEY="${2:?usage: deploy.sh <s3-bucket> <s3-key>}"

APP_DIR=/opt/cheer4bharat
SERVICE_USER=cheer4bharat
RELEASE_ID="$(date +%Y%m%d%H%M%S)"
RELEASE_DIR="$APP_DIR/releases/$RELEASE_ID"
KEEP_RELEASES=5

echo "==> Deploying s3://$S3_BUCKET/$S3_KEY to $RELEASE_DIR"
mkdir -p "$RELEASE_DIR"
TARBALL="/tmp/$RELEASE_ID.tar.gz"
aws s3 cp "s3://$S3_BUCKET/$S3_KEY" "$TARBALL"
tar -xzf "$TARBALL" -C "$RELEASE_DIR"
rm -f "$TARBALL"

echo "==> Installing dependencies"
cd "$RELEASE_DIR"
npm ci

echo "==> Rendering /etc/cheer4bharat/env from SSM"
"$RELEASE_DIR/infra/scripts/render-env.sh"

echo "==> Running database migrations"
set -a
# shellcheck disable=SC1091
source /etc/cheer4bharat/env
set +a
npx drizzle-kit migrate

echo "==> Switching current symlink"
ln -sfn "$RELEASE_DIR" "$APP_DIR/current"
chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR"

echo "==> Restarting services"
systemctl restart cheer4bharat-web.service
systemctl restart cheer4bharat-worker.service
sleep 2
systemctl is-active --quiet cheer4bharat-web.service || { echo "web service failed to start"; journalctl -u cheer4bharat-web.service -n 50 --no-pager; exit 1; }
systemctl is-active --quiet cheer4bharat-worker.service || { echo "worker service failed to start"; journalctl -u cheer4bharat-worker.service -n 50 --no-pager; exit 1; }

echo "==> Pruning old releases (keeping last $KEEP_RELEASES)"
cd "$APP_DIR/releases"
ls -1t | tail -n +$((KEEP_RELEASES + 1)) | xargs -r rm -rf

echo "==> Deploy complete: $RELEASE_ID"
