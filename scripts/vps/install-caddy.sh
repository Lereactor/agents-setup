#!/usr/bin/env bash
# Установка Caddy из официального репозитория (cloudsmith) с таймаутами:
# зеркало Ubuntu с этого VPS бывает очень медленным, поэтому apt update
# обновляет ТОЛЬКО список Caddy. Лог: /root/install-caddy.log
set -e
export DEBIAN_FRONTEND=noninteractive
# дождаться штатного apt (apt-daily), если он идёт
for i in $(seq 1 60); do fuser /var/lib/dpkg/lock-frontend /var/lib/apt/lists/lock >/dev/null 2>&1 || break; sleep 5; done
curl -1sLf -m 60 https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --batch --yes --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf -m 60 https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
timeout 300 apt-get -o Acquire::http::Timeout=30 update -q \
  -o Dir::Etc::sourcelist=sources.list.d/caddy-stable.list -o Dir::Etc::sourceparts=- -o APT::Get::List-Cleanup=0
timeout 300 apt-get -o Acquire::http::Timeout=30 install -y -q --no-install-recommends caddy
caddy version
echo INSTALL_DONE
