# export.ps1 — Static export for GitHub Pages (cv_meister)
# Builds the SvelteKit app with adapter-static into docs/ so it can be served
# from https://<user>.github.io/cv_meister/.
#
# This project keeps its SvelteKit config inside vite.config.ts (no
# svelte.config.js), so the script temporarily swaps vite.config.ts, prerenders
# the single client page, copies build/ -> docs/, and restores everything.
param(
    [string]$BasePath = "/cv_meister"
)

$ErrorActionPreference = 'Stop'

Write-Host "=== cv_meister Export fuer GitHub Pages ===" -ForegroundColor Cyan
Write-Host "Base path: $BasePath"
Write-Host "Output:    docs/"
Write-Host ""

# 1. Install adapter-static if needed
if (-not (Test-Path 'node_modules/@sveltejs/adapter-static')) {
    Write-Host "[1/4] Installing @sveltejs/adapter-static..." -ForegroundColor Yellow
    npm install -D @sveltejs/adapter-static
} else {
    Write-Host "[1/4] @sveltejs/adapter-static already installed" -ForegroundColor Green
}

# 2. Backup current vite.config.ts and create an export config
Write-Host "[2/4] Creating export config..." -ForegroundColor Yellow
$origConfig = Get-Content 'vite.config.ts' -Raw

$exportConfig = @"
import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries.
				runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
			},
			// GitHub Pages project site -> app lives under the repo base path.
			paths: { base: '$BasePath' },
			adapter: adapter({ pages: 'build', assets: 'build', fallback: null, precompress: false, strict: false })
		})
	]
});
"@

Set-Content 'vite.config.ts' $exportConfig
# Prerender the route so adapter-static has an index.html to serve.
Set-Content 'src/routes/+layout.ts' "export const prerender = true;`n"

try {
    # 3. Build
    Write-Host "[3/4] Building static export..." -ForegroundColor Yellow
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "Build failed" }

    # 4. Deploy to docs/ folder
    Write-Host "[4/4] Deploying to docs/..." -ForegroundColor Yellow

    if (Test-Path 'docs') {
        Remove-Item 'docs/*' -Recurse -Force -ErrorAction SilentlyContinue
    } else {
        New-Item -ItemType Directory -Path 'docs' | Out-Null
    }

    Copy-Item 'build/*' 'docs/' -Recurse -Force

    # Disable Jekyll: without this, GitHub Pages ignores _app/ folder
    Set-Content 'docs/.nojekyll' ''

    Write-Host ""
    Write-Host "=== Done! ===" -ForegroundColor Cyan
    if (Test-Path 'docs') {
        $size = (Get-ChildItem 'docs' -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1KB
        Write-Host "Deployed to docs/ ($([math]::Round($size, 0)) KB)" -ForegroundColor Green
    }
} finally {
    # Restore original vite.config.ts
    Set-Content 'vite.config.ts' $origConfig
    Remove-Item 'src/routes/+layout.ts' -Force -ErrorAction SilentlyContinue
    Remove-Item 'build' -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "Cleaned up" -ForegroundColor DarkGray
}
