# PnL Calendar

A browser-only trading journal. Import broker CSV statements (built and tested against
Thinkorswim / Schwab "Account Statement" exports) and get a monthly/yearly calendar of daily
P&L, per-ticker breakdowns, an equity curve, and an automated review of your trading. No
backend, no login — everything is parsed in the browser and persisted in `localStorage`.

See `PNL_CALENDAR_PROJECT.md` for the full architecture write-up.

## Development

Needs Node.js.

```sh
npm install
npm run dev      # http://localhost:8080
npm run build    # production build (Nitro node-server) → .output
npm run preview  # serve the production build
npm run lint
```

## Built with

- TanStack Start (React 19, TanStack Router file routes)
- Vite, Tailwind CSS v4, shadcn/ui
- `papaparse` for CSV parsing
