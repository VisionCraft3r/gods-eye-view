#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const APP_NAME = "God's Eye View.app";
const APP_PATH = path.join(process.env.HOME || '', 'Applications', APP_NAME);
const FILE_URL = `file://${APP_PATH.replace(/ /g, '%20').replace(/'/g, '%27')}/`;

function dockHasApp() {
  const read = spawnSync('defaults', ['read', 'com.apple.dock', 'persistent-apps'], {
    encoding: 'utf8',
  });
  return /God's Eye View/i.test(read.stdout || '');
}

function pinDock() {
  if (dockHasApp()) {
    console.log('[mac-app] Dock already has God\'s Eye View');
    return;
  }
  const tile = `<dict><key>tile-data</key><dict><key>file-data</key><dict><key>_CFURLString</key><string>${FILE_URL}</string><key>_CFURLStringType</key><integer>15</integer></dict><key>file-label</key><string>God's Eye View</string></dict><key>tile-type</key><string>file-tile</string></dict>`;
  const write = spawnSync('defaults', ['write', 'com.apple.dock', 'persistent-apps', '-array-add', tile], {
    encoding: 'utf8',
  });
  if (write.status !== 0) {
    console.warn('[mac-app] Dock pin failed:', write.stderr || write.stdout);
    return;
  }
  spawnSync('killall', ['Dock'], { stdio: 'inherit' });
  console.log('[mac-app] Pinned God\'s Eye View to the Dock');
}

function restartApp() {
  spawnSync('osascript', ['-e', 'tell application "God\'s Eye View" to quit'], { stdio: 'inherit' });
  spawnSync('sleep', ['1']);
  const opened = spawnSync('open', [APP_PATH], { stdio: 'inherit' });
  if (opened.status !== 0) {
    console.warn('[mac-app] Could not open', APP_PATH);
    return;
  }
  console.log('[mac-app] Relaunched', APP_PATH);
}

pinDock();
restartApp();
