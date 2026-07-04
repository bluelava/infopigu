#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/push_2_github.sh [options]

Options:
  --target <dir>        Local checkout path of the GitHub mirror repo.
                        Default: ../infopigu-github-sync
  --remote <url>        GitHub remote URL used when cloning the target repo.
                        Default: git@github.com:bluelava/infopigu.git
  --branch <name>       Target branch. Default: main
  --message <text>      Commit message. Default: sync: import from InformaticBiguCodex <timestamp>
  --skip-build          Skip pnpm build and release packaging.
  --no-commit           Sync files only; do not create a commit.
  --no-push             Commit locally but do not push.
  --dry-run             Show what would be copied, committed, and pushed.
  -h, --help            Show this help.

Environment overrides:
  GITHUB_SYNC_TARGET_DIR
  GITHUB_SYNC_REMOTE_URL
  GITHUB_SYNC_BRANCH
  GITHUB_SYNC_COMMIT_MESSAGE
EOF
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

TARGET_DIR="${GITHUB_SYNC_TARGET_DIR:-${SOURCE_ROOT}/../infopigu-github-sync}"
REMOTE_URL="${GITHUB_SYNC_REMOTE_URL:-git@github.com:bluelava/infopigu.git}"
BRANCH="${GITHUB_SYNC_BRANCH:-main}"
COMMIT_MESSAGE="${GITHUB_SYNC_COMMIT_MESSAGE:-sync: import from InformaticBiguCodex $(date '+%Y-%m-%d %H:%M:%S')}"
SKIP_BUILD=0
NO_COMMIT=0
NO_PUSH=0
DRY_RUN=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      TARGET_DIR="$2"
      shift 2
      ;;
    --remote)
      REMOTE_URL="$2"
      shift 2
      ;;
    --branch)
      BRANCH="$2"
      shift 2
      ;;
    --message)
      COMMIT_MESSAGE="$2"
      shift 2
      ;;
    --skip-build)
      SKIP_BUILD=1
      shift
      ;;
    --no-commit)
      NO_COMMIT=1
      shift
      ;;
    --no-push)
      NO_PUSH=1
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

log() {
  printf '[push_2_github] %s\n' "$*"
}

fail() {
  printf '[push_2_github] ERROR: %s\n' "$*" >&2
  exit 1
}

should_exclude() {
  local path="$1"
  case "$path" in
    .DS_Store|*/.DS_Store) return 0 ;;
    1-design/*) return 0 ;;
    docs/*) return 0 ;;
    .omc/*) return 0 ;;
    .superpowers/*) return 0 ;;
    ChromeStore发布指引.md) return 0 ;;
    *) return 1 ;;
  esac
}

ensure_target_repo() {
  if [[ -d "${TARGET_DIR}/.git" ]]; then
    return 0
  fi

  if [[ "${DRY_RUN}" -eq 1 ]]; then
    log "DRY RUN: would clone ${REMOTE_URL} -> ${TARGET_DIR}"
    mkdir -p "${TARGET_DIR}"
    return 0
  fi

  log "cloning ${REMOTE_URL} into ${TARGET_DIR}"
  git clone --branch "${BRANCH}" "${REMOTE_URL}" "${TARGET_DIR}"
}

prepare_target_branch() {
  if [[ ! -d "${TARGET_DIR}/.git" ]]; then
    return 0
  fi

  if [[ -n "$(git -C "${TARGET_DIR}" status --porcelain)" ]]; then
    fail "target repo has uncommitted changes: ${TARGET_DIR}"
  fi

  if [[ "${DRY_RUN}" -eq 1 ]]; then
    log "DRY RUN: would checkout/pull branch ${BRANCH} in ${TARGET_DIR}"
    return 0
  fi

  git -C "${TARGET_DIR}" checkout "${BRANCH}" >/dev/null 2>&1 || git -C "${TARGET_DIR}" checkout -b "${BRANCH}"

  if git -C "${TARGET_DIR}" remote get-url origin >/dev/null 2>&1; then
    git -C "${TARGET_DIR}" pull --ff-only origin "${BRANCH}"
  fi
}

build_release_bundle() {
  log "running pnpm build"
  (cd "${SOURCE_ROOT}" && pnpm build)

  log "refreshing release/dist"
  rm -rf "${SOURCE_ROOT}/release/dist"
  mkdir -p "${SOURCE_ROOT}/release/dist"
  rsync -a --delete "${SOURCE_ROOT}/dist/" "${SOURCE_ROOT}/release/dist/"

  log "repacking release/cognitive-delta-extension.zip"
  rm -f "${SOURCE_ROOT}/release/cognitive-delta-extension.zip"
  (
    cd "${SOURCE_ROOT}/dist"
    zip -qr "${SOURCE_ROOT}/release/cognitive-delta-extension.zip" .
  )
}

sync_files() {
  local manifest_file
  local stage_dir
  local -a rsync_args
  manifest_file="$(mktemp)"
  stage_dir="$(mktemp -d)"

  while IFS= read -r -d '' path; do
    if should_exclude "${path}"; then
      continue
    fi
    printf '%s\0' "${path}" >> "${manifest_file}"
  done < <(git -C "${SOURCE_ROOT}" ls-files --cached --others --exclude-standard -z)

  log "building staging tree"
  rsync -a --from0 --files-from="${manifest_file}" "${SOURCE_ROOT}/" "${stage_dir}/"

  log "mirroring files into ${TARGET_DIR}"
  rsync_args=(-a --delete --exclude '.git/')
  if [[ "${DRY_RUN}" -eq 1 ]]; then
    rsync_args+=(--dry-run)
  fi
  rsync "${rsync_args[@]}" "${stage_dir}/" "${TARGET_DIR}/"

  rm -f "${manifest_file}"
  rm -rf "${stage_dir}"
}

commit_and_push() {
  if [[ ! -d "${TARGET_DIR}/.git" ]]; then
    log "target repo not initialized; skipping commit/push"
    return 0
  fi

  if [[ "${DRY_RUN}" -eq 1 ]]; then
    log "DRY RUN: would git add/commit/push in ${TARGET_DIR}"
    git -C "${TARGET_DIR}" status --short || true
    return 0
  fi

  if [[ "${NO_COMMIT}" -eq 1 ]]; then
    log "sync complete; skipping commit/push by request"
    return 0
  fi

  git -C "${TARGET_DIR}" add -A

  if [[ -z "$(git -C "${TARGET_DIR}" status --porcelain)" ]]; then
    log "no file changes to commit"
    return 0
  fi

  git -C "${TARGET_DIR}" commit -m "${COMMIT_MESSAGE}"

  if [[ "${NO_PUSH}" -eq 1 ]]; then
    log "commit created locally; skipping push by request"
    return 0
  fi

  git -C "${TARGET_DIR}" push origin "${BRANCH}"
}

main() {
  command -v git >/dev/null 2>&1 || fail "git is required"
  command -v rsync >/dev/null 2>&1 || fail "rsync is required"

  if [[ "${SKIP_BUILD}" -eq 0 ]]; then
    command -v pnpm >/dev/null 2>&1 || fail "pnpm is required for build"
    command -v zip >/dev/null 2>&1 || fail "zip is required for release packaging"
    build_release_bundle
  else
    log "skipping build and release packaging"
  fi

  ensure_target_repo
  prepare_target_branch
  sync_files
  commit_and_push

  log "done"
}

main "$@"
