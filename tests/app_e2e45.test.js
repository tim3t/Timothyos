// BACKUP AND RESTORE (2.33; simulated bridge on :8098, every setting below invented): BACKUP waits while a save is
// still pending and names drafts it leaves out; passphrase rules; the file is locked (no token, device name or
// journal text readable in it) and, opened with the passphrase, holds exactly the iPad-only settings: links,
// ENGINEERING, podcast places, pins… and never the Captain's Log draft, other drafts, pending saves or copies of
// Notion data. A fresh install (empty storage) restores from the link screen: wrong passphrase refused, a preview of
// what's in the file, RESTORE brings everything back and links the app. A hand-made file with keys outside the list
// restores only listed ones. Phone width.
const { chromium } = require('playwright');
const assert = require('assert'); const fs = require('fs'); const { webcrypto } = require('crypto');
const D = __dirname + '/out/', K = 'k'.repeat(64), BR = 'http://127.0.0.1:8098/macros/s/test/exec', PASS = 'sample passphrase 1';
const txt = async (p, sel) => (await p.innerText(sel)).replace(/\s+/g, ' ').trim();
const SETUP = {
  'tos.nas.v1': { url: 'https://nas.example.invalid', token: 'nas-secret-token-123' },
  'tos.ha.v1': { url: 'https://ha.example.invalid', token: 'ha-secret-token-456' },
  'tos.hadev.v1': [{ id: 'light.sample_porch', name: 'Sample porch' }, { id: 'switch.sample_fan', name: 'Sample fan' }],
  'tos.hagroups.v1': [{ id: 'g1', nm: 'Sample Barn' }],
  'tos.upkeep.v1': [{ id: 'u1', name: 'Sample filter', cat: 'home', every: 3, unit: 'months', last: '2026-09-01' }],
  'tos.plays.v1': { '/Podcasts/Show A/ep 1.wav': { p: 30, d: 90, done: false, at: 1 } },
  'tos.pins.v1': ['today', 'week', 'engineering'],
  'tos.ignore.v1': ['Sample block'],
  'tos.bearings.v1': ['Sample bearing']
};
const NEVER = { 'tos.ldraft.v1': { '2026-10-22': 'Private sample journal words' }, 'tos.rdraft.v1': { '2026-10-19': { wentWell: 'Sample review draft' } }, 'tos.cache.v1': { sample: 1 } };
const b64 = u => Buffer.from(u).toString('base64'), unb64 = s => new Uint8Array(Buffer.from(s, 'base64'));
async function key(pass, salt, iter) {
  const k = await webcrypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  return webcrypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, k, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function open(file, pass) {
  const k = await key(pass, unb64(file.kdf.salt), file.kdf.iter);
  return JSON.parse(new TextDecoder().decode(await webcrypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(file.cipher.iv) }, k, unb64(file.data)))).keys;
}
async function make(keys, pass) {   // a file made outside the app, the same way
  const salt = webcrypto.getRandomValues(new Uint8Array(16)), iv = webcrypto.getRandomValues(new Uint8Array(12)), k = await key(pass, salt, 1000);
  const ct = await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, new TextEncoder().encode(JSON.stringify({ keys })));
  return { format: 'TimothyOS backup', v: 1, made: new Date().toISOString(), app: 'test', kdf: { name: 'PBKDF2', hash: 'SHA-256', iter: 1000, salt: b64(salt) }, cipher: { name: 'AES-GCM', iv: b64(iv) }, data: b64(new Uint8Array(ct)) };
}

(async () => {
  const b = await chromium.launch(); const errs = [];
  const opts = { viewport: { width: 1180, height: 820 }, timezoneId: 'America/Chicago', serviceWorkers: 'block', acceptDownloads: true };
  const ctx = await b.newContext(opts);
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8080/');
  await p.evaluate(([k, br, setup, never]) => {
    localStorage.clear(); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: br, key: k })); localStorage.setItem('tos.start.v1', '"today"');
    Object.keys(setup).forEach(x => localStorage.setItem(x, JSON.stringify(setup[x])));
    Object.keys(never).forEach(x => localStorage.setItem(x, JSON.stringify(never[x])));
    localStorage.setItem('tos.habitq.v1', JSON.stringify({ '2026-10-22': { date: '2026-10-22', med: true } }));   // a save not sent yet
  }, [K, BR, SETUP, NEVER]);
  await p.reload(); await p.waitForTimeout(800);

  // ---- BACKUP waits for pending saves and says which drafts stay out
  await p.click('#status'); await p.waitForSelector('#sec-backup');
  let sec = await txt(p, '#sec-backup');
  assert.ok(sec.includes('NO BACKUP YET') && sec.includes('1 change is still waiting') && sec.includes("Not in a backup: Captain's Log writing, a review draft"), sec);
  assert.ok(await p.isDisabled('[data-act="bkmake"]'));
  await p.evaluate(() => localStorage.removeItem('tos.habitq.v1'));
  await p.click('[data-screen="today"].nav'); await p.click('#status'); await p.waitForSelector('#sec-backup');
  assert.ok(!(await p.isDisabled('[data-act="bkmake"]')));
  // passphrase rules
  await p.fill('#bkPass', 'short'); await p.fill('#bkPass2', 'short'); await p.click('[data-act="bkmake"]');
  assert.ok((await txt(p, '#sec-backup')).includes('at least 8 characters'));
  await p.fill('#bkPass', PASS); await p.fill('#bkPass2', PASS + 'x'); await p.click('[data-act="bkmake"]');
  assert.ok((await txt(p, '#sec-backup')).includes("don't match"));
  await p.fill('#bkPass2', PASS); await p.click('[data-act="bkmake"]');
  await p.waitForSelector('[data-act="bksave"]', { timeout: 15000 });
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-act="bksave"]')]);
  assert.ok(/^timothyos-backup-\d{4}-\d{2}-\d{2}-\d{4}\.json$/.test(dl.suggestedFilename()), dl.suggestedFilename());
  const path = D + 'backup-sample.json'; await dl.saveAs(path);
  sec = await txt(p, '#sec-backup');
  assert.ok(sec.includes('LAST BACKUP') && sec.includes('Keep the passphrase somewhere safe'), sec);
  await p.screenshot({ path: D + 'backup-systems.png' });

  // ---- the file: locked, and exactly the iPad-only settings
  const raw = fs.readFileSync(path, 'utf8'), file = JSON.parse(raw);
  assert.deepStrictEqual([file.format, file.v, file.kdf.name, file.kdf.hash, file.kdf.iter, file.cipher.name], ['TimothyOS backup', 1, 'PBKDF2', 'SHA-256', 600000, 'AES-GCM']);
  ['nas-secret-token-123', 'ha-secret-token-456', 'Sample porch', 'Sample filter', 'Private sample journal', K].forEach(s => assert.ok(!raw.includes(s), 'readable in the file: ' + s));
  const inside = await open(file, PASS);
  Object.keys(SETUP).forEach(k => assert.deepStrictEqual(JSON.parse(inside[k]), SETUP[k], k));
  assert.deepStrictEqual(JSON.parse(inside['tos.conn.v1']), { url: BR, key: K });
  ['tos.ldraft.v1', 'tos.rdraft.v1', 'tos.cache.v1', 'tos.habitq.v1', 'tos.queue.v1', 'tos.tasks.v1'].forEach(k => assert.ok(!(k in inside), k + ' must not be in a backup'));
  await assert.rejects(open(file, 'wrong passphrase'), 'a wrong passphrase cannot open it');

  // ---- a fresh install: restore from the link screen
  const ctx2 = await b.newContext(opts), q = await ctx2.newPage(); q.on('pageerror', e => errs.push(e.message));
  await q.goto('http://localhost:8080/'); await q.waitForSelector('#connForm');
  assert.ok((await txt(q, '.bk-connect')).includes('OR RESTORE THIS IPAD'));
  await q.setInputFiles('#bkFile', path); await q.waitForSelector('#bkRPass');
  await q.fill('#bkRPass', 'wrong passphrase'); await q.click('[data-act="bkopen"]');
  await q.waitForFunction(() => document.querySelector('.bk-connect').innerText.includes("doesn't open"), null, { timeout: 15000 });
  await q.fill('#bkRPass', PASS); await q.click('[data-act="bkopen"]'); await q.waitForSelector('.bk-plan', { timeout: 15000 });
  const plan = await txt(q, '.bk-plan');
  assert.ok(plan.includes('the bridge, the NAS relay, Home Assistant') && plan.includes('2 devices · 1 room · 1 upkeep item') && plan.includes('1 podcast place') && plan.includes('3 pinned stations · 1 bearing'), plan);
  await q.screenshot({ path: D + 'backup-restore-plan.png' });
  await q.click('[data-act="bkapply"]');
  await q.waitForSelector('#status'); await q.waitForFunction(() => !document.getElementById('connForm'), null, { timeout: 15000 });
  await q.waitForFunction(() => /Restored from backup/.test(document.getElementById('toast').textContent), null, { timeout: 5000 });
  const back = await q.evaluate(ks => { const o = {}; ks.forEach(k => { o[k] = localStorage.getItem(k); }); return o; }, Object.keys(SETUP).concat(['tos.conn.v1', 'tos.ldraft.v1', 'tos.rdraft.v1']));
  Object.keys(SETUP).forEach(k => assert.deepStrictEqual(JSON.parse(back[k]), SETUP[k], 'restored ' + k));
  assert.deepStrictEqual(JSON.parse(back['tos.conn.v1']), { url: BR, key: K }, 'linked again');
  assert.deepStrictEqual([back['tos.ldraft.v1'], back['tos.rdraft.v1']], [null, null]);

  // ---- a hand-made file: only listed settings are restored
  const crafted = D + 'backup-crafted.json';
  fs.writeFileSync(crafted, JSON.stringify(await make({ 'tos.pins.v1': JSON.stringify(['week']), 'tos.ldraft.v1': JSON.stringify({ x: 'y' }), 'evil.key': '"x"', 'tos.ignore.v1': 'not json' }, PASS)));
  await q.click('#status'); await q.waitForSelector('#sec-backup');
  await q.setInputFiles('#bkFile', crafted); await q.waitForSelector('#bkRPass');
  await q.fill('#bkRPass', PASS); await q.click('[data-act="bkopen"]'); await q.waitForSelector('.bk-plan');
  await q.click('[data-act="bkapply"]'); await q.waitForSelector('#status'); await q.waitForTimeout(800);
  const after = await q.evaluate(() => [localStorage.getItem('tos.pins.v1'), localStorage.getItem('tos.ldraft.v1'), localStorage.getItem('evil.key'), localStorage.getItem('tos.ignore.v1')]);
  assert.deepStrictEqual(after, ['["week"]', null, null, '["Sample block"]'], 'listed and valid only');

  // ---- phone width
  await q.setViewportSize({ width: 400, height: 860 });
  await q.click('#status'); await q.waitForSelector('#sec-backup');
  assert.strictEqual(await q.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, 'no sideways scroll');
  await q.screenshot({ path: D + 'backup-phone.png', fullPage: true });

  console.log('errors', errs);
  assert.deepStrictEqual(errs, []);
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
