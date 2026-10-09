# Codex Cloud setup for emdash

Use this branch to prepare an isolated development environment for `duanap/emdash`.

- Migration branch: `codex/cloud-migration/2026-10-09`
- Source baseline: `3162249f96997c41e79763eaaaffd847d1cbe741`
- Runtime: Node.js {"node": ">=22.16"}
- Setup status: repository and command inspection complete; cloud installation and runtime checks pending.

## Install dependencies

Run from the repository root:

```bash
corepack enable
corepack prepare pnpm@11.9.0 --activate
pnpm install --frozen-lockfile
pnpm build
```

## Check the environment

Run the applicable checks and record their actual results:

```bash
pnpm typecheck:demos
pnpm --dir demos/blog typecheck
pnpm --dir demos/blog build
```

## Start development

Run in the development environment:

```bash
pnpm --dir demos/blog dev --host 0.0.0.0
```

Check the documented local health endpoint or page after startup.

## Configuration and work boundaries

- Read the existing `AGENTS.md` and README before changing behavior.
- Put credentials in cloud environment configuration; keep `.env`, private keys, production databases, uploads, and dependency directories out of commits.
- Use synthetic development data. Production deployment and production database operations require a separate request.
- Keep existing APIs, game rules, and authentication behavior.
- Use local checks. Do not add CI or paid GitHub features for this migration.
- Preserve focused branches; do not force-push or overwrite the default branch.

Configuration templates: `apps/aggregator/.env.example`, `apps/release-service/.env.example`, `demos/blog/.env.example`, `infra/discord-bot/.env.example`, `infra/emdash-bot/.env.example`, `infra/flue-review/.env.example`.

- Site source: `demos/blog`. Keep the workspace root when installing dependencies and building shared packages.
- Use a new development SQLite database and sample media; production CMS content is not included.

See the [official cloud environment guide](https://learn.chatgpt.com/docs/environments/cloud-environments) for environment publication and credentials.
