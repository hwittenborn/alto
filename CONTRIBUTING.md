# Contributing to Alto

Thanks for helping out! This guide covers setting up a development environment and how Alto is put together.

## Getting started

```sh
npm install
npm start              # run the app with hot reload
```

| Command                      | What it does                                                                                               |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `npm test`                   | Unit tests, plus multi-client integration tests against local WebDAV servers                               |
| `npm run lint` / `typecheck` | ESLint / TypeScript                                                                                        |
| `npm run format`             | Prettier                                                                                                   |
| `npm run package` / `make`   | Package the app / build `.deb`, `.rpm` and `.zip` distributables                                           |
| `npm run icons`              | Render the PNG icons from the SVGs in `assets/` (`start`, `package` and `make` do this first)              |

Pull requests are squash merged, so their title becomes the commit on `main`. Titles have to follow
[Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) (like `fix: keep the window size`), since
`CHANGELOG.md` and the version bump in each release are generated from them.

These environment variables are handy while developing:

| Variable             | Effect                                                                                                         |
| -------------------- | -------------------------------------------------------------------------------------------------------------- |
| `ALTO_CONFIG_DIR`    | Use a separate configuration directory, so testing doesn't touch your real accounts                            |
| `ALTO_RCLONE`        | Run this rclone binary instead of the bundled one                                                              |
| `ALTO_RCLONE_MIRROR` | Download rclone at build time from a mirror of its releases (like `https://downloads.rclone.org`), not GitHub  |
| `ALTO_DEBUG=1`       | Verbose logs                                                                                                   |
| `ALTO_THEME`         | Look like another system: `adwaita` (GNOME), `whitesur` (macOS before Tahoe) or `mactahoe` (macOS 26 and later) |
| `GTK_JS_DIR`         | Build the UI against a gtk-js checkout (after `vp run build:packages` there), to use changes it hasn't released |

## Project layout

Alto is split into packages so the sync engine can be reused outside Electron (in a React Native app, for example):

| Path             | Contents                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------ |
| `packages/core`  | `@alto/core`: platform-independent rclone rc client, providers, sync planner and engine, state, RPC    |
| `packages/node`  | `@alto/node`: Node adapters for the rclone daemon, the local file system (chokidar) and SQLite storage |
| `packages/react` | `@alto/react`: renderer-independent React hooks over the Alto state                                    |
| `src/`           | The Electron app: the main process (tray, notifications, autostart, sign-in page) and the gtk-js UI    |

## How it works

### Themes

The UI is gtk-js: libadwaita's widgets, in the theme of the system Alto runs on (`src/renderer/theme.tsx`).
On Linux that's Adwaita; on macOS it's the MacTahoe GTK and icon themes from macOS 26 (Tahoe) and the WhiteSur ones
before, with the window buttons on the left. A macOS theme and its icons load only on macOS, so they don't slow
down starting up elsewhere.

The macOS themes' providers aren't in a gtk-js release yet: until they are, build against a gtk-js checkout with
`GTK_JS_DIR`. Without it, Alto shows Adwaita there.

### rclone

Alto ships with its own copy of rclone, pinned by `RCLONE_VERSION` in `packages/node/src/rclone-install.ts`.
`npm start`, `npm run package` and `npm run make` download that release into `.rclone/<arch>/` the first time (and
reuse it after that), checking it against the release's checksums. Packaged builds include it as
`resources/bin/rclone`, and `npm start` runs it straight from `.rclone/`. To move to another rclone release, change
`RCLONE_VERSION`.

Alto then runs its own `rclone rcd`, on a random localhost port with random credentials, and talks to it over HTTP:

- File operations (listing, copying, hashing, deleting) go through rclone's `operations/*` calls.
- Logins go through `config/create`, and OAuth providers follow up with `config/oauthstatus`.
- Progress comes from `core/stats`.

### Sync cycles

Each sync cycle:

1. Lists both sides.
2. Applies changes to `.altoignore` first.
3. Plans every path from its local state, its remote state and the state each side had after the last sync. The rule
   table is in `packages/core/src/sync/planner.ts`.
4. Executes the plan, checking right before each overwrite or deletion that the item hasn't changed since it was
   listed.

The last synced state is stored in SQLite. A full cycle runs every 30 seconds and on demand. Local changes reported by
the file watcher are synced half a second after they stop, comparing only the changed paths.

## Adding a provider

Alto can sync with anything rclone has a [backend](https://rclone.org/overview/) for, so adding a provider is mostly
a matter of describing how to log in to it. Everything lives in `packages/core/src/providers.ts`:

1. Add an ID to `ProviderId`.
2. Add an entry to `PROVIDERS`: its name, its rclone backend type, whether it logs in through the browser (`oauth`)
   or a form (`credentials`), the form's fields, and its brand color and icon.
3. Add a case to `buildRemoteConfig`, which turns the login form into the rclone remote's parameters. TypeScript
   reports the missing case until you do.
4. Add a case to `detectProvider`, so existing rclone remotes of that kind are recognized.
5. If the account has a useful short description (like `alice@cloud.example.com`), add it to `describeAccount`.

Then, outside of `providers.ts`:

- If its logo is in [selfh.st/icons](https://selfh.st/icons), set `iconSlug` (and `color: 'FFFFFF'`) and import it
  into `LOGOS` in `src/renderer/providers.tsx`. Without one, the provider gets a generic folder icon.
- If a field needs more than a required check, add the validation to `packages/core/src/validation.ts`.
- Add the provider to the list in the README.
