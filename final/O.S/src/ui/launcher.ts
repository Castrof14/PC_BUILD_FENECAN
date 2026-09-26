import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

interface BrowserCandidate {
  name: string;
  executable: string;
}

function windowsBrowsers(): BrowserCandidate[] {
  const roots = [
    process.env['LOCALAPPDATA'],
    process.env['ProgramFiles'],
    process.env['ProgramFiles(x86)'],
  ].filter((value): value is string => typeof value === 'string' && value !== '');

  const relativePaths = [
    ['Microsoft', 'Edge', 'Application', 'msedge.exe'],
    ['Google', 'Chrome', 'Application', 'chrome.exe'],
    ['Microsoft', 'Edge Beta', 'Application', 'msedge.exe'],
  ];

  const candidates: BrowserCandidate[] = [];
  for (const root of roots) {
    for (const parts of relativePaths) {
      const executable = path.join(root, ...parts);
      if (existsSync(executable)) {
        candidates.push({
          name: parts[0] === 'Microsoft' ? 'Edge' : 'Chrome',
          executable,
        });
      }
    }
  }
  return candidates;
}

function macBrowsers(): BrowserCandidate[] {
  return [
    {
      name: 'Chrome',
      executable: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    },
    {
      name: 'Edge',
      executable: '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    },
  ].filter((candidate) => existsSync(candidate.executable));
}

function linuxBrowsers(): BrowserCandidate[] {
  return [
    { name: 'Chrome', executable: '/usr/bin/google-chrome' },
    { name: 'Chrome', executable: '/usr/bin/google-chrome-stable' },
    { name: 'Edge', executable: '/usr/bin/microsoft-edge' },
    { name: 'Chromium', executable: '/usr/bin/chromium' },
  ].filter((candidate) => existsSync(candidate.executable));
}

function findBrowser(): BrowserCandidate | null {
  const candidates =
    process.platform === 'win32'
      ? windowsBrowsers()
      : process.platform === 'darwin'
        ? macBrowsers()
        : linuxBrowsers();
  return candidates[0] ?? null;
}

function profileDir(): string {
  const dir = path.join(os.tmpdir(), 'pcbs-operator-browser-profile');
  mkdirSync(dir, { recursive: true });
  return dir;
}

function openDefaultBrowser(url: string): void {
  if (process.platform === 'win32') {
    spawn('cmd', ['/c', 'start', '""', url], { detached: true, stdio: 'ignore' }).unref();
    return;
  }
  if (process.platform === 'darwin') {
    spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    return;
  }
  spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
}

export interface OpenWindowResult {
  opened: boolean;
  browser: string | null;
  mode: 'app' | 'kiosk' | 'default';
}

export function openOperatorWindow(url: string, kioskMode: boolean): OpenWindowResult {
  const browser = findBrowser();
  if (browser === null) {
    openDefaultBrowser(url);
    return { opened: true, browser: null, mode: 'default' };
  }

  const args = [
    kioskMode ? '--kiosk' : `--app=${url}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-session-crashed-bubble',
    '--disable-features=Translate,MediaRouter',
    `--user-data-dir=${profileDir()}`,
    '--window-size=1600,900',
    url,
  ];

  spawn(browser.executable, args, { detached: true, stdio: 'ignore' }).unref();
  return { opened: true, browser: browser.name, mode: kioskMode ? 'kiosk' : 'app' };
}
