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

`apk-export.ps1` needs no separate icon step — it copies the tracked launcher icon
set from `src-tauri/android/res/` on every run. Only a *changed favicon* needs
`src-tauri/android/make-icons.sh`; see "App icon (Android)" below.

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

Android differs from the desktop shell as well, in the places where a browser API is
simply not there — reading the clipboard, handing a draft to Gmail, and downloading
or opening a file. `isAndroidApp()` in the same file answers that, and the sections
*Clipboard*, *"In Gmail öffnen"* and *Saving and opening files* below describe what
runs behind it. Google's sign-in is the mirror image: it works in a browser and
nowhere else, so that button is hidden in the Android app.

Verified against the real WebView2, not a browser:

```bash
.workbuddy-ai/run-tauri.sh
```

That builds a throwaway debug app with the remote debugging port baked in, then
runs `.workbuddy-ai/verify-tauri.mjs` against it. The port cannot be enabled via
`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` — Tauri sets that itself — hence the
`--config` override on a throwaway build rather than a change to
`tauri.conf.json`.

The browser side of the Typst question has its own guard. It renders the built
frontend in desktop Chrome with **no COOP/COEP headers at all**, which is exactly
the situation every real user is in, and so fails if the app ever starts
requiring cross-origin isolation:

```bash
BASE_URL=http://127.0.0.1:4180/cv_meister .workbuddy-ai/run-suite.sh verify-typst-engine 9231
```

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

### Android emulator (no device needed)

```powershell
.\emulator-start.ps1                 # restart the emulator, install the APK, launch the app
.\emulator-start.ps1 -NoRestart      # push a new APK into the running emulator (no reboot)
.\emulator-start.ps1 -Build          # rebuild the APK first
```

The emulator needs an **x86_64** APK: an x86_64 host cannot run an arm64 guest at
all (`Avd's CPU Architecture 'arm64' is not supported by the QEMU2 emulator on
x86_64 host`), so `-Target x86_64` is the default here, while `apk-export.ps1`
keeps arm64 for real devices.

Emulator setup (once) — the *image* matters, see the WebView note below. Mind the
two different separators, `sdkmanager` wants `/` and `avdmanager` wants `;`:

```powershell
& "$sdk\cmdline-tools\latest\bin\sdkmanager.bat" "emulator" `
    "system-images/android-37.0/google_apis/x86_64"
echo no | & "$sdk\cmdline-tools\latest\bin\avdmanager.bat" create avd -n cv-meister-37 `
    -k "system-images;android-37.0;google_apis;x86_64" -d pixel_7
```

> **Android needs Android System WebView 137 or newer.** Typst runs in
> `typst-wasm`, which has exactly two backends: the *worker* backend needs
> `SharedArrayBuffer`, i.e. cross-origin isolation, and the *JSPI* backend needs
> `WebAssembly.Suspending`/`promising`, which shipped in Chrome 137.
>
> Below that version the Android WebView grants **neither**, and no configuration
> changes that. Measured on the emulator against a real HTTP response on a
> trustworthy origin (`http://localhost` via `adb reverse`), with
> `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy:
> require-corp` *confirmed on the wire*, a WebView 124 still reported
> `crossOriginIsolated=false` and `typeof SharedArrayBuffer === "undefined"` —
> while the same page renders fine in desktop Chrome 143 with no COOP/COEP at all,
> because 143 has JSPI. Adding COOP/COEP to `security.headers` therefore buys
> nothing on Android and *breaks* the desktop logo fetch, so the Tauri config
> deliberately carries no such headers.
>
> Consequences:
>
> - **Emulator:** use the API 37 AVD (`-Avd cv-meister-37`, WebView 145). The API
>   35 image ships WebView 124 and API 36 ships 133; on both, preview and PDF
>   export cannot work.
> - **Real devices** update WebView through the Play Store and are normally far
>   past 137.
> - Below 137 the app explains this in plain language instead of surfacing the
>   library's "No compatible typst-wasm backend" message — see
>   `explainMissingBackend()` in `src/lib/typst.ts`.

The Android build is verified against the real WebView too, not a browser. It
needs a **debug** APK, because only debug builds expose the WebView devtools
socket (`wry` gates `setWebContentsDebuggingEnabled` behind `debug_assertions`):

```bash
node .workbuddy-ai/verify-android.mjs de.cvmeister.app.debug
```

It checks the engine capability first (JSPI or `SharedArrayBuffer`) and then the
user-visible outcome: the preview reaches "Bereit" with real SVG pages.

#### System bars (status bar / gesture bar)

From `targetSdk 35` on, Android draws the window **behind** the status and
navigation bars (edge-to-edge) and expects the app to inset its own content.
Nothing did, so the status-bar clock sat on top of the app's header and the
gesture bar over the bottom edge.

Opting out is not an option: `windowOptOutEdgeToEdgeEnforcement` only applies at
target 35 and is ignored from 36 on, and this project targets 37. The content
therefore has to be inset — and it is done in **web code**, not in the generated
Android project, because `src-tauri/gen` is gitignored and a fix in
`MainActivity.kt` would silently disappear on the next `tauri android init`.

| File | What it does |
| --- | --- |
| `src/app.html` | `viewport-fit=cover` in the viewport meta. Without it `env(safe-area-inset-*)` resolves to `0px` and nothing else can work. |
| `src/routes/layout.css` | `.safe-area` (all four insets as padding) and `.safe-sticky` (for the landing's sticky header, which would otherwise slide under the status bar when scrolling). |
| `src/routes/+page.svelte` | `.safe-area` on the editor root and on the drawer — the drawer is `position: fixed`, so it does not inherit the root's inset. |
| `src/lib/Landing.svelte` | `.safe-area` on the landing root, `.safe-sticky` on its header. |

The editor's `<main>` uses `h-full` rather than `h-dvh`: the root already
carries the inset, so `100dvh` there would be exactly that much too tall.

`env()` is `0px` wherever there are no system bars, so the desktop Tauri window,
the web build and the browser suites are unaffected.

Measured on the API 37 image: status bar **52px**, gesture bar **24px**. The
Android suite asserts both that the root carries the inset *and* that the app's
header actually starts below the status bar — two checks on purpose, because
"the rule is missing" and "the content did not move" fail for different reasons.
`.workbuddy-ai/safe-area-probe.mjs` proves the check can go red by stripping the
class at runtime: header at `y=0` without it, `y=52` with it.

#### Clipboard (pasting JSON back in)

The whole JSON workflow is copy → paste into a prompt → paste the answer back, so
it lives or dies by the clipboard. On Android the WebView **permanently refuses to
read** it: `clipboard-read` reports `denied` and there is no consent UI to change
that, so `navigator.clipboard.readText()` rejects with `NotAllowedError`. Nothing
the app can do from web code fixes that — it is not a missing permission in the
manifest but one the WebView will never grant.

In the shell, reading therefore goes through Tauri's `clipboard-manager` plugin,
which uses Android's `ClipboardManager` and needs no permission at all.

| Where | What |
| --- | --- |
| `src/lib/clipboard.ts` | `readClipboardText()`: plugin inside the shell, `navigator.clipboard` on the web. |
| `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs` | the plugin and its registration |
| `src-tauri/capabilities/default.json` | `clipboard-manager:allow-read-text` — **read only** |

Writing deliberately stays on the WebView path. It works everywhere, and routing
it natively would additionally make Android pop its system clipboard preview on
every copy — a visible change nobody asked for.

Two details worth keeping:

- The plugin **rejects** on an empty clipboard (`Clipboard is empty`) instead of
  returning `""`, and rejects a non-text clip. `lib/clipboard.ts` maps exactly
  those two answers to `""` so the caller's own "clipboard is empty" message
  fires; otherwise every empty paste would claim the access was denied and send
  the user hunting for a permission problem that does not exist.
- No `@tauri-apps/api` dependency: the plugin's wrapper only does
  `invoke('plugin:clipboard-manager|read_text')`, and `__TAURI_INTERNALS__.invoke`
  is exactly what that wraps. `platform.ts` avoids the package for the same
  reason — it would be dead weight in the Pages build.

`.workbuddy-ai/verify-clipboard-android.mjs` checks it on the device: the WebView
read fails (the red proof), an empty clipboard reports *empty* rather than
*denied*, and a real touch on the app's own "JSON kopieren" ends with the plugin
reading back the very JSON the app wrote. It uses real touch events, not mouse
events — on Android a CDP mouse event is not a user activation.

#### "In Gmail öffnen" (Android only)

Alongside the plain text and the `.eml` file, the Android app offers a third way
out: a pre-filled draft inside Gmail, attachments and all.

That cannot be done from web code. `navigator.share` is not implemented in the
Android WebView, and a `mailto:` link carries recipient, subject and body but
**no attachments** — and the attachments are the point of an application mail.
So the Android build hands the message over through a native Android
`ACTION_SEND` intent, the same thing a native mail app would do.

| Where | What |
| --- | --- |
| `src-tauri/src/gmail_share.rs` | the intent: writes the PDFs to the cache, turns them into `content://` URIs, fires `ACTION_SEND` |
| `src/lib/gmailShare.ts` | `openDraftInGmail()` — builds the payload; the bytes travel as base64 because IPC is JSON |
| `src/lib/platform.ts` | `isAndroidApp()` — the button exists in the Android app and nowhere else |
| `src/routes/+page.svelte` | the button next to the `.eml` download |

Details that cost time and should not be undone:

- The PDFs are written to the **cache directory** first. A receiving app can only
  read a `content://` URI, and that only exists for a file that is really on disk.
  `FileProvider` makes the URI: its authority is `<applicationId>.fileprovider`
  (so it differs in a debug build — hence read, not assumed) and the exposed paths
  come from the generated manifest, where `<cache-path path="." />` covers the
  whole cache directory.
- Android grants read access **only** through `ClipData`, not through
  `EXTRA_STREAM` — and every stream has to be in the clip. With just the first one
  in it, Gmail reports "permission denied" for the rest.
- `Intent.setClipData` returns **`void`**, not the intent. Every other setter here
  returns the intent, so passing the `…Landroid/content/Intent;` signature is the
  natural mistake — and JNI looks a method up by name *and* signature, so it does
  not fail at compile time but at runtime with `NoSuchMethodError`. The signature
  is therefore written out at each call site rather than derived.
- `FileProvider` is an app class, and `FindClass` on a native thread only resolves
  boot-class-path names. The class is loaded through the application's own class
  loader instead.
- **R8 deletes `FileProvider.getUriForFile` in the release build.** The method is
  reached only from native code, by name, so to the shrinker it is unreachable and
  gets stripped — the APK still builds, and the failure shows up only on a device,
  as `NoSuchMethodError`, which the app reports as „Android hat den Aufruf abgelehnt:
  java exception was thrown“. The debug build does not minify, so this survived every
  check until a release APK was actually run. The keep rule lives in the *tracked*
  `src-tauri/android/proguard-jni.pro` (the generated project is gitignored, so a rule
  placed there would vanish on the next `tauri android init`); `apk-export.ps1` copies
  it in before the build **and** asserts afterwards that the method really is in the
  dex. A broken release APK must not reach `apk/` looking fine.
- `apkanalyzer dex packages --defined-only` prints methods as
  `…FileProvider android.net.Uri getUriForFile(…)` — the return type sits *between*
  class and method, so a pattern expecting the two names side by side never matches.
  The build guard was red for that reason, not because of the dex.
- The context behind `ndk_context` is the **application** context (that is what
  `tao` stores), so the intent needs `FLAG_ACTIVITY_NEW_TASK`.
- The code lives in tracked Rust, not in `src-tauri/gen` (gitignored): a Kotlin
  change there would vanish on the next `tauri android init`.
- Gmail is targeted in two steps, and the first one is the one that matters:
  `setClassName("com.google.android.gm", "…ComposeActivityGmailExternal")`, then —
  if that fails — `setPackage` for the whole package, then the system chooser. The
  class name is needed because Gmail answers `ACTION_SEND_MULTIPLE` from **two**
  activities (its composer and Google Chat's `DynamiteDeepLinkMultiple`), so the
  package alone leaves Android showing its resolver instead of going straight to
  the composer.
- There is deliberately **no "is Gmail installed?" query** before the attempt. From
  API 30 on, package visibility hides other apps unless they are declared under
  `<queries>` in the manifest, so `getLaunchIntentForPackage` answers "not
  installed" while Gmail is sitting right there. *Starting* a foreign activity is
  not affected by that filtering, so the code just tries and falls back.
- "Mit Google versenden" (the Gmail **API**, the other send route) is deliberately
  **not rendered in the Android app** at all. It needs Google Identity Services,
  which collects the consent in a *popup* — the Android WebView has none, so
  `requestAccessToken()` simply never calls back and the button would sit on
  "Wird versendet…" forever; Google refuses embedded webviews for the redirect flow
  outright ("disallowed_useragent"). `canUseGoogleSignIn()` in `platform.ts` is the
  gate, and the CDP suite has a red proof that the button *is* there once the user
  agent is not Android's. It stays the browser's route, not the phone's.

The check is split across two files, and that split is load-bearing:

| File | Role |
| --- | --- |
| `.workbuddy-ai/verify-gmail-android.sh` | everything that needs `adb`: clear the hand-over dir, stop Gmail, count the files, read the foreground window |
| `.workbuddy-ai/verify-gmail-cdp.mjs` | everything that needs the WebView: the button, its geometry, the click, the user-agent red proof |

Node cannot spawn a process in this sandbox (`spawnSync … EBUSY`, for `adb.exe`,
`cmd.exe` and node itself alike), so an `execFileSync(adb, …)` inside the script
fails silently into whatever `try/catch` wraps it. With the `adb` half living in
Node, every device-side assertion read as "passed" while checking nothing. Keep the
`adb` calls in the shell.

Together they check 14 things: the button is present, visible *and inside the
viewport*, it becomes enabled once the PDFs are computed, the app reports no error,
it hands over **exactly as many files as the preview lists as attachments**, each
one a non-empty PDF, and Gmail really reaches the foreground — with a red proof
that it was not in the foreground before. A second red proof overrides the user
agent to a desktop one and re-checks that the button disappears, which is what
keeps "Android only" honest.

The check runs against the release build as well
(`PACKAGE=de.cvmeister.app … verify-gmail-android.sh`) — and it has to, because two
of its steps only ever mattered on a **freshly installed** app, and both fail
silently:

- The Bewerbungsliste is a drawer below `md`. Closed it sits at negative `x` — with
  `offsetParent` set and a real width, so any "is it in the DOM?" test passes while
  the touch lands beside the window and does nothing. The harness opens it through
  `#nav-toggle` and waits until an entry is genuinely on screen.
- The one-time JSON hint (`#json-hint`, `fixed inset-0 z-50`) opens the first time a
  visitor is inside a Bewerbung and swallows **every** touch. It is dismissed once
  and remembered in localStorage, so a used install never shows it again — the debug
  build had clicked it away long ago. The harness taps "Verstanden" like a user.

Reading the hand-over folder needs `run-as`, which works only for *debuggable*
packages: against the release build it answers `package not debuggable`. On a
userdebug emulator `adbd` runs as root, so the script reads the same path directly
instead — without that fallback, three file checks fail against a release build that
is working perfectly.

#### Saving and opening files (Android only)

Every download button in the app — the two PDFs, the attachments, the `.eml` and
the workspace JSON — and the attachment's "Öffnen" both go through **one** helper,
`downloadBlob()` in `+page.svelte`. That is why the Android detour lives in that
one place: in the WebView both are silent no-ops.

| Where | What |
| --- | --- |
| `src-tauri/src/file_share.rs` | `save_file` writes into the public Downloads collection, `open_file` fires `ACTION_VIEW` on a `content://` URI |
| `src-tauri/src/android.rs` | the JNI plumbing `gmail_share.rs` and `file_share.rs` share: the context, `FileProvider`, `jni_error` |
| `src/lib/fileShare.ts` | `saveFileNatively()` / `openFileNatively()`; `hasNativeFiles()` is the gate |
| `src/routes/+page.svelte` | `downloadBlob()` and `openAttachment()` branch on it; `#saved-note` reports where the file landed |

Details that cost time and should not be undone:

- **A download in the Android WebView is a no-op, not an error.** `a[download]` on a
  `blob:` URL has no download manager behind it: no file, no exception, nothing to
  log. `location.href = blob:` has no PDF viewer to land in either. Both look exactly
  like a click that worked, which is why this went unnoticed — and why the harness
  asserts on a file that appears on disk rather than on the absence of an error.
- **`MediaStore` needs no permission from API 29 on**, which is the whole reason the
  download works at all. Inserting into `MediaStore.Downloads.EXTERNAL_CONTENT_URI`
  and writing through `openOutputStream` only ever touches a row the app created
  itself, so `WRITE_EXTERNAL_STORAGE` is not requested — a permission prompt for one
  download button is not worth it. Below API 29 the file goes to the app's own
  external folder and the full path is reported instead.
- The row is inserted **pending** (`is_pending = 1`) and only published afterwards.
  Without that the Downloads app can pick it up while the stream is still open and
  show a truncated file.
- `ContentResolver.insert` answers **`null`** rather than throwing when the row cannot
  be created, so that case is checked explicitly; otherwise it surfaces much later as
  a `NullPointerException` on the stream.
- `setDataAndType(uri, mime)` in **one** call — `setData` alone resets the type to
  `null`, and a null type makes the receiver refuse the URI.
- There is deliberately **no `createChooser` fallback** for `ACTION_VIEW`.
  `startActivity` already shows Android's own resolver when several apps match and
  starts the single match directly, so the fallback could only ever be reached when
  there is *nothing* to choose — a sentence the user can act on is better than an
  empty chooser. (The Gmail intent keeps its chooser: there the fallback really is
  reached when Gmail is not installed.)
- The download is **silent**, so the app shows `#saved-note` with the location. Without
  it "saved somewhere" and "swallowed" look identical, which is the exact complaint
  that started this.
- `downloadBlob()` had to become `async`, and every caller now `await`s it. Left
  unawaited the button would clear its busy state before the write finished, and a
  rejection would escape the surrounding `try/catch` as an unhandled one.

The check is again split the same way: `.workbuddy-ai/verify-files-android.sh` (all
`adb`) drives `.workbuddy-ai/verify-files-cdp.mjs` (all WebView). The device side
records what is in `/sdcard/Download` **before** the run and asserts that a *new*
`.pdf` and a *new* `.eml` appeared — a stale file from an earlier run cannot make it
pass. The "Öffnen" proof is the `logcat` line, not the foreground window: it looks for
`android.intent.action.VIEW` together with `application/pdf` and our `fileprovider`
authority, which holds whether or not a PDF viewer is installed on the emulator.

#### App icon (Android)

The launcher icon is the app's own favicon — `src/lib/assets/favicon.svg` is the single
source of truth, and `src-tauri/android/make-icons.sh` rasterises it into every density
of the tracked icon set in `src-tauri/android/res/`. Change the favicon, re-run the
script, and the app icon follows. `apk-export.ps1` merges that tree into the generated
project before every build, for the same reason as the proguard rules: `src-tauri/gen`
is gitignored, so anything placed only there is gone after the next `tauri android init`
and the app would ship Tauri's default logo again.

The generated project has **no `mipmap-anydpi-v26`** at all, so before this the app used
the legacy raster on every API level — and a legacy icon is drawn shrunken on a white
plate, which is why the debug build's icon looks like a pale dot. Adding the adaptive
icon is what makes it a proper full-bleed tile.

Details that cost time:

- An adaptive icon's two layers are **108×108 dp**, but the launcher only shows the
  central **72×72 dp** of that canvas and masks it to its own shape; the 66 dp circle
  inside that is the safe zone. So "the same look as the favicon" means the letters must
  cover the same fraction of *that 72 dp*, not of the 108 dp canvas. Sizing them against
  the canvas makes them visibly too small — 61 % of 108 dp is not 61 % of the tile.
- The background layer is **full-bleed** and the foreground carries only the letters. A
  rounded square drawn into the layer would show its own corners inside a circular mask.
- `getBBox()` on an SVG `<text>` returns the **layout** box (advance widths, full
  ascent + descent), roughly 1.5× the ink box. Solving the font size from it makes the
  letters come out ~66 % of the intended width. `make-icons.sh` measures real pixels
  instead and re-reads the PNG it just wrote to assert the result — that assertion is
  what caught the first, wrong version.
- `Copy-Item -Recurse` pointed at a *directory* whose destination already exists nests
  it (`res/res/…`). The merge needs `-Path (Join-Path $src '*')`.
- AGP's resource optimisations **rename** resource files inside the APK (`res/0M.xml`),
  so an APK check cannot look for `res/mipmap-anydpi-v26/ic_launcher.xml`. Verify the
  icon on a device instead.
- Tauri's manifest template does not set `android:roundIcon`, so `ic_launcher_round.*`
  is currently not consulted — the launcher masks `ic_launcher` itself. The files are
  kept so the resource set is complete; switching is a one-line manifest change.
- Chrome has to be launched by the shell wrapper: Node cannot spawn a process here, and
  a Chrome started with `&` dies when the tool call returns.

`apk-export.ps1` creates a self-signed keystore in `apk/` on its first run and
reuses it. **Keep `apk/cv-meister-release.jks` and `apk/keystore.properties`** —
Android ties app updates to the signing key, so losing them means an installed
copy can never be updated in place.
