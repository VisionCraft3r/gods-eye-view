import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectLocale,
  getLocale,
  initI18n,
  setLocale,
  t,
  translateText,
  LOCALE_STORAGE_KEY,
} from './index.js';

function memoryStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
  };
}

function textNode(value) {
  return { nodeType: 3, nodeValue: value, parentElement: null };
}

function element(tag, attrs = {}, children = []) {
  const el = {
    nodeType: 1,
    tagName: tag.toUpperCase(),
    id: attrs.id || '',
    attributes: { ...attrs },
    children,
    classList: {
      tokens: new Set(),
      toggle(name, force) {
        if (force) this.tokens.add(name);
        else this.tokens.delete(name);
      },
    },
    dataset: {},
    parentElement: null,
    hasAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attributes, name); },
    getAttribute(name) { return this.attributes[name] ?? null; },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    closest(selector) {
      if (selector === '[data-i18n-skip]' && this.hasAttribute('data-i18n-skip')) return this;
      return this.parentElement?.closest?.(selector) || null;
    },
    querySelectorAll(selector) {
      const out = [];
      const walk = (node) => {
        if (node.nodeType !== 1) return;
        if (selector === '[data-locale]' && node.dataset.locale) out.push(node);
        for (const child of node.children || []) walk(child);
      };
      walk(this);
      return out;
    },
    appendChild(child) {
      child.parentElement = this;
      this.children = this.children || [];
      this.children.push(child);
      if (child.id && this.ownerDocument) this.ownerDocument._byId.set(child.id, child);
      return child;
    },
    addEventListener() {},
  };
  for (const child of children) {
    if (child.nodeType === 3) child.parentElement = el;
    else child.parentElement = el;
  }
  return el;
}

function fakeDocument() {
  const subtitle = element('p', { class: 'subtitle' }, [textNode('NO PLACE LEFT BEHIND')]);
  const probe = element('span', { id: 'probe' }, [textNode('DATA LAYERS')]);
  const titleBar = element('div', { id: 'title-bar' }, [
    element('h1', {}, [textNode("GOD'S EYE VIEW")]),
    subtitle,
  ]);
  const body = element('body', {}, [titleBar, probe]);
  const html = element('html', {}, [body]);
  const byId = new Map([['title-bar', titleBar], ['probe', probe]]);
  const doc = {
    documentElement: html,
    body,
    title: "God's Eye View",
    _byId: byId,
    getElementById(id) { return byId.get(id) || null; },
    createElement(tag) {
      const el = element(tag);
      el.ownerDocument = this;
      return el;
    },
    createTextNode(value) { return { nodeType: 3, nodeValue: value, parentElement: null }; },
    createTreeWalker(root) {
      const nodes = [];
      const walk = (node) => {
        nodes.push(node);
        if (node.nodeType === 1) {
          for (const child of node.children || []) walk(child);
        }
      };
      walk(root);
      let index = 0;
      return {
        currentNode: root,
        nextNode() {
          index += 1;
          return nodes[index] || null;
        },
      };
    },
  };
  html.ownerDocument = doc;
  body.ownerDocument = doc;
  titleBar.ownerDocument = doc;
  probe.ownerDocument = doc;
  return { doc, probe, subtitle, titleBar };
}

test('French catalog covers chrome, layers, and parameterized key-setup copy', () => {
  assert.equal(translateText('DATA LAYERS', 'fr'), 'COUCHES DE DONNÉES');
  assert.equal(translateText('Live Flights', 'fr'), 'Vols en direct');
  assert.equal(translateText('Choose your first view', 'fr'), 'Choisissez votre première vue');
  assert.equal(translateText('POWER UP · 3 KEYS WAITING', 'fr'), 'MISE SOUS TENSION · 3 CLÉS EN ATTENTE');
  assert.equal(translateText('POWER UP · 1 KEY WAITING', 'fr'), 'MISE SOUS TENSION · 1 CLÉ EN ATTENTE');
  assert.equal(translateText('paste GOOGLE_MAPS_API_KEY', 'fr'), 'coller GOOGLE_MAPS_API_KEY');
  assert.equal(translateText('DATA LAYERS', 'en'), 'DATA LAYERS');
});

test('locale detection prefers a stored choice, then French system languages', () => {
  assert.equal(detectLocale({
    storage: memoryStorage({ [LOCALE_STORAGE_KEY]: 'fr' }),
    languages: ['en-US'],
  }), 'fr');
  assert.equal(detectLocale({
    storage: memoryStorage(),
    languages: ['fr-FR', 'en'],
  }), 'fr');
  assert.equal(detectLocale({
    storage: memoryStorage(),
    languages: ['en-GB'],
  }), 'en');
});

test('initI18n mounts an EN/FR switcher and rewrites live DOM text', () => {
  const { doc, probe, subtitle } = fakeDocument();
  const storage = memoryStorage();
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, init) {
      this.type = type;
      this.detail = init?.detail;
    }
  };
  globalThis.dispatchEvent = () => {};

  initI18n({ documentRef: doc, storage, languages: ['en-US'] });
  assert.equal(getLocale(), 'en');
  assert.ok(doc.getElementById('lang-switcher'));
  assert.equal(probe.children[0].nodeValue, 'DATA LAYERS');

  setLocale('fr', { documentRef: doc, storage });
  assert.equal(doc.documentElement.lang, 'fr');
  assert.equal(probe.children[0].nodeValue, 'COUCHES DE DONNÉES');
  assert.equal(subtitle.children[0].nodeValue, 'NUL LIEU LAISSÉ POUR COMPTE');
  assert.equal(t('SAVE KEYS'), 'ENREGISTRER LES CLÉS');

  setLocale('en', { documentRef: doc, storage });
  assert.equal(probe.children[0].nodeValue, 'DATA LAYERS');
});
