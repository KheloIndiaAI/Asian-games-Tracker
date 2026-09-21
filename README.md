# Cheer4Bharat

Asian Games 2026 results tracker, focused on India's results, medals and schedule.

## Development

Requires Node.js 22 and npm.

```sh
git clone <this-repository-url>
cd asian-games
npm install
cp .env.example .env   # fill in DATABASE_URL and the app's secret keys
npm run dev
```

The ingest scheduler (`src/worker`) runs as a separate process — see
`npm run worker` / `npm run worker:dev`.

## Database

Schema and migrations live in `drizzle/`, managed with `drizzle-kit`:

```sh
npm run db:generate   # after changing drizzle/schema.ts
npm run db:migrate    # apply pending migrations to DATABASE_URL
```

## Deployment

Hosted on AWS — see [`docs/AWS_MIGRATION.md`](docs/AWS_MIGRATION.md) for the
target architecture and [`infra/README.md`](infra/README.md) for the
Terraform + systemd + GitHub Actions setup that provisions and deploys it.

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS
- Drizzle ORM + PostgreSQL
