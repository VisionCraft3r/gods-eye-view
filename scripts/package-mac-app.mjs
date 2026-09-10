#!/usr/bin/env node
import { mkdirSync, writeFileSync, chmodSync, copyFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP_NAME = "God's Eye View.app";
const DIST = path.join(ROOT, 'dist', APP_NAME);
const CONTENTS = path.join(DIST, 'Contents');
const MACOS = path.join(CONTENTS, 'MacOS');
const RESOURCES = path.join(CONTENTS, 'Resources');
const ICONSET = path.join(ROOT, 'dist', 'GodsEye.iconset');

function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
}

async function buildIcon() {
  const raster = path.join(ROOT, 'public/app-icon.png');
  const svg = path.join(ROOT, 'public/logo.svg');
  const source = existsSync(raster) ? raster : svg;
  ensureDir(ICONSET);
  const sizes = [16, 32, 64, 128, 256, 512, 1024];
  for (const size of sizes) {
    const png = await sharp(source).resize(size, size, {
      fit: 'cover',
      background: { r: 7, g: 11, b: 16, alpha: 1 },
    }).png().toBuffer();
    writeFileSync(path.join(ICONSET, `icon_${size}x${size}.png`), png);
    if (size <= 512) {
      writeFileSync(path.join(ICONSET, `icon_${size}x${size}@2x.png`), png);
    }
  }
  const icns = path.join(RESOURCES, 'AppIcon.icns');
  const result = spawnSync('iconutil', ['-c', 'icns', '-o', icns, ICONSET], { stdio: 'inherit' });
  if (result.status !== 0) {
    console.warn('[mac-app] iconutil unavailable; the app will use the default Electron icon.');
  }
}

ensureDir(MACOS);
ensureDir(RESOURCES);

const launcher = `#!/bin/bash
set -euo pipefail
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
ROOT=${JSON.stringify(ROOT)}
cd "$ROOT"
if [[ ! -x "$ROOT/node_modules/.bin/electron" ]]; then
  osascript -e 'display alert "God'"'"'s Eye View" message "Dependencies are missing. Open Terminal in the project folder and run npm install." as critical'
  exit 1
fi
exec "$ROOT/node_modules/.bin/electron" "$ROOT/desktop/main.mjs"
`;

writeFileSync(path.join(MACOS, 'GodsEye'), launcher);
chmodSync(path.join(MACOS, 'GodsEye'), 0o755);

writeFileSync(path.join(CONTENTS, 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>God's Eye View</string>
  <key>CFBundleDisplayName</key><string>God's Eye View</string>
  <key>CFBundleIdentifier</key><string>com.godseye.view</string>
  <key>CFBundleVersion</key><string>0.1.1</string>
  <key>CFBundleShortVersionString</key><string>0.1.1</string>
  <key>CFBundleExecutable</key><string>GodsEye</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSSupportsAutomaticGraphicsSwitching</key><true/>
</dict>
</plist>
`);

writeFileSync(path.join(CONTENTS, 'PkgInfo'), 'APPLGEV1');

await buildIcon();

if (existsSync(path.join(ROOT, 'public/logo.svg'))) {
  copyFileSync(path.join(ROOT, 'public/logo.svg'), path.join(RESOURCES, 'logo.svg'));
}
if (existsSync(path.join(ROOT, 'public/app-icon.png'))) {
  copyFileSync(path.join(ROOT, 'public/app-icon.png'), path.join(RESOURCES, 'app-icon.png'));
}

const applications = path.join(process.env.HOME || '', 'Applications', APP_NAME);
ensureDir(path.dirname(applications));
spawnSync('rm', ['-rf', applications], { stdio: 'inherit' });
spawnSync('cp', ['-R', DIST, applications], { stdio: 'inherit' });

console.log(`Mac app ready:\n  ${DIST}\n  ${applications}`);
