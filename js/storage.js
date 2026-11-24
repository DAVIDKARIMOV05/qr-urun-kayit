/* storage.js — IndexedDB tabanlı yerel veri katmanı (çevrimdışı çalışır)
 * Store'lar: sefers (yükleme/sefer kayıtları), items (yüklenen ürünler),
 * products (ürün kataloğu), kv (ayarlar + meta)
 */
(function (global) {
  'use strict';

  var DB_NAME = 'qr-yukleme';
  var DB_VER = 1;
  var STORES = ['sefers', 'items', 'products', 'kv'];

  var dbPromise = null;
  var useMem = false;
  var MEM_KEY = 'qr-yukleme-mem-v1';
  var mem = null;

  function memLoad() {
    if (mem) return mem;
    try {
      mem = JSON.parse(localStorage.getItem(MEM_KEY) || '{}');
    } catch (e) {
      mem = {};
    }
    STORES.forEach(function (s) { if (!mem[s]) mem[s] = {}; });
    return mem;
  }
  function memSave() {
    try { localStorage.setItem(MEM_KEY, JSON.stringify(mem)); } catch (e) { }
  }

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (!global.indexedDB) { reject(new Error('IndexedDB yok')); return; }
      var req;
      try {
        req = indexedDB.open(DB_NAME, DB_VER);
      } catch (e) { reject(e); return; }
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains('sefers')) {
          db.createObjectStore('sefers', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('items')) {
          var s = db.createObjectStore('items', { keyPath: 'id' });
          s.createIndex('seferId', 'seferId', { unique: false });
          s.createIndex('kod', 'kod', { unique: false });
          s.createIndex('zaman', 'zaman', { unique: false });
        }
        if (!db.objectStoreNames.contains('products')) {
          db.createObjectStore('products', { keyPath: 'kod' });
        }
        if (!db.objectStoreNames.contains('kv')) {
          db.createObjectStore('kv', { keyPath: 'k' });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('DB açılamadı')); };
      req.onblocked = function () { reject(new Error('DB bloklandı')); };
    });
    return dbPromise;
  }

  function run(store, mode, fn) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(store, mode);
        var out;
        try { out = fn(t.objectStore(store)); } catch (e) { reject(e); return; }
        t.oncomplete = function () {
          try { resolve(out && 'result' in out ? out.result : undefined); }
          catch (e) { resolve(undefined); }
        };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error || new Error('işlem iptal edildi')); };
      });
    });
  }

  function memPut(store, value) {
    var m = memLoad();
    var key = store === 'kv' ? value.k : (store === 'products' ? value.kod : value.id);
    m[store][key] = value;
    memSave();
  }
  function memDel(store, key) { var m = memLoad(); delete m[store][key]; memSave(); }

  function fallback(fnName, args) {
    var m = memLoad();
    switch (fnName) {
      case 'all': return Promise.resolve(Object.values(m[args[0]]));
      case 'get': return Promise.resolve(m[args[0]][args[1]]);
      case 'put': memPut(args[0], args[1]); return Promise.resolve(args[1]);
      case 'putMany': args[1].forEach(function (v) { memPut(args[0], v); }); return Promise.resolve(args[1].length);
      case 'del': memDel(args[0], args[1]); return Promise.resolve(true);
      case 'clear': m[args[0]] = {}; memSave(); return Promise.resolve(true);
      case 'index':
        return Promise.resolve(Object.values(m[args[0]]).filter(function (v) { return v[args[1]] === args[2]; }));
      default: return Promise.reject(new Error('bilinmeyen işlem ' + fnName));
    }
  }

  function guard(fnName, args, idbFn) {
    if (useMem) return fallback(fnName, args);
    return idbFn().catch(function (err) {
      useMem = true;
      console.warn('IndexedDB kullanılamadı, tarayıcı belleğine geçildi:', err);
      if (!global.__memUyariVerildi && global.App && global.App.toast) {
        global.__memUyariVerildi = true;
        global.App.toast('Kalıcı depo açılamadı', 'Kayıtlar geçici bellekte — veriler yenileyince kaybolabilir, yedek alın', 'bad', 8000);
      }
      return fallback(fnName, args);
    });
  }

  var DB = {
    get backend() { return useMem ? 'localStorage' : 'IndexedDB'; },

    all: function (store) {
      return guard('all', arguments, function () { return run(store, 'readonly', function (os) { return os.getAll(); }); });
    },
    get: function (store, key) {
      return guard('get', arguments, function () { return run(store, 'readonly', function (os) { return os.get(key); }); });
    },
    index: function (store, index, value) {
      return guard('index', arguments, function () {
        return run(store, 'readonly', function (os) { return os.index(index).getAll(value); });
      });
    },
    put: function (store, value) {
      return guard('put', arguments, function () { return run(store, 'readwrite', function (os) { return os.put(value); }); });
    },
    putMany: function (store, values) {
      return guard('putMany', arguments, function () {
        return open().then(function (db) {
          return new Promise(function (resolve, reject) {
            var t = db.transaction(store, 'readwrite');
            var os = t.objectStore(store);
            values.forEach(function (v) { os.put(v); });
            t.oncomplete = function () { resolve(values.length); };
            t.onerror = function () { reject(t.error); };
            t.onabort = function () { reject(t.error); };
          });
        });
      });
    },
    del: function (store, key) {
      return guard('del', arguments, function () { return run(store, 'readwrite', function (os) { return os.delete(key); }); });
    },
    clear: function (store) {
      return guard('clear', arguments, function () { return run(store, 'readwrite', function (os) { return os.clear(); }); });
    },

    /* ayar / meta yardımcıları */
    kvGet: function (key, def) {
      return DB.get('kv', key).then(function (row) {
        return row && 'v' in row ? row.v : def;
      });
    },
    kvSet: function (key, value) {
      return DB.put('kv', { k: key, v: value });
    },

    /* tam yedek */
    dump: function () {
      return Promise.all(STORES.map(function (s) { return DB.all(s); })).then(function (res) {
        var out = { app: 'qr-yukleme', surum: DB_VER, tarih: new Date().toISOString() };
        STORES.forEach(function (s, i) { out[s] = res[i]; });
        return out;
      });
    },
    /* yedekten içe aktarma: store'lar sirayla temizlenir/yazilir (ayni store'da temizle-yazis yazismasin) */
    restore: function (data, opts) {
      opts = opts || {};
      var chain = Promise.resolve();
      STORES.forEach(function (s) {
        var rows = Array.isArray(data[s]) ? data[s] : null;
        chain = chain.then(function () {
          return opts.clearFirst ? DB.clear(s) : null;
        }).then(function () {
          return rows && rows.length ? DB.putMany(s, rows) : null;
        });
      });
      return chain.then(function () { return true; });
    }
  };

  global.DB = DB;
})(typeof window !== 'undefined' ? window : globalThis);
