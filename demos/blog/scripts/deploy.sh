#!/usr/bin/env bash
# 在服务器仓库根目录执行。默认数据与 .env 位于仓库父目录。
# --dry-run 打印计划；--check-only 检查运行实例；--no-build 重启已有产物。
set -Eeuo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
DEMO_DIR="$APP_DIR/demos/blog"
STATE_DIR="${STATE_DIR:-$(dirname "$APP_DIR")}"
ENV_FILE="${ENV_FILE:-$STATE_DIR/.env}"
SERVICE="${SERVICE:-emdashblog}"
DATA_DIR="${DATA_DIR:-$STATE_DIR/data}"
UPLOADS_DIR="${UPLOADS_DIR:-$STATE_DIR/uploads}"
BACKUP_DIR="${BACKUP_DIR:-$STATE_DIR/backups}"
PORT="${PORT:-4322}"
HOST="${HOST:-127.0.0.1}"
PNPM="${PNPM:-pnpm}"
NODE="${NODE:-node}"
DRY_RUN=0
DO_BUILD=1
CHECK_ONLY=0
for arg in "$@"; do
	case "$arg" in
		--dry-run) DRY_RUN=1 ;;
		--no-build) DO_BUILD=0 ;;
		--check-only) CHECK_ONLY=1 ;;
		-h | --help) echo "用法：deploy.sh [--dry-run | --no-build | --check-only]"; exit 0 ;;
		*) echo "未知参数：$arg" >&2; exit 2 ;;
	esac
done
step() { printf '\n== %s\n' "$1"; }
info() { printf '   %s\n' "$1"; }
health_check() {
	local code path
	for path in / /posts.html /messages.html /rss.xml; do
		code="$(curl --max-time 10 -sS -o /dev/null -w '%{http_code}' "http://$HOST:$PORT$path" || true)"
		if [[ "$code" != "200" ]]; then
			echo "健康检查失败：$path 返回 ${code:-无响应}" >&2
			return 1
		fi
		info "$path → 200"
	done
	for path in setup auth; do
		code="$(curl --max-time 10 -sS -o /dev/null -w '%{http_code}' "http://$HOST:$PORT/_emdash/api/$path/dev-bypass?redirect=/" || true)"
		if [[ "$code" != "403" ]]; then
			echo "生产检查失败：$path/dev-bypass 返回 $code，应为 403" >&2
			return 1
		fi
	done
}
if [[ "$DRY_RUN" == "1" ]]; then
	info "仓库：$APP_DIR；配置：$ENV_FILE"
	info "先读取配置，备份 EMDASH_DATABASE_URL 指向的实际数据库 → $BACKUP_DIR"
	if [[ "$DO_BUILD" == "1" ]]; then
		info "构建前保存旧 dist → dist.previous；安装依赖、根构建、站点构建"
	else
		info "重启现有 dist，保留已有 dist.previous"
	fi
	info "重启 $SERVICE，检查 $HOST:$PORT；失败时恢复 dist.previous"
	exit 0
fi
if [[ "$CHECK_ONLY" == "1" ]]; then
	health_check
	exit 0
fi
step "预检与配置"
command -v "$NODE" >/dev/null || { echo "找不到 node" >&2; exit 1; }
command -v "$PNPM" >/dev/null || { echo "找不到 pnpm" >&2; exit 1; }
[[ -f "$ENV_FILE" ]] || { echo "找不到配置：$ENV_FILE" >&2; exit 1; }
[[ -d "$DEMO_DIR" ]] || { echo "找不到站点目录：$DEMO_DIR" >&2; exit 1; }
systemctl cat "$SERVICE" >/dev/null 2>&1 || { echo "找不到服务：$SERVICE" >&2; exit 1; }
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a
export EMDASH_DATABASE_URL="${EMDASH_DATABASE_URL:-file:$DATA_DIR/data.db}"
export EMDASH_UPLOADS_DIR="${EMDASH_UPLOADS_DIR:-$UPLOADS_DIR}"
[[ -n "${EMDASH_SITE_URL:-${SITE_URL:-}}" ]] || { echo "生产初始化需要 EMDASH_SITE_URL" >&2; exit 1; }
[[ "$EMDASH_DATABASE_URL" == file:* ]] || { echo "备份仅支持 SQLite file: 地址" >&2; exit 1; }
DB_FILE="${EMDASH_DATABASE_URL#file:}"
[[ "$DB_FILE" == /* ]] || DB_FILE="$DEMO_DIR/$DB_FILE"
step "备份数据库"
mkdir -p "$BACKUP_DIR"
if [[ -f "$DB_FILE" ]]; then
	(cd "$DEMO_DIR" && "$NODE" scripts/backup-db.mjs --db "$DB_FILE" --out "$BACKUP_DIR")
elif systemctl is-active --quiet "$SERVICE"; then
	echo "服务正在运行，但找不到数据库：$DB_FILE；停止发版" >&2
	exit 1
else
	info "首次部署，尚无数据库：$DB_FILE"
fi
DIST="$DEMO_DIR/dist"
PREVIOUS="$DEMO_DIR/dist.previous"
HAS_PREVIOUS=0
if [[ "$DO_BUILD" == "1" && -d "$DIST" ]]; then
	step "保存旧产物"
	SNAPSHOT="$(mktemp -d "$DEMO_DIR/.dist-backup.XXXXXX")"
	cp -a "$DIST/." "$SNAPSHOT/"
	rm -rf "$PREVIOUS"
	mv "$SNAPSHOT" "$PREVIOUS"
	HAS_PREVIOUS=1
elif [[ "$DO_BUILD" == "0" && -d "$PREVIOUS" ]]; then
	HAS_PREVIOUS=1
fi
rollback() {
	local status=$?
	trap - ERR
	set +e
	if [[ "$HAS_PREVIOUS" == "1" ]]; then
		step "恢复旧产物"
		rm -rf "$DIST"
		if cp -a "$PREVIOUS" "$DIST" && systemctl restart "$SERVICE"; then
			sleep 2
			if health_check; then
				echo "已恢复旧产物；数据库未自动回退" >&2
			else
				echo "旧产物已恢复，但健康检查失败；请查看 journalctl -u $SERVICE" >&2
			fi
		else
			echo "旧产物恢复或服务重启失败；请人工检查" >&2
		fi
	else
		echo "发版失败，没有旧产物可恢复" >&2
	fi
	exit "$status"
}
trap rollback ERR
if [[ "$DO_BUILD" == "1" ]]; then
	step "构建"
	(cd "$APP_DIR" && "$PNPM" install --frozen-lockfile)
	(cd "$APP_DIR" && "$PNPM" build)
	(cd "$DEMO_DIR" && "$PNPM" exec astro build)
fi
[[ -f "$DIST/server/entry.mjs" ]]
step "重启与健康检查"
systemctl restart "$SERVICE"
sleep 2
health_check
trap - ERR
info "发版完成；旧产物保留在 $PREVIOUS"
