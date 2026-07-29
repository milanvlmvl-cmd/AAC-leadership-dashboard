# ArcheAge Command Center

A local-first ArcheAge Classic leadership tracker, event planner, attendance
history, raid calendar, and hero-call timer.

The website is already built for GitHub Pages. No command line, build step, or
GitHub Action is required.

## Publish it through the GitHub website

1. Create a new repository on GitHub. A public repository is the simplest
   choice for GitHub Pages.
2. Open the repository and select **Add file → Upload files**.
3. Drag **everything inside this folder** into the upload area. Upload the
   contents, not the outer `ArcheAge-Command-Center-GitHub-Pages` folder.
4. Commit the files directly to the `main` branch.
5. Open **Settings → Pages**.
6. Under **Build and deployment**, choose **Deploy from a branch**.
7. Select the `main` branch and the `/(root)` folder, then select **Save**.
8. Wait for GitHub to show the published address on the same Pages screen.

Your address will normally look like:

```text
https://YOUR-USERNAME.github.io/YOUR-REPOSITORY/
```

Official help:

- [Upload files in your browser](https://docs.github.com/en/get-started/start-your-journey/uploading-a-project-to-github)
- [Configure a GitHub Pages publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

## What is in this repository

- `index.html`, `assets/`, and the other root files are the ready-to-host app.
- `404.html` keeps the app usable if GitHub Pages falls back to its not-found
  page.
- `.nojekyll` tells GitHub to serve the prebuilt files unchanged.
- `source/` contains the editable React/TypeScript source and its own development
  notes. GitHub Pages does not need to build it.

## Data and backups

All character and tracker data stays in the browser's local storage. Use
**Manage → Export backup** in the app before clearing browser data or moving to
another browser, device, or website address. Import that JSON backup at the new
address to restore the tracker.

The GitHub Pages address has separate browser storage from localhost and from
the private hosted version.

## In-game clock

GitHub Pages cannot run a server-side API proxy, so this edition requests the
public AA Classic game-time endpoint directly. If that endpoint is temporarily
unavailable or blocked by the browser, the tracker keeps using the most recent
successful synchronization and all other features remain available.
