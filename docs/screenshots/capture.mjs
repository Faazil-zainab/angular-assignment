/**
 * Genuine screenshot harness for the MPloyChek assessment.
 *
 * Captures real screenshots from the running application - no mockups and no
 * placeholder images. It uses only what the toolchain already provides:
 *
 *   - Node's built-in global `fetch` and `WebSocket` (no Puppeteer/Playwright)
 *   - the locally installed Chrome, driven over the DevTools Protocol
 *   - a tiny static file server for the built SPA
 *
 * Prerequisites (run from the repository root):
 *
 *   1. API:      cd backend && node dist/server.js          # serves :3000
 *      (build first: npm --prefix backend run build)
 *   2. Frontend: npm --prefix frontend run build -- --configuration development
 *      The development configuration points `apiBaseUrl` at http://localhost:3000
 *      and that origin is already in the backend CORS allow list.
 *   3. Chrome installed in its default location (see CHROME_CANDIDATES).
 *
 * Then:  node docs/screenshots/capture.mjs
 *
 * Output: PNG files written next to this script.
 */

import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const WEB_ROOT = path.join(REPO_ROOT, 'frontend', 'dist', 'frontend', 'browser');
const PROFILE_DIR = path.join(HERE, '.chrome-profile');

const SPA_ORIGIN = 'http://localhost:4200';
const API_ORIGIN = 'http://localhost:3000';
const DEBUG_PORT = 9222;

const DESKTOP = { width: 1440, height: 1000 };
const TABLET = { width: 768, height: 1024 };
const MOBILE = { width: 390, height: 844 };

/** Demo accounts, read from the backend seed fixtures (`seed.service.ts`). */
const ACCOUNTS = {
  admin: { userId: 'admin001', password: 'Admin@123', role: 'ADMIN' },
  general: { userId: 'user001', password: 'User@123', role: 'GENERAL_USER' },
};

const CHROME_CANDIDATES = [
  path.join(process.env['PROGRAMFILES'] ?? 'C:/Program Files', 'Google/Chrome/Application/chrome.exe'),
  path.join(process.env['PROGRAMFILES(X86)'] ?? 'C:/Program Files (x86)', 'Google/Chrome/Application/chrome.exe'),
  path.join(process.env['LOCALAPPDATA'] ?? '', 'Google/Chrome/Application/chrome.exe'),
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.map': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
};

const log = (message) => console.log(`  ${message}`);

/* -------------------------------------------------------------------------- */
/* Static server for the built SPA                                            */
/* -------------------------------------------------------------------------- */

function startStaticServer() {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? '/', SPA_ORIGIN);
    const requested = path.join(WEB_ROOT, decodeURIComponent(url.pathname));
    // Anything that is not a real file (e.g. /dashboard, /admin/users) is served
    // the SPA shell, which is what `ng serve` and a production static host do.
    const isFile = path.extname(requested) !== '' && existsSync(requested);
    const file = isFile ? requested : path.join(WEB_ROOT, 'index.html');

    response.setHeader('Content-Type', MIME[path.extname(file)] ?? 'application/octet-stream');
    response.setHeader('Cache-Control', 'no-store');
    response.end(readFileSync(file));
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    // No host: binds IPv4 *and* IPv6. Chrome resolves `localhost` to ::1 first,
    // so binding 127.0.0.1 only would serve a connection error page instead.
    server.listen(4200, () => resolve(server));
  });
}

/* -------------------------------------------------------------------------- */
/* Minimal DevTools Protocol client                                            */
/* -------------------------------------------------------------------------- */

class CdpClient {
  #socket;
  #nextId = 0;
  #pending = new Map();
  #listeners = new Map();

  constructor(socket) {
    this.#socket = socket;
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== undefined) {
        const entry = this.#pending.get(message.id);
        if (entry === undefined) return;
        this.#pending.delete(message.id);
        if (message.error) {
          entry.reject(new Error(`${message.error.message ?? 'CDP error'}`));
        } else {
          entry.resolve(message.result);
        }
        return;
      }
      for (const listener of this.#listeners.get(message.method) ?? []) {
        listener(message.params, message.sessionId);
      }
    });
  }

  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', () => reject(new Error('CDP socket failed')), { once: true });
    });
    return new CdpClient(socket);
  }

  on(method, listener) {
    const listeners = this.#listeners.get(method) ?? [];
    listeners.push(listener);
    this.#listeners.set(method, listeners);
  }

  send(method, params = {}, sessionId) {
    const id = ++this.#nextId;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      this.#socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Capture session                                                            */
/* -------------------------------------------------------------------------- */

class CaptureSession {
  constructor(client, sessionId) {
    this.client = client;
    this.sessionId = sessionId;
    this.viewport = { ...DESKTOP };
    this.heldRequests = [];
    this.diagnostics = [];
  }

  /**
   * Records page errors, so a failed assertion explains itself instead of just
   * timing out. Console errors from the SPA are also worth seeing here.
   */
  async enableDiagnostics() {
    this.client.on('Log.entryAdded', (params, sessionId) => {
      if (sessionId !== this.sessionId || params.entry.level !== 'error') return;
      this.diagnostics.push(`[${params.entry.source}] ${params.entry.text} ${params.entry.url ?? ''}`);
    });
    this.client.on('Runtime.consoleAPICalled', (params, sessionId) => {
      if (sessionId !== this.sessionId || params.type !== 'error') return;
      const text = params.args.map((arg) => arg.value ?? arg.description ?? '').join(' ');
      this.diagnostics.push(`[console] ${text}`);
    });
    await this.send('Log.enable');
  }

  /** Prints what the page actually contains when a wait fails. */
  async reportDiagnostics() {
    const state = await this
      .evaluate(
        `JSON.stringify({
           url: location.href,
           title: document.title,
           readyState: document.readyState,
           appRootChildren: document.querySelector('app-root')?.children.length ?? -1,
           appRootText: (document.body?.innerText ?? '').replace(/\\s+/g, ' ').slice(0, 200),
         })`,
      )
      .catch((error) => `(diagnostics unavailable: ${error.message})`);

    console.log(`  page state: ${state}`);
    for (const line of this.diagnostics.slice(-10)) {
      console.log(`  ! ${line}`);
    }
  }

  send(method, params) {
    return this.client.send(method, params, this.sessionId);
  }

  async evaluate(expression, { awaitPromise = false } = {}) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise,
      returnByValue: true,
      userGesture: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description ?? 'evaluate failed');
    }
    return result.result?.value;
  }

  /** Polls an in-page predicate until it is true (or the timeout elapses). */
  async waitFor(expression, { timeoutMs = 20_000, label = expression } = {}) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await this.evaluate(`(() => { try { return Boolean(${expression}); } catch { return false; } })()`)) {
        return;
      }
      await sleep(150);
    }
    await this.reportDiagnostics();
    throw new Error(`timed out waiting for: ${label}`);
  }

  async setViewport({ width, height }) {
    this.viewport = { width, height };
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 600,
    });
  }

  async goto(route) {
    await this.send('Page.navigate', { url: `${SPA_ORIGIN}${route}` });
    await this.waitFor('document.readyState === "complete"', { label: `load ${route}` });
  }

  /** Signs in over the real API and stores the session the SPA expects. */
  async signIn(account) {
    const session = await this.evaluate(
      `(async () => {
         const response = await fetch('${API_ORIGIN}/api/auth/login', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify(${JSON.stringify(account)}),
         });
         const body = await response.json();
         if (!body.success) { return { error: JSON.stringify(body.error) }; }
         sessionStorage.setItem('mploychek.auth.session', JSON.stringify(body.data));
         return { token: body.data.token, role: body.data.user.role };
       })()`,
      { awaitPromise: true },
    );

    if (session?.error) {
      throw new Error(`sign-in failed for ${account.userId}: ${session.error}`);
    }
    return session;
  }

  /** Full-page screenshot: expands the viewport to the page height first. */
  async captureFullPage(name) {
    const metrics = await this.send('Page.getLayoutMetrics');
    const contentHeight = Math.ceil(
      Math.min(metrics.cssContentSize?.height ?? this.viewport.height, 6000),
    );
    await this.send('Emulation.setDeviceMetricsOverride', {
      width: this.viewport.width,
      height: Math.max(contentHeight, this.viewport.height),
      deviceScaleFactor: 1,
      mobile: this.viewport.width < 600,
    });
    await sleep(300);
    const shot = await this.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    await this.setViewport(this.viewport);
    await sleep(150);
    await this.writePng(name, shot.data);
  }

  /** Viewport-sized screenshot (used for the responsive evidence shots). */
  async captureViewport(name) {
    const shot = await this.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    await this.writePng(name, shot.data);
  }

  async writePng(name, base64) {
    const buffer = Buffer.from(base64, 'base64');
    const file = path.join(HERE, name);
    await fs.writeFile(file, buffer);
    const { width, height } = pngSize(buffer);
    console.log(`  ✓ ${name.padEnd(32)} ${width}×${height}  ${(buffer.length / 1024).toFixed(0)} kB`);
  }

  /** Presses Tab through the real input pipeline. */
  async pressTab() {
    for (const type of ['rawKeyDown', 'keyUp']) {
      await this.send('Input.dispatchKeyEvent', {
        type,
        key: 'Tab',
        code: 'Tab',
        windowsVirtualKeyCode: 9,
        nativeVirtualKeyCode: 9,
      });
    }
  }

  /** true when the page itself does not scroll sideways. */
  async checkNoHorizontalOverflow(report, label) {
    const measured = JSON.parse(
      await this.evaluate(
        `JSON.stringify({ scroll: document.documentElement.scrollWidth, viewport: window.innerWidth })`,
      ),
    );
    report.record(
      `${label}: no horizontal overflow`,
      measured.scroll <= measured.viewport + 1,
      `document ${measured.scroll}px vs viewport ${measured.viewport}px`,
    );
  }

  /**
   * Verifies the shell switched layout: compact viewports must expose the
   * hamburger that opens the overlay drawer, wide ones must not.
   */
  async checkNavigationMode(report, label, expected) {
    const measured = JSON.parse(
      await this.evaluate(
        `JSON.stringify({
           hamburger: !!document.querySelector('button[aria-label="Open navigation menu"]'),
           primaryNav: !!document.querySelector('nav[aria-label="Primary navigation"]'),
           pageTitle: !!document.querySelector('.topbar__title'),
         })`,
      ),
    );
    const compact = measured.hamburger;
    report.record(
      `${label}: ${expected} navigation layout`,
      compact === (expected === 'compact'),
      compact ? 'drawer toggle present' : 'drawer toggle absent (docked sidebar)',
    );
    report.record(
      `${label}: primary nav landmark present`,
      measured.primaryNav && measured.pageTitle,
      'nav[aria-label="Primary navigation"] + topbar context',
    );
  }

  /** Verifies the KPI row reflows instead of overflowing. */
  async checkKpiColumns(report, label, minimum) {
    const tracks = await this.evaluate(`(() => {
      const grid = document.querySelector('section.kpis');
      if (!grid) return -1;
      return getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length;
    })()`);
    report.record(
      `${label}: KPI cards in >= ${minimum} column(s)`,
      tracks >= minimum,
      `${tracks} column(s)`,
    );
  }

  /** Landmarks, headings and table semantics that assistive technology relies on. */
  async checkSemantics(report, label) {
    const result = JSON.parse(await this.evaluate(`(() => {
      const count = (selector) => document.querySelectorAll(selector).length;
      return JSON.stringify({
        main: count('main'),
        nav: count('nav[aria-label]'),
        headings: count('h1, h2, h3'),
        tableHeaders: count('th[scope="col"]'),
        liveRegions: count('[role="status"], [role="alert"], [aria-live]'),
        decorativeIcons: count('mat-icon[aria-hidden="true"]'),
      });
    })()`));
    report.record(
      `${label}: semantic structure present`,
      result.main > 0 && result.nav > 0 && result.headings > 0 && result.tableHeaders > 0,
      `${result.main} main, ${result.nav} labelled nav, ${result.headings} headings, ` +
        `${result.tableHeaders} th[scope], ${result.liveRegions} live regions, ` +
        `${result.decorativeIcons} aria-hidden icons`,
    );
  }

  /** Runs the automated contrast audit on the current page. */
  async checkContrast(report, label) {
    const result = JSON.parse(await this.evaluate(CONTRAST_PROBE));
    report.record(
      `${label}: text contrast meets WCAG AA`,
      result.failing.length === 0,
      result.failing.length === 0
        ? `${result.sampled} text elements sampled`
        : `${result.failing.length} below threshold: ${result.failing
            .map((row) => `${row.className || row.text}=${row.value}:1`)
            .join(', ')}`,
    );
  }

  /** Every control needs an accessible name and every icon button a label. */
  async checkAccessibleNames(report, label) {
    const result = JSON.parse(await this.evaluate(ACCESSIBLE_NAME_PROBE));
    report.record(
      `${label}: form controls are labelled`,
      result.unlabeledControls === 0,
      `${result.controls - result.unlabeledControls}/${result.controls} labelled`,
    );
    report.record(
      `${label}: buttons have accessible names`,
      result.unnamedButtons.length === 0,
      result.unnamedButtons.length === 0
        ? `${result.buttons} buttons`
        : `unnamed: ${result.unnamedButtons.join(', ')}`,
    );
  }

  /**
   * Tabs through the page and confirms keyboard focus is reachable and that the
   * browser treats it as keyboard focus (`:focus-visible`), which is what the
   * app's focus styles are written against.
   */
  async checkKeyboardFocus(report, label, stops = 8) {
    await this.evaluate(`document.activeElement instanceof HTMLElement && document.activeElement.blur()`);
    const visited = [];
    const withoutFocusVisible = [];

    for (let index = 0; index < stops; index += 1) {
      await this.pressTab();
      await sleep(200);
      const state = await this.evaluate(`(() => {
        const element = document.activeElement;
        if (!element || element === document.body) return '';
        return JSON.stringify({
          tag: element.tagName.toLowerCase(),
          name: (element.getAttribute('aria-label') || element.getAttribute('name') || element.textContent || '')
            .trim()
            .slice(0, 20),
          focusVisible: element.matches(':focus-visible'),
        });
      })()`);
      if (!state) break;
      const parsed = JSON.parse(state);
      visited.push(parsed);
      if (!parsed.focusVisible) withoutFocusVisible.push(`${parsed.tag}:${parsed.name}`);
    }

    const focusables = ['input', 'select', 'textarea', 'button', 'a'];
    const interactive = visited.filter((entry) => focusables.includes(entry.tag)).length;
    report.record(
      `${label}: Tab reaches interactive elements`,
      visited.length >= 3 && interactive === visited.length,
      `${interactive}/${visited.length} stops interactive`,
    );
    report.record(
      `${label}: keyboard focus matches :focus-visible`,
      visited.length > 0 && withoutFocusVisible.length === 0,
      withoutFocusVisible.length === 0
        ? `${visited.length} stops, all :focus-visible`
        : `not matched on ${withoutFocusVisible.join(', ')}`,
    );
  }

  /**
   * Answers "is there a visible focus indicator?" by comparing rendered pixels:
   * every focusable control is photographed while unfocused and again while it
   * holds keyboard focus, and the two images must differ.
   *
   * Inspecting computed styles is not enough. Material paints focus indicators on
   * *sibling* and pseudo elements (the text-field outline, the line ripple, the
   * button focus ring), which an element-plus-ancestors style walk cannot see, so
   * this compares what the browser actually draws. Animations, transitions and
   * the text caret are neutralised first, leaving the focus state as the only
   * thing that can move a pixel in the sampled region.
   */
  async checkFocusIndicator(report, label, stops = 6) {
    await this.evaluate(`(() => {
      const style = document.createElement('style');
      style.textContent = '*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }';
      document.head.appendChild(style);
    })()`);
    await sleep(250);

    const rects = JSON.parse(await this.evaluate(`(() => {
      const selector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
      window.__mcFocusRects = [...document.querySelectorAll(selector)]
        .filter((element) => element.offsetParent !== null && element.getBoundingClientRect().width > 0)
        .map((element, index) => {
          element.setAttribute('data-mc-probe', String(index));
          const box = element.getBoundingClientRect();
          return {
            left: box.left + window.scrollX,
            top: box.top + window.scrollY,
            width: box.width,
            height: box.height,
          };
        });
      return JSON.stringify(window.__mcFocusRects);
    })()`));

    // Reference shots taken while nothing holds focus.
    const unfocused = [];
    for (const rect of rects) {
      unfocused.push(await this.captureClip(rect));
    }

    await this.evaluate(`document.activeElement instanceof HTMLElement && document.activeElement.blur()`);
    const withoutIndicator = [];
    let compared = 0;

    for (let index = 0; index < Math.min(stops, rects.length); index += 1) {
      await this.pressTab();
      await sleep(200);
      const focused = await this.evaluate(`(() => {
        const element = document.activeElement;
        if (!element || element === document.body) return '';
        return JSON.stringify({
          probe: element.getAttribute('data-mc-probe'),
          tag: element.tagName.toLowerCase(),
          name: (element.getAttribute('aria-label') || element.getAttribute('name') || element.textContent || '')
            .trim()
            .slice(0, 20),
        });
      })()`);
      if (!focused) break;

      const parsed = JSON.parse(focused);
      const rect = rects[Number(parsed.probe)];
      if (rect === undefined) continue;

      compared += 1;
      if ((await this.captureClip(rect)) === unfocused[Number(parsed.probe)]) {
        withoutIndicator.push(`${parsed.tag}:${parsed.name}`);
      }
    }

    report.record(
      `${label}: focus is visible (pixel diff)`,
      compared > 0 && withoutIndicator.length === 0,
      withoutIndicator.length === 0
        ? `${compared} controls changed on focus`
        : `no rendered change on ${withoutIndicator.join(', ')}`,
    );
  }

  /** Screenshots a page rectangle, padded so an offset outline is included. */
  async captureClip(rect, padding = 8) {
    const shot = await this.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: true,
      clip: {
        x: Math.max(rect.left - padding, 0),
        y: Math.max(rect.top - padding, 0),
        width: rect.width + padding * 2,
        height: rect.height + padding * 2,
        scale: 1,
      },
    });
    return shot.data;
  }

  /** Holds API responses so the UI's loading state stays on screen. */
  async holdApi() {
    await this.send('Fetch.enable', { patterns: [{ urlPattern: `${API_ORIGIN}/api/*` }] });
    this.client.on('Fetch.requestPaused', (params, sessionId) => {
      if (sessionId !== this.sessionId) return;
      this.heldRequests.push(params.requestId);
    });
  }

  async releaseApi() {
    for (const requestId of this.heldRequests.splice(0)) {
      await this.send('Fetch.failRequest', { requestId, errorReason: 'Aborted' }).catch(() => {});
    }
    await this.send('Fetch.disable').catch(() => {});
  }
}

/** Reads width/height from the PNG IHDR chunk. */
function pngSize(buffer) {
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

/**
 * Collects pass/fail results for the interface checks that run alongside the
 * screenshots. These measure what a screenshot can only suggest - overflow,
 * navigation mode, contrast, labels and focus rings - so the accessibility and
 * responsiveness requirements can be reported as verified rather than assumed.
 */
class CheckReport {
  constructor() {
    this.results = [];
  }

  record(name, ok, detail = '') {
    this.results.push({ name, ok });
    console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? `  (${detail})` : ''}`);
  }

  get failures() {
    return this.results.filter((result) => !result.ok);
  }
}

/**
 * Simplified automated contrast audit: for every rendered leaf element that holds
 * text, resolves the nearest opaque background and compares WCAG AA thresholds
 * (4.5:1, or 3:1 for large text). Solid surfaces only - it cannot judge text over
 * gradients or images.
 */
const CONTRAST_PROBE = `
(() => {
  const parse = (value) => {
    const open = value.indexOf('(');
    if (open === -1) return null;
    const parts = value.slice(open + 1, value.indexOf(')')).split(',').map((part) => parseFloat(part));
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
  };
  const effectiveBackground = (element) => {
    let node = element;
    while (node) {
      const background = parse(getComputedStyle(node).backgroundColor);
      if (background && background.a >= 0.95) return background;
      node = node.parentElement;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  };
  const channel = (value) => {
    const scaled = value / 255;
    return scaled <= 0.03928 ? scaled / 12.92 : Math.pow((scaled + 0.055) / 1.055, 2.4);
  };
  const luminance = (colour) =>
    0.2126 * channel(colour.r) + 0.7152 * channel(colour.g) + 0.0722 * channel(colour.b);
  const ratio = (a, b) => {
    const first = luminance(a);
    const second = luminance(b);
    const high = Math.max(first, second);
    const low = Math.min(first, second);
    return (high + 0.05) / (low + 0.05);
  };

  const failing = [];
  let sampled = 0;
  for (const element of document.querySelectorAll('body *')) {
    if (element.children.length > 0) continue;
    const text = (element.textContent || '').trim();
    if (text.length < 2) continue;
    const style = getComputedStyle(element);
    if (style.visibility === 'hidden' || style.display === 'none') continue;
    if (parseFloat(style.opacity) < 0.5) continue;
    const box = element.getBoundingClientRect();
    if (box.width < 4 || box.height < 4) continue;
    const colour = parse(style.color);
    if (!colour) continue;

    const size = parseFloat(style.fontSize);
    const bold = parseInt(style.fontWeight, 10) >= 700;
    const large = size >= 24 || (size >= 18.66 && bold);
    const minimum = large ? 3 : 4.5;
    const value = Math.round(ratio(colour, effectiveBackground(element)) * 100) / 100;
    sampled += 1;
    if (value < minimum) {
      failing.push({ text: text.slice(0, 24), className: String(element.className).slice(0, 32), value, minimum });
    }
  }
  return JSON.stringify({ sampled, failing: failing.slice(0, 6) });
})()`;

/** Counts form controls without an accessible name and buttons without a label. */
const ACCESSIBLE_NAME_PROBE = `
(() => {
  const named = (element) =>
    Boolean(element.getAttribute('aria-label')) ||
    Boolean(element.getAttribute('aria-labelledby')) ||
    Boolean(element.getAttribute('title')) ||
    (element.labels && element.labels.length > 0);
  const controls = [...document.querySelectorAll('input, select, textarea')];
  const buttons = [...document.querySelectorAll('button')];
  return JSON.stringify({
    controls: controls.length,
    unlabeledControls: controls.filter((element) => !named(element)).length,
    buttons: buttons.length,
    unnamedButtons: buttons
      .filter((element) => !named(element) && (element.textContent || '').trim().length === 0)
      .map((element) => element.className || element.tagName),
  });
})()`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function findChrome() {
  for (const candidate of CHROME_CANDIDATES) {
    if (candidate && existsSync(candidate)) return candidate;
  }
  throw new Error('Chrome was not found. Install it or add a path to CHROME_CANDIDATES.');
}

async function waitForDevTools(attempts = 40) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
      if (response.ok) return (await response.json()).webSocketDebuggerUrl;
    } catch {
      /* not up yet */
    }
    await sleep(250);
  }
  throw new Error('Chrome DevTools endpoint never became available.');
}

/* -------------------------------------------------------------------------- */
/* Main                                                                       */
/* -------------------------------------------------------------------------- */

async function main() {
  if (!existsSync(WEB_ROOT)) {
    throw new Error(
      `SPA build not found at ${WEB_ROOT}\n` +
        'Run: npm --prefix frontend run build -- --configuration development',
    );
  }

  console.log('MPloyChek screenshot capture\n');
  const server = await startStaticServer();
  log(`static server ready on ${SPA_ORIGIN}`);

  await fs.rm(PROFILE_DIR, { recursive: true, force: true });
  const chrome = spawn(
    findChrome(),
    [
      '--headless',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--hide-scrollbars',
      '--remote-allow-origins=*',
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--user-data-dir=${PROFILE_DIR}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  const report = new CheckReport();
  let client;
  try {
    const browserSocket = await waitForDevTools();
    client = await CdpClient.connect(browserSocket);
    log('connected to headless Chrome');

    const { targetId } = await client.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await client.send('Target.attachToTarget', { targetId, flatten: true });
    const session = new CaptureSession(client, sessionId);

    await session.send('Page.enable');
    await session.send('Runtime.enable');
    await session.enableDiagnostics();

    // Honours the app's own reduced-motion support, which makes the shots
    // deterministic instead of catching entrance animations mid-flight.
    await session.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    });
    await session.setViewport(DESKTOP);

    console.log('\nDesktop shots');

    // 1. Login (public route, no session needed).
    await session.goto('/auth/login');
    await session.waitFor("document.querySelector('form') !== null", { label: 'login form' });
    await sleep(400);
    await session.captureFullPage('01-login.png');
    console.log('\nVerification - login screen');
    await session.checkAccessibleNames(report, 'login');
    await session.checkKeyboardFocus(report, 'login');
    await session.checkFocusIndicator(report, 'login', 7);
    await session.checkNoHorizontalOverflow(report, 'login');

    // 2. General user dashboard - only that user's own records.
    await session.signIn(ACCOUNTS.general);
    log('signed in as user001 (GENERAL_USER)');
    await session.goto('/dashboard');
    await session.waitFor("document.querySelectorAll('table.records-table tbody tr').length > 0", {
      label: 'general user records',
    });
    await sleep(400);
    await session.captureFullPage('02-dashboard-general-user.png');

    // 3. Admin dashboard - all records.
    await session.signIn(ACCOUNTS.admin);
    log('signed in as admin001 (ADMIN)');
    await session.goto('/dashboard');
    await session.waitFor("document.querySelectorAll('table.records-table tbody tr').length > 0", {
      label: 'admin records',
    });
    await sleep(400);
    await session.captureFullPage('03-dashboard-admin.png');
    console.log('\nVerification - dashboard at 1440px');
    await session.checkNavigationMode(report, 'desktop', 'docked');
    await session.checkKpiColumns(report, 'desktop', 3);
    await session.checkContrast(report, 'dashboard');
    await session.checkAccessibleNames(report, 'dashboard');
    await session.checkKeyboardFocus(report, 'dashboard');
    await session.checkSemantics(report, 'dashboard');

    // 4. Admin user management.
    await session.goto('/admin/users');
    await session.waitFor("document.querySelectorAll('table.user-table tbody tr').length > 0", {
      label: 'user management rows',
    });
    await sleep(400);
    await session.captureFullPage('04-admin-user-management.png');
    console.log('\nVerification - user management');
    await session.checkAccessibleNames(report, 'admin');
    await session.checkContrast(report, 'user management');
    await session.checkKeyboardFocus(report, 'admin');
    await session.checkSemantics(report, 'user management');

    // 5. API loading state: hold the next API response so the skeletons stay up.
    await session.holdApi();
    await session.goto('/dashboard');
    await session.waitFor("document.querySelector('.skeleton') !== null", { label: 'skeletons' });
    await sleep(400);
    await session.captureViewport('05-api-loading-state.png');
    await session.releaseApi();

    // 6/7. Responsive evidence - the same live page at tablet and mobile widths.
    console.log('\nResponsive shots');
    await session.goto('/dashboard');
    await session.waitFor("document.querySelectorAll('table.records-table tbody tr').length > 0", {
      label: 'records after reload',
    });
    await session.setViewport(TABLET);
    await sleep(500);
    await session.captureViewport('06-dashboard-tablet.png');
    console.log('\nVerification - tablet 768px');
    await session.checkNavigationMode(report, 'tablet', 'compact');
    await session.checkNoHorizontalOverflow(report, 'tablet');
    await session.checkKpiColumns(report, 'tablet', 1);
    await session.setViewport(MOBILE);
    await sleep(500);
    await session.captureViewport('07-dashboard-mobile.png');
    console.log('\nVerification - mobile 390px');
    await session.checkNavigationMode(report, 'mobile', 'compact');
    await session.checkNoHorizontalOverflow(report, 'mobile');
    await session.checkKpiColumns(report, 'mobile', 1);
    await session.checkContrast(report, 'mobile dashboard');

    await session.setViewport(DESKTOP);
    await session.goto('/auth/login');
    await sleep(300);
  } finally {
    await client?.send('Browser.close').catch(() => {});
    chrome.kill();
    server.close();
    await sleep(400);
    await fs.rm(PROFILE_DIR, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
  }

  const passed = report.results.length - report.failures.length;
  console.log(`\nInterface checks: ${passed}/${report.results.length} passed`);
  for (const failure of report.failures) {
    console.log(`  ✗ ${failure.name}`);
  }
  console.log('\nDone. Screenshots written to docs/screenshots/.');
  if (report.failures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`\nCapture failed: ${error.message}`);
  process.exitCode = 1;
});
