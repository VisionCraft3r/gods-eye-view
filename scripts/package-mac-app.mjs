#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, "dist/God's Eye View.app");
const INSTALL = path.join(os.homedir(), "Applications/God's Eye View.app");
const ELECTRON_APP = path.join(ROOT, 'node_modules/electron/dist/Electron.app');
const ICON_PNG = path.join(ROOT, 'public/app-icon.png');
const MAIN = path.join(ROOT, 'desktop/main.mjs');

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, { encoding: 'utf8', stdio: 'pipe', ...opts });
  if (result.status !== 0) {
    throw new Error(
      `${cmd} ${args.join(' ')} failed:\n${result.stderr || result.stdout || ''}`,
    );
  }
  return result;
}

function writeIcns(pngPath, icnsPath) {
  const iconset = fs.mkdtempSync(path.join(os.tmpdir(), 'gev-iconset-'));
  const sizes = [
    [16, 'icon_16x16.png'],
    [32, 'icon_16x16@2x.png'],
    [32, 'icon_32x32.png'],
    [64, 'icon_32x32@2x.png'],
    [128, 'icon_128x128.png'],
    [256, 'icon_128x128@2x.png'],
    [256, 'icon_256x256.png'],
    [512, 'icon_256x256@2x.png'],
    [512, 'icon_512x512.png'],
    [1024, 'icon_512x512@2x.png'],
  ];
  for (const [size, name] of sizes) {
    run('sips', ['-z', String(size), String(size), pngPath, '--out', path.join(iconset, name)]);
  }
  const namedSet = `${iconset}.iconset`;
  fs.rmSync(namedSet, { recursive: true, force: true });
  fs.renameSync(iconset, namedSet);
  run('iconutil', ['-c', 'icns', namedSet, '-o', icnsPath]);
  fs.rmSync(namedSet, { recursive: true, force: true });
}

if (!fs.existsSync(ELECTRON_APP)) {
  throw new Error('Electron.app is missing. Run npm install first.');
}
if (!fs.existsSync(ICON_PNG)) {
  throw new Error(`Missing Dock icon at ${ICON_PNG}`);
}

fs.mkdirSync(path.dirname(DIST), { recursive: true });
fs.rmSync(DIST, { recursive: true, force: true });
run('cp', ['-R', ELECTRON_APP, DIST]);

const contents = path.join(DIST, 'Contents');
const resources = path.join(contents, 'Resources');
const plist = path.join(contents, 'Info.plist');
const appDir = path.join(resources, 'app');
const icnsPath = path.join(resources, 'electron.icns');

writeIcns(ICON_PNG, icnsPath);
fs.copyFileSync(icnsPath, path.join(resources, 'AppIcon.icns'));

fs.mkdirSync(appDir, { recursive: true });
// Electron joins package.json "main" onto Resources/app and treats a leading
// slash as relative, so an absolute project path becomes
// .../app/Users/.../desktop/main.mjs. Load a local launcher instead.
fs.writeFileSync(
  path.join(appDir, 'electron-main.mjs'),
  `import { pathToFileURL } from 'node:url';\nawait import(pathToFileURL(${JSON.stringify(MAIN)}).href);\n`,
);
fs.writeFileSync(
  path.join(appDir, 'package.json'),
  `${JSON.stringify(
    {
      name: 'gods-eye-view',
      type: 'module',
      main: 'electron-main.mjs',
    },
    null,
    2,
  )}\n`,
);

const replacements = [
  ['CFBundleDisplayName', "God's Eye View"],
  ['CFBundleName', "God's Eye View"],
  ['CFBundleIdentifier', 'com.godseye.view'],
  ['CFBundleIconFile', 'electron.icns'],
];
for (const [key, value] of replacements) {
  run('plutil', ['-replace', key, '-string', value, plist]);
}

fs.mkdirSync(path.dirname(INSTALL), { recursive: true });
fs.rmSync(INSTALL, { recursive: true, force: true });
run('cp', ['-R', DIST, INSTALL]);
run('touch', [INSTALL]);

console.log(`Installed ${INSTALL}`);
console.log(`Launch: open "${INSTALL}"`);
