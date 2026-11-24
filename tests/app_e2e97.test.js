// BACKUP TO GOOGLE DRIVE (2.91, bridge 1.53; simulated on :8105, every setting invented): with a bridge that can,
// MAKE BACKUP locks the file on the iPad and sends it to Drive by itself (named for this iPad), says where it went with
// OPEN IN DRIVE, and still offers a copy to Files; the bridge gets only the locked file (no token or passphrase in it).
// Drive refusing says why, with SEND AGAIN; the section says when this iPad last sent one. An older bridge: as before,
// Files only. Phone width.
const { chromium } = require('playwright');
const { lane, P8105 } = require('./lib/lane');
const assert = require('assert');
const until = require('./lib/explain').until(15000, 150);
const K = 'k'.repeat(64), U = 'http://127.0.0.1:' + P8105 + '/macros/s/test/exec', B = U + '?key=' + K, PASS = 'sample passphrase 2';
const txt = async (p, sel) => (await p.innerText(sel)).replace(/\s+/g, ' ').trim();
const bkd = q => fetch(B + '&action=bkdmode&' + q).then(r => r.json());

(async () => {
  await bkd('cap=1&fail=0&reset=1');
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 900 }, timezoneId: 'America/Chicago', serviceWorkers: 'block', acceptDownloads: true });
  await lane(ctx);
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8080/');
  await p.evaluate(([k, u]) => {
    localStorage.clear(); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: u, key: k })); localStorage.setItem('tos.start.v1', '"today"');
    localStorage.setItem('tos.nas.v1', JSON.stringify({ url: 'https://nas.example.invalid', token: 'nas-sample-token-789' }));
    localStorage.setItem('tos.profile.v1', JSON.stringify({ on: false, name: 'HUB' }));
  }, [K, U]);
  await p.reload(); await p.waitForTimeout(1200);
  const sec = () => txt(p, '#sec-backup');
  const make = async () => {
    await p.click('#status'); await p.waitForSelector('#sec-backup');
    await p.fill('#bkPass', PASS); await p.fill('#bkPass2', PASS); await p.click('[data-act="bkmake"]');
  };

  // ---- MAKE BACKUP: locked here, then sent to Drive by itself
  await make();
  assert.ok((await sec()).includes('MAKE BACKUP also sends the locked file to Google Drive (TimothyOS Notion export → iPad backups, the newest 10 kept)'), await sec());
  await until(async () => /Sent to Google Drive as timothyos-backup-\d{4}-\d\d-\d\d-\d{4}-hub\.json, in TimothyOS Notion export → iPad backups \(the newest 10 are kept\)\./.test(await sec()), 15000, 'sent to Drive');
  assert.strictEqual(await p.getAttribute('#sec-backup a.btn', 'href'), 'https://drive.google.com/drive/folders/sample-backups');
  assert.strictEqual(await txt(p, '[data-act="bksave"]'), 'A COPY TO FILES TOO', 'Files is still there');
  let saves = (await bkd('')).saves;
  assert.strictEqual(saves.length, 1);
  const f = saves[0].file;
  assert.ok(f.format === 'TimothyOS backup' && f.v === 1 && f.kdf.iter === 600000 && f.cipher.name === 'AES-GCM', JSON.stringify(f).slice(0, 200));
  assert.ok(!/nas-sample-token|nas\.example|sample passphrase/.test(JSON.stringify(saves[0])), 'only the locked file leaves the iPad');
  // the copy to Files is the same file
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-act="bksave"]')]);
  assert.deepStrictEqual(JSON.parse(require('fs').readFileSync(await dl.path(), 'utf8')), f);

  // ---- Drive refuses: why, and SEND AGAIN
  await bkd('fail=drive_full');
  await p.reload(); await p.waitForTimeout(800);
  await make();
  await until(async () => (await sec()).includes('Not sent to Google Drive: Google Drive is full. Free some space, then SEND AGAIN.'), 15000, 'the refusal');
  assert.ok((await sec()).includes('Last sent '), 'when this iPad last sent one');
  await bkd('fail=0');
  await p.click('[data-act="bkdrive"]');
  await until(async () => (await sec()).includes('Sent to Google Drive as'), 8000, 'sent on the second try');
  assert.strictEqual((await bkd('')).saves.length, 2);

  // ---- phone width
  await p.setViewportSize({ width: 400, height: 860 }); await p.waitForTimeout(200);
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no sideways scroll');
  await p.setViewportSize({ width: 1180, height: 900 });

  // ---- an older bridge: Files only, as before
  await bkd('cap=0');
  await p.reload(); await p.waitForTimeout(800);
  await p.click('#status'); await p.click('[data-act="refresh"]'); await p.waitForTimeout(1500);   // the bridge's abilities, read again
  await make();
  await p.waitForSelector('[data-act="bksave"]', { timeout: 15000 }); await p.waitForTimeout(500);
  assert.ok(!(await sec()).includes('Google Drive'), await sec());
  assert.strictEqual(await txt(p, '[data-act="bksave"]'), 'SAVE TO FILES');
  assert.strictEqual((await bkd('')).saves.length, 2, 'nothing sent');

  assert.deepStrictEqual(errs, []);
  await b.close(); await bkd('cap=0&reset=1');
  console.log('BACKUP TO GOOGLE DRIVE: sent by itself, the locked file only, refused and sent again, older bridge as before: ok');
})().catch(async e => { console.error(e); await bkd('cap=0&fail=0&reset=1').catch(() => {}); process.exit(1); });
