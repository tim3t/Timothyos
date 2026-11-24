// iPad backups to Google Drive (bridge 1.53, app 2.91): the locked file the app made goes to "iPad backups" inside the
// export's folder through drive.file; the bridge checks only its shape (never opens it), keeps the newest 10 of its own
// files (anything else in the folder is left alone), makes the folder again if it was trashed, and names what Drive
// refused. Invented data only: the "locked" file is sample text, not a real backup.
const assert = require('assert');
const { bridge } = require('./lib/gas');
const { drive } = require('./lib/drive');

const dv = drive({ token: 'oauth-test' });
const b = bridge({ fetch: (u, o) => (u.startsWith('https://www.googleapis.com') ? dv.fetch(u, o) : undefined) }), { props } = b;
const file = (n) => ({ format: 'TimothyOS backup', v: 1, made: '2026-11-24T15:00:00.000Z', app: '2.91.0', kdf: { name: 'PBKDF2', hash: 'SHA-256', iter: 600000, salt: 'c2FsdA==' }, cipher: { name: 'AES-GCM', iv: 'aXY=' }, data: 'bG9ja2VkIHNhbXBsZSA' + n });
const name = (n, who) => 'timothyos-backup-2026-11-' + String(n).padStart(2, '0') + '-1500' + (who ? '-' + who : '') + '.json';
const save = (n, who, f) => b.post({ action: 'backupsave', backup: { name: name(n, who), file: f || file(n) } });

// ---- the ability is there without Notion (Drive alone)
assert.ok(b.post({ action: 'ping' }).capabilities.includes('backup'));

// ---- a first backup: the folder is made inside the export's, the file is the app's text exactly
let r = save(1, 'hub');
assert.ok(r.ok, JSON.stringify(r));
const root = props.EXPORT_ROOT, dir = props.BACKUP_FOLDER;
assert.deepStrictEqual([dv.files[root].name, dv.files[dir].name, dv.files[dir].parents[0]], ['TimothyOS Notion export', 'iPad backups', root]);
assert.strictEqual(dv.files[r.backup.id].body, JSON.stringify(file(1)), 'stored as sent');
assert.deepStrictEqual([r.backup.name, r.backup.kept, r.backup.keep, r.backup.folder], [name(1, 'hub'), 1, 10, 'https://drive.google.com/drive/folders/' + dir]);

// ---- only the shape is checked; anything else is refused before Drive is reached
const n0 = dv.calls.length;
for (const bad of [
  { name: 'notes.json', file: file(2) },
  { name: name(2), file: Object.assign(file(2), { format: 'Something else' }) },
  { name: name(2), file: Object.assign(file(2), { v: 2 }) },
  { name: name(2), file: Object.assign(file(2), { data: 7 }) },
  { name: name(2) },
]) assert.strictEqual(b.post({ action: 'backupsave', backup: bad }).error, 'bad_request', JSON.stringify(bad).slice(0, 80));
assert.strictEqual(save(2, '', Object.assign(file(2), { data: 'x'.repeat(4 * 1024 * 1024) })).error, 'too_large');
assert.strictEqual(dv.calls.length, n0, 'nothing sent to Drive');

// ---- the newest 10 of its own files stay; a file it didn't name is never touched
const other = dv.fid(); dv.files[other] = { name: 'Notes.txt', parents: [dir], mime: 'text/plain', body: 'x', trashed: false, created: '2026-01-01T00:00:00.000Z' };
for (let n = 2; n <= 12; n++) assert.ok(save(n, n % 2 ? 'hub' : 'mobile').ok);
const kept = dv.inFolder(dir).filter(f => /^timothyos-backup-/.test(f.name)).map(f => f.name).sort();
assert.strictEqual(kept.length, 10);
assert.ok(!kept.includes(name(1, 'hub')) && !kept.includes(name(2, 'mobile')) && kept.includes(name(12, 'mobile')), kept.join(' '));
assert.ok(!dv.files[other].trashed, 'not its own: left alone');

// ---- the folder trashed in Drive: made again
dv.files[dir].trashed = true;
r = save(13, 'hub');
assert.ok(r.ok && props.BACKUP_FOLDER !== dir && dv.files[props.BACKUP_FOLDER].parents[0] === root);

// ---- Drive refuses: the app is told which way
dv.mode = 'scope'; assert.strictEqual(save(14).error, 'drive_scope');
dv.mode = 'apioff'; assert.strictEqual(save(14).error, 'drive_api_off');
dv.mode = 'full'; r = save(14); assert.strictEqual(r.error, 'drive_full');
dv.mode = 'ok'; assert.ok(save(14).ok, 'and goes through once Drive is back');

console.log('bridge_backup: ok');
