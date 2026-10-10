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
