#!/usr/bin/env bash
# Prepare a fresh Ubuntu 24.04 host for AirWatch: Docker with the Compose plugin, swap, the
# directory layout and a nightly database backup. Runs as root. It is the Lightsail
# instance's first-boot script (infra/lib/airwatch-stack.mjs) and is safe to run again.
set -eu
(set -o pipefail 2>/dev/null) && set -o pipefail || true

APP_USER=${APP_USER:-ubuntu}
ROOT=${AIRWATCH_ROOT:-/opt/airwatch}
export DEBIAN_FRONTEND=noninteractive

apt-get update -y
apt-get install -y --no-install-recommends docker.io docker-compose-v2 ca-certificates openssl
systemctl enable --now docker
usermod -aG docker "$APP_USER"

# Building the images on a 2 GB instance needs headroom.
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
sysctl -w vm.swappiness=10
echo 'vm.swappiness=10' > /etc/sysctl.d/60-airwatch.conf

install -d -o "$APP_USER" -g "$APP_USER" "$ROOT" "$ROOT/releases" "$ROOT/shared" "$ROOT/shared/models" "$ROOT/shared/backups"
chmod 700 "$ROOT/shared"

# Nightly dump at 02:30 IST (21:00 UTC), once a release exists.
cat > /etc/cron.d/airwatch-backup <<CRON
0 21 * * * $APP_USER [ -x $ROOT/current/deploy/scripts/host.sh ] && AIRWATCH_ROOT=$ROOT $ROOT/current/deploy/scripts/host.sh backup >> $ROOT/shared/backups/backup.log 2>&1
CRON
chmod 644 /etc/cron.d/airwatch-backup
echo "AirWatch host is ready under $ROOT."
