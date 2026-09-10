import { FR_EXACT, FR_PATTERNS } from './catalog.js';

export const LOCALE_STORAGE_KEY = 'gev:locale:v1';
export const SUPPORTED_LOCALES = Object.freeze(['en', 'fr']);

const ATTRS = Object.freeze(['title', 'aria-label', 'aria-valuetext', 'placeholder', 'alt']);
const SKIP_IDS = new Set([
  'hud-summary',
  'cesiumContainer',
  'cesium-credits',
  'cockpit-callsign',
  'radio-station-name',
  'context-radio-mini-station',
  'cockpit-radio-station',
  'location-search',
]);

const originalText = new WeakMap();
const originalAttrs = new WeakMap();

let locale = 'en';
let observer = null;
let applying = false;

function normalizeLocale(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw.startsWith('fr')) return 'fr';
  return 'en';
}

function readStoredLocale(storage) {
  try {
    const store = storage !== undefined
      ? storage
      : (typeof localStorage === 'undefined' ? null : localStorage);
    const stored = store?.getItem?.(LOCALE_STORAGE_KEY);
    if (stored && SUPPORTED_LOCALES.includes(stored)) return stored;
  } catch {
    // Private mode must not block locale selection.
  }
  return null;
}

export function detectLocale({ storage, languages } = {}) {
  const stored = readStoredLocale(storage);
  if (stored) return stored;
  const list = languages
    || (typeof navigator === 'undefined' ? [] : (navigator.languages || [navigator.language]));
  for (const entry of list || []) {
    const next = normalizeLocale(entry);
    if (next === 'fr') return 'fr';
  }
  return 'en';
}

export function getLocale() {
  return locale;
}

export function translateText(text, targetLocale = locale) {
  if (targetLocale !== 'fr') return text;
  if (typeof text !== 'string' || text.length === 0) return text;
  const exact = FR_EXACT[text];
  if (exact) return exact;
  const trimmed = text.trim();
  if (trimmed !== text && FR_EXACT[trimmed]) {
    return text.replace(trimmed, FR_EXACT[trimmed]);
  }
  const statusMatch = text.match(/^(.+): (OFF|ON|LOADING|UNAVAILABLE|DEGRADED|STALE|FALLBACK|KEY REQUIRED)$/);
  if (statusMatch) {
    return `${translateText(statusMatch[1], targetLocale)} : ${translateText(statusMatch[2], targetLocale)}`;
  }
  for (const [pattern, replacement] of FR_PATTERNS) {
    if (pattern.test(text)) return text.replace(pattern, replacement);
  }
  return text;
}

export function t(key, vars) {
  let out = translateText(key);
  if (vars && typeof vars === 'object') {
    for (const [name, value] of Object.entries(vars)) {
      out = out.replaceAll(`{${name}}`, String(value));
    }
  }
  return out;
}

function shouldSkip(node) {
  if (!node || node.nodeType !== 1) return false;
  if (node.closest?.('[data-i18n-skip]')) return true;
  if (SKIP_IDS.has(node.id)) return true;
  const tag = node.tagName;
  return tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'CODE';
}

function translateTextNode(node) {
  if (!node || node.nodeType !== 3) return;
  const parent = node.parentElement;
  if (shouldSkip(parent)) return;
  if (!originalText.has(node)) originalText.set(node, node.nodeValue);
  const source = originalText.get(node);
  const next = translateText(source);
  if (next !== node.nodeValue) node.nodeValue = next;
}

function translateElementAttrs(el) {
  if (shouldSkip(el)) return;
  let bag = originalAttrs.get(el);
  if (!bag) {
    bag = {};
    originalAttrs.set(el, bag);
  }
  for (const attr of ATTRS) {
    if (!el.hasAttribute(attr)) continue;
    if (!(attr in bag)) bag[attr] = el.getAttribute(attr);
    const next = translateText(bag[attr]);
    if (next !== el.getAttribute(attr)) el.setAttribute(attr, next);
  }
}

export function applyDocumentLocale(root = globalThis.document?.documentElement) {
  if (!root || applying) return;
  applying = true;
  try {
    const doc = root.ownerDocument || root;
    if (doc.documentElement) doc.documentElement.lang = locale === 'fr' ? 'fr' : 'en';
    if (doc.title) doc.title = locale === 'fr' ? "God's Eye View" : "God's Eye View";
    const walker = doc.createTreeWalker
      ? doc.createTreeWalker(root, (typeof NodeFilter === 'undefined' ? 1 | 4 : (NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT)))
      : null;
    if (!walker) return;
    let current = walker.currentNode;
    while (current) {
      if (current.nodeType === 3) translateTextNode(current);
      else if (current.nodeType === 1) translateElementAttrs(current);
      current = walker.nextNode();
    }
    syncLangSwitcher(doc);
  } finally {
    applying = false;
  }
}

function syncLangSwitcher(doc) {
  const root = doc.getElementById('lang-switcher');
  if (!root) return;
  for (const button of root.querySelectorAll('[data-locale]')) {
    const active = button.dataset.locale === locale;
    button.setAttribute('aria-pressed', String(active));
    button.classList.toggle('active', active);
  }
}

export function setLocale(next, { storage, persist = true, documentRef } = {}) {
  const resolved = SUPPORTED_LOCALES.includes(next) ? next : 'en';
  locale = resolved;
  if (persist) {
    try {
      const store = storage !== undefined
        ? storage
        : (typeof localStorage === 'undefined' ? null : localStorage);
      store?.setItem?.(LOCALE_STORAGE_KEY, resolved);
    } catch {
      // Persistence is best-effort.
    }
  }
  const doc = documentRef || globalThis.document;
  if (doc?.documentElement) applyDocumentLocale(doc.documentElement);
  try {
    globalThis.dispatchEvent?.(new CustomEvent('gev:locale-changed', { detail: { locale: resolved } }));
  } catch {
    // Tests without CustomEvent / window stay quiet.
  }
  return resolved;
}

function mountLangSwitcher(doc) {
  if (!doc?.getElementById || doc.getElementById('lang-switcher')) return;
  const titleBar = doc.getElementById('title-bar');
  if (!titleBar) return;
  const wrap = doc.createElement('div');
  wrap.id = 'lang-switcher';
  wrap.setAttribute('data-i18n-skip', '');
  wrap.setAttribute('role', 'group');
  wrap.setAttribute('aria-label', 'Language');
  for (const code of SUPPORTED_LOCALES) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.dataset.locale = code;
    button.setAttribute('data-locale', code);
    button.setAttribute('aria-pressed', 'false');
    button.appendChild(doc.createTextNode(code.toUpperCase()));
    wrap.appendChild(button);
  }
  wrap.addEventListener('click', (event) => {
    const button = event.target?.closest?.('[data-locale]');
    if (!button) return;
    setLocale(button.dataset.locale, { documentRef: doc });
  });
  titleBar.appendChild(wrap);
}

function observe(doc) {
  if (!doc?.body || observer || typeof MutationObserver !== 'function') return;
  observer = new MutationObserver((mutations) => {
    if (applying) return;
    for (const mutation of mutations) {
      if (mutation.type === 'characterData') {
        translateTextNode(mutation.target);
      } else if (mutation.type === 'attributes' && ATTRS.includes(mutation.attributeName)) {
        translateElementAttrs(mutation.target);
      } else if (mutation.type === 'childList') {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === 3) translateTextNode(node);
          else if (node.nodeType === 1) applyDocumentLocale(node);
        }
      }
    }
  });
  observer.observe(doc.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: [...ATTRS],
  });
}

export function initI18n({ documentRef, storage, languages } = {}) {
  const doc = documentRef || globalThis.document;
  locale = detectLocale({ storage, languages });
  if (doc) {
    mountLangSwitcher(doc);
    applyDocumentLocale(doc.documentElement);
    observe(doc);
  }
  return locale;
}
