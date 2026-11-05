/* KattaPack Zentrale – Anmeldung, Entschlüsselung und Datenbank-Anbindung (Supabase) */
(function(){
'use strict';
const CFG = window.KATTAPACK_CONFIG || {};
const $ = s => document.querySelector(s);
const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const setMsg = (t, ok) => { const el = $('#lMsg'); el.textContent = t || ''; el.dataset.ok = ok ? '1' : ''; };

function show(id){ ['login', 'loading', 'setup'].forEach(x => { $('#' + x).hidden = x !== id; }); }

if (!CFG.supabaseUrl || !CFG.supabaseAnonKey || /HIER/.test(CFG.supabaseUrl + CFG.supabaseAnonKey)){ show('setup'); return; }
if (!window.supabase || !window.supabase.createClient){ show('login'); setMsg('Die Anmeldung konnte nicht geladen werden. Bitte Seite neu laden.'); return; }

const sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, {auth: {persistSession: true, autoRefreshToken: true}});
let started = false;

sb.auth.getSession().then(({data}) => { if (data && data.session) enter(data.session); else { show('login'); setTimeout(() => $('#lEmail').focus(), 50); } });
sb.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT' && started) location.reload(); });

$('#lForm').addEventListener('submit', async e => {
  e.preventDefault();
  const email = $('#lEmail').value.trim(), password = $('#lPass').value;
  if (!email || !password){ setMsg('Bitte E-Mail und Passwort eingeben.'); return; }
  $('#lBtn').disabled = true; setMsg('Anmeldung läuft …', true);
  const {data, error} = await sb.auth.signInWithPassword({email, password});
  $('#lBtn').disabled = false;
  if (error){ setMsg(/invalid/i.test(error.message) ? 'E-Mail oder Passwort stimmt nicht.' : 'Anmeldung fehlgeschlagen: ' + error.message); return; }
  enter(data.session);
});

async function enter(session){
  if (started) return; started = true;
  show('loading');
  try {
    const {data: row, error} = await sb.from('schluessel').select('wert').eq('id', 1).maybeSingle();
    if (error || !row) throw new Error('kein-zugang');
    const DATA = await decrypt(row.wert);
    window.claude = makeClaude(sb, session);
    $('#loading').hidden = true; $('#appRoot').hidden = false;
    const lo = $('#logoutBtn'); if (lo) lo.addEventListener('click', () => sb.auth.signOut());
    window.__startApp(DATA);
  } catch(err){
    started = false; show('login');
    setMsg(err && err.message === 'kein-zugang'
      ? 'Angemeldet, aber dein Konto ist nicht als Mitglied eingetragen oder der Schlüssel fehlt. Siehe ANLEITUNG, Schritt 2.'
      : 'Inhalt konnte nicht geladen werden. Bitte Seite neu laden.');
    $('#lOut').hidden = false;
  }
}
$('#lOut').addEventListener('click', () => sb.auth.signOut().then(() => location.reload()));

async function decrypt(keyB64){
  const res = await fetch('inhalt.enc', {cache: 'no-cache'});
  const j = await res.json();
  const key = await crypto.subtle.importKey('raw', b64(keyB64), 'AES-GCM', false, ['decrypt']);
  const plain = await crypto.subtle.decrypt({name: 'AES-GCM', iv: b64(j.iv)}, key, b64(j.ct));
  const stream = new Blob([plain]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text());
}

/* Gleiche Schnittstelle wie die claude.ai-Laufzeit (db, user, downloads), gespeichert in Supabase */
function makeClaude(sb, session){
  const uid = session.user.id, email = String(session.user.email || '').toLowerCase();
  const store = new Map(), subs = new Set();
  let ready = false;
  const clone = d => d == null ? d : JSON.parse(JSON.stringify(d));
  const meta = {fromCache: false, hasPendingWrites: false};
  const rid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
  const snapDoc = p => { const d = store.get(p); return {id: p.split('/').pop(), exists: d !== undefined, data: () => d === undefined ? undefined : clone(d), metadata: meta}; };
  const fire = s => {
    if (!ready) return;
    if (s.type === 'doc') return s.cb(snapDoc(s.path));
    const depth = s.path.split('/').length + 1, docs = [];
    for (const p of store.keys()) if (p.startsWith(s.path + '/') && p.split('/').length === depth) docs.push(snapDoc(p));
    docs.sort((a, b) => a.id < b.id ? -1 : 1);
    s.cb({docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: meta});
  };
  const notify = () => subs.forEach(fire);
  const toErr = e => ({code: e && (e.code === '42501' || e.code === 'PGRST301') ? 'invalid_argument' : 'unavailable', message: (e && e.message) || ''});
  async function loadAll(){
    const {data, error} = await sb.from('docs').select('path,data');
    if (error) throw error;
    store.clear(); (data || []).forEach(r => store.set(r.path, r.data)); ready = true; notify();
  }
  const readyP = loadAll().catch(e => { console.error('Laden fehlgeschlagen', e); });
  sb.channel('kp-docs').on('postgres_changes', {event: '*', schema: 'public', table: 'docs'}, p => {
    if (p.eventType === 'DELETE'){ if (p.old && p.old.path) store.delete(p.old.path); }
    else if (p.new && p.new.path) store.set(p.new.path, p.new.data);
    notify();
  }).subscribe();
  setInterval(() => { if (document.visibilityState === 'visible') loadAll().catch(() => {}); }, 30000);
  function deepMerge(t, s){ Object.keys(s).forEach(k => { const v = s[k]; if (v && typeof v === 'object' && !Array.isArray(v) && t[k] && typeof t[k] === 'object' && !Array.isArray(t[k])) deepMerge(t[k], v); else t[k] = v; }); return t; }
  const docRef = path => ({
    id: path.split('/').pop(), path,
    get: async () => { await readyP; return snapDoc(path); },
    set: async data => {
      const prev = store.get(path); store.set(path, clone(data)); notify();
      const {error} = await sb.from('docs').upsert({path, collection: path.split('/').slice(0, -1).join('/'), data, updated_by: uid, updated_at: new Date().toISOString()});
      if (error){ if (prev === undefined) store.delete(path); else store.set(path, prev); notify(); throw toErr(error); }
    },
    update: async data => {
      const cur = store.get(path);
      if (cur === undefined) throw {code: 'invalid_argument', message: 'Dokument fehlt'};
      return docRef(path).set(deepMerge(clone(cur), data));
    },
    delete: async () => {
      const prev = store.get(path); store.delete(path); notify();
      const {error} = await sb.from('docs').delete().eq('path', path);
      if (error){ if (prev !== undefined) store.set(path, prev); notify(); throw toErr(error); }
    },
    onSnapshot: cb => { const s = {type: 'doc', path, cb}; subs.add(s); if (ready) setTimeout(() => fire(s), 0); return () => subs.delete(s); },
    collection: sub => colRef(path + '/' + sub)
  });
  const colRef = path => ({
    path,
    doc: id => docRef(path + '/' + (id || rid())),
    add: async d => { const r = docRef(path + '/' + rid()); await r.set(d); return r; },
    onSnapshot: cb => { const s = {type: 'col', path, cb}; subs.add(s); if (ready) setTimeout(() => fire(s), 0); return () => subs.delete(s); }
  });

  const PAL = ['#2F6FD6', '#D6732F', '#2F9E6B', '#8E44AD', '#C0392B', '#16808A'];
  const colorOf = id => { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return PAL[h % PAL.length]; };
  const xml = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'}[c]));
  const initials = n => (String(n).trim().split(/\s+/).map(w => w[0] || '').join('').slice(0, 2) || '?').toUpperCase();
  const avatar = (name, color) => 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="16" fill="' + color + '"/><text x="16" y="21" text-anchor="middle" font-family="Arial,sans-serif" font-size="13" font-weight="700" fill="#fff">' + xml(initials(name)) + '</text></svg>');
  const names = {}; let lastLoad = 0;
  async function loadNames(force){
    if (!force && Date.now() - lastLoad < 15000) return;
    lastLoad = Date.now();
    const {data} = await sb.from('profile').select('id,name');
    (data || []).forEach(r => { names[r.id] = r.name; });
  }
  const myNameP = (async () => {
    const {data} = await sb.from('mitglieder').select('email,name');
    const m = (data || []).find(x => String(x.email).toLowerCase() === email);
    const nm = (m && m.name) || email.split('@')[0];
    await sb.from('profile').upsert({id: uid, name: nm});
    names[uid] = nm; await loadNames(true);
    return nm;
  })();
  const user = {
    me: async () => { const nm = await myNameP; return {id: uid, name: nm, avatarUrl: avatar(nm, colorOf(uid)), color: colorOf(uid), email, isOwner: false, canEdit: true}; },
    id: async () => uid, can: async () => true, isOwner: async () => false, canEdit: async () => true,
    name: async () => myNameP, email: async () => email,
    profiles: async ids => {
      ids = [].concat(ids).filter(Boolean);
      if (ids.some(id => !(id in names))) await loadNames(false);
      return Object.fromEntries(ids.map(id => [id, {id, name: names[id] || '', avatarUrl: avatar(names[id] || '?', colorOf(id)), color: colorOf(id), email: null, isMe: id === uid, guest: false}]));
    }
  };
  const downloads = {
    save: async ({filename, data}) => {
      const blob = data instanceof Blob ? data : new Blob([data]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      return {status: 'saved'};
    }
  };
  const db = {doc: docRef, collection: colRef};
  return {use: name => Promise.resolve(({db, user, downloads})[name] || null)};
}
})();
