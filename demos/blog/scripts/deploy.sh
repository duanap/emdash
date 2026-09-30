#!/usr/bin/env bash
#
# 一条命令式发版（Phase 6）。在服务器上从仓库根目录执行：
#
#   ./demos/blog/scripts/deploy.sh              # 备份 → 构建 → 切换 → 重启 → 健康检查
#   ./demos/blog/scripts/deploy.sh --dry-run    # 只打印将要执行的步骤
#   ./demos/blog/scripts/deploy.sh --no-build   # 跳过构建（只切 dist 并重启，用于排障）
#   ./demos/blog/scripts/deploy.sh --check-only # 只对运行中的实例做健康检查
#
# 设计取舍：
# - 构建**原地**进行，把上一份 dist 留成 dist.previous；健康检查失败就切回去再重启，
#   这是单机 + systemd 场景下最直接的回滚方式。
# - 部署前一定先备份数据库：迁移/升级出错时，数据比产物值钱。
# - 所有路径与端口都可用环境变量覆盖，默认值对应 night-work/DEPLOY.md 的目录布局。

set -euo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
DEMO_DIR="$APP_DIR/demos/blog"
ENV_FILE="${ENV_FILE:-$APP_DIR/.env}"
SERVICE="${SERVICE:-emdashblog}"
DATA_DIR="${DATA_DIR:-$APP_DIR/data}"
UPLOADS_DIR="${UPLOADS_DIR:-$APP_DIR/uploads}"
BACKUP_DIR="${BACKUP_DIR:-$APP_DIR/backups}"
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
		-h | --help)
			sed -n '2,15p' "${BASH_SOURCE[0]}"
			exit 0
			;;
		*)
			echo "未知参数：$arg（用 --help 看用法）" >&2
			exit 2
			;;
	esac
done

step() { printf '\n\033[1m== %s\033[0m\n' "$1"; }
info() { printf '   %s\n' "$1"; }

plan() {
	step "将要执行（APP_DIR=$APP_DIR）"
	info "1. 备份数据库：$DATA_DIR/data.db → $BACKUP_DIR"
	info "2. 读取构建期环境变量：$ENV_FILE"
	[[ "$DO_BUILD" == "1" ]] && info "3. 构建：pnpm install --frozen-lockfile && pnpm build && astro build" || info "3. 跳过构建（--no-build）"
	info "4. 备份现有 dist 为 dist.previous"
	info "5. 重启服务：systemctl restart $SERVICE"
	info "6. 健康检查：http://$HOST:$PORT/ 等 4 个地址 + dev 端点必须 403"
	info "7. 任一步失败 → 切回 dist.previous 并重启"
}

if [[ "$DRY_RUN" == "1" ]]; then
	plan
	exit 0
fi

health_check() {
	local url code
	for path in / /posts /messages /rss.xml; do
		url="http://$HOST:$PORT$path"
		code="$(curl -fsS -o /dev/null -w '%{http_code}' "$url" || true)"
		if [[ "$code" != "200" ]]; then
			echo "健康检查失败：$url 返回 ${code:-无响应}" >&2
			return 1
		fi
		info "$path → 200"
	done
	# dev-only 端点在 production 下必须关闭
	code="$(curl -s -o /dev/null -w '%{http_code}' "http://$HOST:$PORT/_emdash/api/setup/dev-bypass?redirect=/" || true)"
	if [[ "$code" != "403" ]]; then
		echo "安全检查失败：dev-bypass 返回 $code，应为 403（NODE_ENV 是否为 production？）" >&2
		return 1
	fi
	info "dev-bypass → 403"
	return 0
}

if [[ "$CHECK_ONLY" == "1" ]]; then
	step "健康检查（$HOST:$PORT）"
	health_check && exit 0
	exit 1
fi

step "0. 预检"
command -v "$NODE" >/dev/null || { echo "找不到 node" >&2; exit 1; }
command -v "$PNPM" >/dev/null || { echo "找不到 pnpm" >&2; exit 1; }
[[ -f "$ENV_FILE" ]] || { echo "找不到 .env：$ENV_FILE" >&2; exit 1; }
[[ -d "$DEMO_DIR" ]] || { echo "找不到 demo 目录：$DEMO_DIR" >&2; exit 1; }
systemctl cat "$SERVICE" >/dev/null 2>&1 || { echo "systemd 里没有 $SERVICE 服务" >&2; exit 1; }
info "node $(command -v "$NODE") / pnpm $(command -v "$PNPM")"
info "服务：$SERVICE，监听 $HOST:$PORT"

step "1. 备份数据库"
mkdir -p "$BACKUP_DIR"
if [[ -f "$DATA_DIR/data.db" ]]; then
	(cd "$DEMO_DIR" && "$NODE" scripts/backup-db.mjs --db "$DATA_DIR/data.db" --out "$BACKUP_DIR")
else
	info "还没有 $DATA_DIR/data.db（首次部署），跳过备份"
fi

if [[ "$DO_BUILD" == "1" ]]; then
	step "2. 构建"
	# 构建期环境变量（EMDASH_DATABASE_URL / EMDASH_UPLOADS_DIR）来自 .env
	set -a
	# shellcheck disable=SC1090
	. "$ENV_FILE"
	set +a
	export EMDASH_DATABASE_URL="${EMDASH_DATABASE_URL:-file:$DATA_DIR/data.db}"
	export EMDASH_UPLOADS_DIR="${EMDASH_UPLOADS_DIR:-$UPLOADS_DIR}"
	info "数据库：$EMDASH_DATABASE_URL"
	info "上传目录：$EMDASH_UPLOADS_DIR"
	(cd "$APP_DIR" && "$PNPM" install --frozen-lockfile)
	(cd "$APP_DIR" && "$PNPM" build)
	(cd "$DEMO_DIR" && "$PNPM" exec astro build)
else
	step "2. 跳过构建"
fi

step "3. 切换产物"
if [[ -d "$DEMO_DIR/dist" ]]; then
	rm -rf "$DEMO_DIR/dist.previous"
	cp -a "$DEMO_DIR/dist" "$DEMO_DIR/dist.previous"
	info "上一份产物已留成 dist.previous"
fi

step "4. 重启服务"
systemctl restart "$SERVICE"
sleep 2

step "5. 健康检查"
if health_check; then
	step "完成"
	info "发版成功；回滚方式：把 dist.previous 换回 dist 后重启，或按 night-work/DEPLOY.md 切回旧站 upstream"
	exit 0
fi

step "6. 回滚"
if [[ -d "$DEMO_DIR/dist.previous" ]]; then
	rm -rf "$DEMO_DIR/dist"
	mv "$DEMO_DIR/dist.previous" "$DEMO_DIR/dist"
	systemctl restart "$SERVICE"
	sleep 2
	if health_check; then
		echo "已回滚到上一份产物，站点恢复" >&2
	else
		echo "回滚后健康检查仍失败，请人工介入（journalctl -u $SERVICE -n 100）" >&2
	fi
else
	echo "没有 dist.previous 可回滚" >&2
fi
exit 1
