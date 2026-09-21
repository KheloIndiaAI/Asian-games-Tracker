#!/usr/bin/env bash
# One-time EC2 instance setup (Amazon Linux 2023). Run as EC2 user-data on
# first boot, or manually over SSM Session Manager. Idempotent — safe to
# re-run. Installs Node 22, creates the service user/dirs, and installs the
# systemd units. It does NOT deploy a release or start the services — the
# first deploy.sh run (via SSM Run Command from CI) does that.
set -euo pipefail

NODE_MAJOR=22
SERVICE_USER=cheer4bharat
APP_DIR=/opt/cheer4bharat

echo "==> Installing Node ${NODE_MAJOR}"
if ! command -v node >/dev/null || [ "$(node -e 'console.log(process.versions.node.split(".")[0])')" != "$NODE_MAJOR" ]; then
  curl -fsSL "https://rpm.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  dnf install -y nodejs
fi

echo "==> Creating service user and directories"
id -u "$SERVICE_USER" >/dev/null 2>&1 || useradd --system --no-create-home --shell /sbin/nologin "$SERVICE_USER"
mkdir -p "$APP_DIR/releases" "$APP_DIR/bin" /etc/cheer4bharat
chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR"
chown "$SERVICE_USER:$SERVICE_USER" /etc/cheer4bharat

echo "==> Installing CloudWatch agent"
dnf install -y amazon-cloudwatch-agent || true

echo "==> Installing systemd units"
# On first boot this script runs from a flat directory synced from S3
# (infra/terraform uploads infra/systemd/*.service and infra/scripts/*.sh
# side by side under s3://<artifacts-bucket>/bootstrap/ — see bootstrap.tf),
# so unit files sit right next to this script, not under ../systemd. A later
# manual re-run from a full repo checkout also works, since it falls back to
# ../systemd when the flat layout isn't there.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/cheer4bharat-web.service" ]; then
  UNIT_DIR="$SCRIPT_DIR"
else
  UNIT_DIR="$SCRIPT_DIR/../systemd"
fi
cp "$UNIT_DIR/cheer4bharat-web.service" /etc/systemd/system/
cp "$UNIT_DIR/cheer4bharat-worker.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable cheer4bharat-web.service cheer4bharat-worker.service

echo "==> Installing the deploy entrypoint at a stable path"
# deploy.sh lives here (not under $APP_DIR/current, which doesn't exist
# until the first deploy) so CI has something to invoke via SSM Run Command
# even before any release has been deployed. Each run re-reads
# render-env.sh from the release it just extracted, so this copy only needs
# to be the entrypoint, not stay in sync with the release's own copy.
cp "$SCRIPT_DIR/deploy.sh" "$APP_DIR/bin/deploy.sh"
chmod +x "$APP_DIR/bin/deploy.sh"

echo "==> Bootstrap complete. Trigger a deploy via CI (which runs $APP_DIR/bin/deploy.sh over SSM)."
