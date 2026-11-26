#!/usr/bin/env bash
set -Eeuo pipefail

readonly checkout=/var/www/mobility-github
readonly service=mobility.service
readonly target="${1:-}"
readonly health_url=http://127.0.0.1:3040/healthz
export GIT_TERMINAL_PROMPT=0

fail() {
  printf '%s\n' "$*" >&2
  exit 1
}

[[ "$target" =~ ^[0-9a-f]{40}$ ]] || fail 'Expected the tested Git commit SHA.'
cd "$checkout"
exec 9>"$HOME/.mobility-pilot-deploy.lock"
flock 9

check_clean() {
  local changes
  changes=$(git status --porcelain --untracked-files=all)
  [[ -z "$changes" ]] || fail 'Deployment cancelled: the pilot checkout has local changes.'
}

check_health() {
  local attempt
  for ((attempt=1; attempt<=20; attempt++)); do
    if systemctl is-active --quiet "$service" &&
       curl --fail --silent --max-time 2 "$health_url" >/dev/null; then
      return 0
    fi
    sleep 1
  done
  return 1
}

check_clean
previous=$(git rev-parse --verify HEAD)
git fetch --no-tags origin +refs/heads/main:refs/remotes/origin/main
check_clean
[[ "$(git rev-parse refs/remotes/origin/main)" == "$target" ]] ||
  fail 'Deployment cancelled: a newer commit is on main. Run the workflow for the current main.'
git merge-base --is-ancestor "$previous" "$target" ||
  fail 'Deployment cancelled: the pilot checkout cannot fast-forward to the tested commit.'

install_dependencies=false
if [[ ! -d node_modules ]] ||
   [[ "$(git rev-parse "$previous:package-lock.json")" != "$(git rev-parse "$target:package-lock.json")" ]]; then
  install_dependencies=true
fi

backup=
dependencies_changed=false
rollback() {
  local status=$?
  trap - EXIT
  trap '' HUP INT TERM
  ((status == 0)) && return 0
  printf 'Deployment failed. Restoring %s.\n' "$previous" >&2
  if ! git switch --detach "$previous"; then
    printf 'Could not restore the previous commit. Dependency backup: %s\n' "$backup" >&2
    exit "$status"
  fi
  if [[ "$dependencies_changed" == true ]]; then
    if [[ -e node_modules || -L node_modules ]]; then
      if ! mv -- node_modules "$backup/rejected"; then
        printf 'Could not move the failed dependencies. Backup: %s\n' "$backup" >&2
        exit "$status"
      fi
    fi
    if [[ -e "$backup/previous" || -L "$backup/previous" ]]; then
      if ! mv -- "$backup/previous" node_modules; then
        printf 'Could not restore the previous dependencies. Backup: %s\n' "$backup" >&2
        exit "$status"
      fi
    fi
  fi
  if sudo -n systemctl restart "$service" && check_health; then
    printf 'Rollback verified for %s.\n' "$previous" >&2
    [[ -z "$backup" ]] || rm -rf -- "$backup"
  else
    printf 'Rollback health check failed. Dependency backup directory: %s\n' "$backup" >&2
  fi
  exit "$status"
}

trap rollback EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM
git switch --detach "$target"
if [[ "$install_dependencies" == true ]]; then
  backup=$(mktemp -d "$(git rev-parse --absolute-git-dir)/mobility-deploy.XXXXXX")
  if [[ -e node_modules || -L node_modules ]]; then
    mv -- node_modules "$backup/previous"
  fi
  dependencies_changed=true
  npm ci
fi

sudo -n systemctl restart "$service"
check_health || fail 'The new pilot process did not pass its health check.'

trap - EXIT HUP INT TERM
[[ -z "$backup" ]] || rm -rf -- "$backup"
printf 'Verified Mobility pilot at %s.\n' "$target"