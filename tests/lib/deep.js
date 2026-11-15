// The deep store from a test (2.85, A4). Saved copies (calendars, meals, health days…) moved from localStorage to
// IndexedDB ("tos-deep", records { e: the browser's mark, v: the text }), so a test that reads or drops one goes
// through here: read(page, key) gives the text the app would load (the 5 MB store's copy when the deep store has
// none), drop(page, key) removes it from both, ready for a reload.
async function read(page, key) {
  return page.evaluate(k => new Promise(res => {
    const ls = localStorage.getItem(k), mark = localStorage.getItem('tos.deep.v1');
    let o; try { o = indexedDB.open('tos-deep', 1); } catch (e) { res(ls); return; }
    o.onupgradeneeded = () => o.result.createObjectStore('kv');
    o.onerror = () => res(ls);
    o.onsuccess = () => { const db = o.result, g = db.transaction('kv').objectStore('kv').get(k);
      g.onsuccess = () => { db.close(); const r = g.result; res(ls !== null ? ls : r && r.e === mark ? r.v : null); };
      g.onerror = () => { db.close(); res(ls); }; };
  }), key);
}
async function drop(page, key) {
  return page.evaluate(k => new Promise(res => {
    localStorage.removeItem(k);
    let o; try { o = indexedDB.open('tos-deep', 1); } catch (e) { res(); return; }
    o.onupgradeneeded = () => o.result.createObjectStore('kv');
    o.onerror = () => res();
    o.onsuccess = () => { const db = o.result, tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').delete(k); tx.oncomplete = () => { db.close(); res(); }; tx.onabort = () => { db.close(); res(); }; };
  }), key);
}
module.exports = { read, drop };
