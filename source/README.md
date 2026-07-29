# ArcheAge Command Center — GitHub Pages edition

This folder contains the editable source for the static GitHub Pages version of
ArcheAge Command Center.

## Local development

Install Node.js 22 or newer and pnpm, then run:

```text
pnpm install
pnpm dev
```

Create a production build with:

```text
pnpm build
```

The generated `dist` folder is the static website.

## Storage and privacy

Tracker data is stored only in the current browser's `localStorage`. Use the
app's JSON export/import controls to move or back up data. A GitHub Pages URL,
a localhost URL, and any other deployment URL each have separate browser data.

## Game-time endpoint

The static edition requests the public AA Classic endpoint directly:
`https://aa-classic.com/api/game/tod`.

To use a compatible CORS-enabled proxy instead, create a `.env.local` file:

```text
VITE_GAME_TIME_URL=https://your-proxy.example/api/game-time
```

Then rebuild the site. All other tracker features remain entirely local.
