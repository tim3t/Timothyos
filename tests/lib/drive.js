// A simulated Google Drive (REST v3, as the bridge reaches it with drive.file) for the bridge tests: only what the
// bridge made exists for it. Shared by bridge_export (1.41) and bridge_backup (1.53).
//
//   const dv = drive({ token: 'oauth-token', onCall: () => tick(200) });
//   bridge({ fetch: (u, o, res) => (u.startsWith('https://www.googleapis.com') ? dv.fetch(u, o) : undefined) })
//   dv.files   { id: { name, parents, mime, body, trashed, created } }     dv.calls   ['post https://…', …]
//   dv.mode = 'scope' | 'apioff' | 'full' | 'ok'                           dv.fid()   a new id
const assert = require('assert');

function drive(o = {}) {
  const dv = { files: {}, calls: [], mode: 'ok', nid: 0, clock: 0 };
  dv.fid = () => 'f' + (++dv.nid);
  const stamp = () => new Date(Date.parse('2026-11-01T00:00:00Z') + (++dv.clock) * 1000).toISOString();   // each file a second newer than the last
  dv.fetch = function (url, opts) {
    const m = (opts.method || 'get').toLowerCase(); dv.calls.push(m + ' ' + url.split('?')[0]); if (o.onCall) o.onCall();
    if (o.token) assert.strictEqual(opts.headers.Authorization, 'Bearer ' + o.token, 'the script\'s own token');
    const res = (code, body) => ({ getResponseCode: () => code, getContentText: () => typeof body === 'string' ? body : JSON.stringify(body) });
    if (dv.mode === 'scope') return res(403, { error: { message: 'Request had insufficient authentication scopes.' } });
    if (dv.mode === 'apioff') return res(403, { error: { code: 403, message: 'Google Drive API has not been used in project 123 before or it is disabled. Enable it by visiting the console.', status: 'PERMISSION_DENIED', details: [{ reason: 'SERVICE_DISABLED' }] } });
    if (dv.mode === 'full' && m === 'post' && url.includes('/upload/')) return res(403, { error: { errors: [{ reason: 'storageQuotaExceeded' }] } });
    if (m === 'post' && url.startsWith('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart')) {
      const raw = Buffer.from(opts.payload).toString('utf8'), b = opts.contentType.split('boundary=')[1];
      const parts = raw.split('--' + b).slice(1, 3).map(x => x.replace(/^\r\n/, '').replace(/\r\n$/, '')), meta = JSON.parse(parts[0].split('\r\n\r\n')[1]);
      const id = dv.fid(); dv.files[id] = { name: meta.name, parents: meta.parents, mime: meta.mimeType, body: parts[1].split('\r\n\r\n').slice(1).join('\r\n\r\n'), trashed: false, created: stamp() };
      return res(200, { id, name: meta.name, size: String(Buffer.byteLength(dv.files[id].body)) });
    }
    if (m === 'post' && url.startsWith('https://www.googleapis.com/drive/v3/files?')) {
      const meta = JSON.parse(opts.payload), id = dv.fid(); dv.files[id] = { name: meta.name, parents: meta.parents || ['root'], mime: meta.mimeType, trashed: false, created: stamp() }; return res(200, { id, name: meta.name });
    }
    const mid = /drive\/v3\/files\/([^?]+)\?(.*)$/.exec(url);
    if (mid) {
      const f = dv.files[decodeURIComponent(mid[1])]; if (!f) return res(404, { error: { message: 'File not found' } });
      if (m === 'get' && mid[2] === 'alt=media') return res(200, f.body);
      if (m === 'get') return res(200, { id: mid[1], trashed: f.trashed });
      if (m === 'patch') { Object.assign(f, JSON.parse(opts.payload)); return res(200, { id: mid[1] }); }
    }
    if (m === 'get' && url.startsWith('https://www.googleapis.com/drive/v3/files?q=')) {
      const q = decodeURIComponent(/q=([^&]+)/.exec(url)[1]), parent = /'([^']+)' in parents/.exec(q)[1];
      const folders = /mimeType = 'application\/vnd\.google-apps\.folder'/.test(q), notFolders = /mimeType != 'application\/vnd\.google-apps\.folder'/.test(q);
      return res(200, { files: Object.keys(dv.files).filter(id => { const f = dv.files[id], isF = /folder/.test(f.mime || ''); return f.parents.includes(parent) && !f.trashed && (!folders || isF) && (!notFolders || !isF); })
        .map(id => ({ id, name: dv.files[id].name, createdTime: dv.files[id].created })) });
    }
    return res(400, 'unexpected ' + m + ' ' + url);
  };
  dv.inFolder = (folder, name) => Object.keys(dv.files).map(id => Object.assign({ id }, dv.files[id])).filter(f => f.parents.includes(folder) && !f.trashed && (!name || f.name === name));
  return dv;
}

module.exports = { drive };
