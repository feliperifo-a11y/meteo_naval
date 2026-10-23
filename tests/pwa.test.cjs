// node --test tests/pwa.test.cjs — sin paquetes externos.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');

function worker(scope = 'https://example.test/meteo_naval/') {
  const handlers = {}, calls = [], stores = new Map();
  const prefix = 'meteoia-offline-' + new URL(scope).pathname + '-';
  stores.set(prefix + 'old', {});
  stores.set('otra-aplicacion', {});
  const context = {
    URL, Request, Response,
    self: { registration: { scope }, location: new URL(scope),
      addEventListener: (name, handler) => { handlers[name] = handler; },
      skipWaiting: async () => {}, clients: { claim: async () => {} } },
    fetch: async request => { calls.push(request.url); if (context.offline) throw Error('offline'); return new Response('red'); },
    caches: {
      open: async name => { if (!stores.has(name)) stores.set(name, new Map()); const data = stores.get(name); return {
        add: async request => { calls.push(request.url); data.set(request.url, new Response('ayuda sin datos')); },
        match: async url => data.get(url)?.clone()
      }; },
      keys: async () => [...stores.keys()], delete: async key => stores.delete(key)
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'sw-app.js'), 'utf8'), context);
  async function lifecycle(type) { let promise; handlers[type]({ waitUntil: p => { promise = p; } }); await promise; }
  function request(url, mode = 'navigate', method = 'GET') {
    let response;
    handlers.fetch({ request: { url, method, mode }, respondWith: p => { response = p; } });
    return response;
  }
  return { context, calls, stores, lifecycle, request };
}

test('solo precarga ayuda; elimina su caché anterior y conserva otras apps', async () => {
  const w = worker();
  await w.lifecycle('install'); await w.lifecycle('activate');
  assert.deepEqual(w.calls, ['https://example.test/meteo_naval/app/offline.html']);
  assert(w.stores.has('otra-aplicacion'));
  assert(![...w.stores.keys()].some(k => k.endsWith('-old')));
});
test('las navegaciones consultan la red y no guardan páginas meteorológicas', async () => {
  const w = worker(); await w.lifecycle('install');
  assert.equal(await (await w.request('https://example.test/meteo_naval/ia.html')).text(), 'red');
  assert.equal([...w.stores.values()].filter(v => v instanceof Map)[0].size, 1);
});
test('sin conexión muestra ayuda y vuelve a la red cuando se recupera', async () => {
  const w = worker(); await w.lifecycle('install');
  w.context.offline = true;
  assert.equal(await (await w.request('https://example.test/meteo_naval/')).text(), 'ayuda sin datos');
  w.context.offline = false;
  assert.equal(await (await w.request('https://example.test/meteo_naval/')).text(), 'red');
});
test('no intercepta JSON, íconos, POST, dominios externos u otros proyectos', () => {
  const w = worker();
  for (const [url, mode, method] of [
    ['https://example.test/meteo_naval/data/avisos.json', 'cors', 'GET'],
    ['https://example.test/meteo_naval/app/ic-192.png', 'no-cors', 'GET'],
    ['https://external.test/', 'navigate', 'GET'],
    ['https://example.test/otro/', 'navigate', 'GET'],
    ['https://example.test/meteo_naval/', 'navigate', 'POST']
  ]) assert.equal(w.request(url, mode, method), undefined);
});
test('también funciona publicado en la raíz de un dominio', async () => {
  const w = worker('https://example.test/'); await w.lifecycle('install');
  assert.deepEqual(w.calls, ['https://example.test/app/offline.html']);
});

function guide({ ua = 'Android', standalone = false, iosStandalone = false } = {}) {
  const nodes = new Map(), events = {}, registrations = [];
  const element = () => ({ hidden: false, disabled: false, textContent: '', attrs: {}, events: {},
    setAttribute(name, value) { this.attrs[name] = value; },
    addEventListener(name, handler) { this.events[name] = handler; } });
  function get(id) { if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id); }
  const mode = { matches: standalone, addEventListener: (n, cb) => { events.mode = cb; } };
  const context = {
    document: { getElementById: get, querySelector: get },
    navigator: { userAgent: ua, maxTouchPoints: 1, onLine: true, standalone: iosStandalone,
      serviceWorker: { register: async url => { registrations.push(String(url)); } } },
    matchMedia: () => mode,
    window: { isSecureContext: true, addEventListener: (name, handler) => { events[name] = handler; } }
  };
  const html = fs.readFileSync(path.join(root, 'app/index.html'), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  vm.runInNewContext(script, context);
  return { get, events, mode, context, registrations };
}
test('iPhone e iPad muestran instrucciones de Safari y registran el worker', () => {
  for (const ua of ['iPhone', 'iPad', 'Macintosh']) {
    const g = guide({ ua });
    assert.equal(g.get('guide-ios').hidden, false);
    assert.equal(g.get('guide-android').hidden, true);
    assert.equal(g.get('install').hidden, true);
    assert.deepEqual(g.registrations, ['../sw-app.js']);
  }
});
test('Android conserva instrucciones manuales si no existe diálogo nativo', () => {
  const g = guide();
  assert.equal(g.get('guide-android').hidden, false);
  assert.equal(g.get('install').hidden, true);
});
test('el diálogo solo se abre al tocar Instalar y no se reutiliza', async () => {
  const g = guide(); let prompts = 0, prevented = false;
  g.events.beforeinstallprompt({ preventDefault: () => { prevented = true; },
    prompt: async () => { prompts++; }, userChoice: Promise.resolve({ outcome: 'accepted' }) });
  assert(prevented); assert.equal(prompts, 0); assert.equal(g.get('install').hidden, false);
  await g.get('install').events.click(); await g.get('install').events.click();
  assert.equal(prompts, 1); assert.match(g.get('status').textContent, /solicitada/);
});
test('cancelar la instalación permite seguir usando la app', async () => {
  const g = guide();
  g.events.beforeinstallprompt({ preventDefault() {}, prompt: async () => {}, userChoice: Promise.resolve({ outcome: 'dismissed' }) });
  await g.get('install').events.click();
  assert.match(g.get('status').textContent, /más adelante/);
  assert.equal(g.get('open').hidden, false);
});
test('modo app en Android e iOS oculta los pasos de instalación', () => {
  for (const options of [{ standalone: true }, { iosStandalone: true, ua: 'iPhone' }]) {
    const g = guide(options);
    assert.equal(g.get('.selector').hidden, true);
    assert.equal(g.get('guide-ios').hidden, true);
    assert.equal(g.get('guide-android').hidden, true);
  }
});
test('cambio de teléfono y pérdida de red mantienen controles coherentes', () => {
  const g = guide();
  g.get('select-ios').events.click(); assert.equal(g.get('guide-ios').hidden, false);
  g.get('select-android').events.click(); assert.equal(g.get('guide-android').hidden, false);
  g.context.navigator.onLine = false; g.events.offline(); assert.equal(g.get('install').disabled, true);
  g.context.navigator.onLine = true; g.events.online(); assert.equal(g.get('install').disabled, false);
});

test('todas las páginas generadas contienen JavaScript válido', () => {
  for (const file of ['index.html', 'dashboard.html', 'ia.html', 'pronosticos.html', 'hielos.html', 'app/index.html']) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)) {
      new vm.Script(match[1], { filename: file });
    }
  }
});
test('el acceso de instalación respeta subcarpetas y se oculta en modo app', () => {
  for (const standalone of [false, true]) {
    const links = [], registrations = [];
    vm.runInNewContext(fs.readFileSync(path.join(root, 'build/instalar.js'), 'utf8'), {
      URL, URLSearchParams,
      location: { href: 'https://example.test/meteo_naval/index.html', search: '' },
      matchMedia: () => ({ matches: standalone }),
      navigator: { serviceWorker: { register: async url => { registrations.push(String(url)); } } },
      window: { isSecureContext: true },
      document: { querySelector: () => ({ appendChild: a => links.push(a) }), createElement: () => ({}) }
    });
    assert.deepEqual(registrations, ['https://example.test/meteo_naval/sw-app.js']);
    assert.equal(links.length, standalone ? 0 : 1);
    if (!standalone) assert.equal(links[0].href, 'https://example.test/meteo_naval/app/');
  }
});
