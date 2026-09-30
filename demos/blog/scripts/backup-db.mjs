#!/usr/bin/env node
/**
 * 数据库在线备份（Phase 6 部署准备）。
 *
 * 用 SQLite 的 `VACUUM INTO`：服务照常运行时也能拿到一致快照，
 * 比直接复制文件安全（复制可能在写入中途）。
 *
 * 用法：
 *   node scripts/backup-db.mjs [--db <路径>] [--out <目录>]
 * 默认：数据库取 EMDASH_DATABASE_URL（去掉 file: 前缀），输出到 ./backups
 */

import { mkdirSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

function readArg(name) {
	const index = process.argv.indexOf(name);
	return index === -1 ? undefined : process.argv[index + 1];
}

const dbUrl = readArg("--db") ?? process.env.EMDASH_DATABASE_URL ?? "file:./data.db";
const dbPath = resolve(dbUrl.replace(/^file:/, ""));
const outDir = resolve(readArg("--out") ?? "./backups");

mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const target = resolve(outDir, `${basename(dbPath, ".db")}-${stamp}.db`);

const db = new DatabaseSync(dbPath, { readOnly: true });
try {
	// VACUUM INTO 要求目标不存在
	db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
} finally {
	db.close();
}

// 立刻回读一次，确认备份能被打开且行数对得上——备份文件坏掉是最糟的情况
const source = new DatabaseSync(dbPath, { readOnly: true });
const backup = new DatabaseSync(target, { readOnly: true });
try {
	const tables = source
		.prepare("select name from sqlite_master where type = 'table' and name not like 'sqlite_%'")
		.all()
		.map((row) => row.name);
	const mismatches = [];
	for (const table of tables) {
		const before = source.prepare(`select count(*) as n from "${table}"`).get().n;
		const after = backup.prepare(`select count(*) as n from "${table}"`).get().n;
		if (before !== after) mismatches.push(`${table}: ${before} → ${after}`);
	}
	if (mismatches.length > 0) {
		console.error(`备份校验失败：\n  ${mismatches.join("\n  ")}`);
		process.exit(1);
	}
	console.log(
		`备份完成：${target}\n  表数 ${tables.length}，大小 ${(statSync(target).size / 1024).toFixed(0)} KB，行数一致`,
	);
} finally {
	source.close();
	backup.close();
}
