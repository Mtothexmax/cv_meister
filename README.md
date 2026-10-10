https://mtothexmax.github.io/cv_meister
# sv

Everything you need to build a Svelte project, powered by [`sv`](https://github.com/sveltejs/cli).

## Creating a project

If you're seeing this, you've probably already done this step. Congrats!

```sh
# create a new project
npx sv create my-app
```

To recreate this project with the same configuration:

```sh
# recreate this project
npx sv@0.17.1 create --template minimal --types ts --install npm .
```

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```sh
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Building

There are three build targets. They share one SvelteKit frontend; only the base
path and the packaging differ.

| Target | Command | Output |
| --- | --- | --- |
| Web (GitHub Pages) | `.\export.ps1` | `docs/` (base `/cv_meister`) |
| Windows desktop (Tauri) | `npx tauri build` | `src-tauri/target/release/` |
| Android APK (Tauri) | `.\apk-export.ps1` | `apk/cv-meister-<version>-aarch64-release.apk` |

`npm run dev` and `npm run build` stay plain Vite/SvelteKit.

The frontend is built for Tauri by `scripts/tauri-frontend.mjs`, which
temporarily swaps `vite.config.ts` for an adapter-static variant with `base: ""`
and restores it afterwards — the same technique `export.ps1` uses for the Pages
base path, so the two never interfere.

### Shell behaviour (Tauri vs. web)

The shell is not a web page, so two things differ. Both are keyed off `isTauri()`
in `src/lib/platform.ts`:

- **The editor opens directly.** There is no newsletter to sign up for inside
  the app, so the marketing landing page is skipped. An explicit `#start` still
  wins, which keeps the editor's "Startseite" link working in the shell too.
- **`connect-src` allows any `https:` host.** A logo URL is arbitrary and cannot
  be whitelisted ahead of time; without this the fetch is refused by the CSP and
  surfaces as the bare `TypeError: Failed to fetch`. Every other directive stays
  as strict as before.

Verified against the real WebView2, not a browser:

```bash
.workbuddy-ai/run-tauri.sh
```

That builds a throwaway debug app with the remote debugging port baked in, then
runs `.workbuddy-ai/verify-tauri.mjs` against it. The port cannot be enabled via
`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` — Tauri sets that itself — hence the
`--config` override on a throwaway build rather than a change to
`tauri.conf.json`.

### Android prerequisites (once)

```powershell
winget install EclipseAdoptium.Temurin.17.JDK
$sdk = "$env:LOCALAPPDATA\Android\Sdk"
# cmdline-tools from https://developer.android.com/studio#command-line-tools-only,
# unpacked to $sdk\cmdline-tools\latest
& "$sdk\cmdline-tools\latest\bin\sdkmanager.bat" "platform-tools" `
    "platforms/android-37.0" "build-tools/37.0.0" "ndk/27.0.12077973"
rustup target add aarch64-linux-android
```

`apk-export.ps1` creates a self-signed keystore in `apk/` on its first run and
reuses it. **Keep `apk/cv-meister-release.jks` and `apk/keystore.properties`** —
Android ties app updates to the signing key, so losing them means an installed
copy can never be updated in place.
