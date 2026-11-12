# ChangeKite · GridRinse · WebhookTrail

Monorepo for three independently deployable SaaS products. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Requirements

Node.js 22+ (developed on 24). No Docker or local Postgres needed: development and tests use PGlite (Postgres in WASM).

## Commands

```bash
npm install
npm test                 # all workspaces
npm run typecheck
npm run dev:changekite    # http://localhost:3001
npm run dev:gridrinse   # http://localhost:3002
npm run dev:webhooktrail    # http://localhost:3003
```

Each app has its own `.env.example` and README.

## Docs

- [Architecture](docs/ARCHITECTURE.md)
- [Roadmap and status](docs/ROADMAP.md)
- [Operating costs](docs/COSTS.md)
- [Owner and operator actions](docs/OWNER-ACTIONS.md)
