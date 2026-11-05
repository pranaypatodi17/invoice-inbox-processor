/* Ledgerloop workspace app — client-side, state persisted in localStorage */
(function () {
  'use strict';
  const L = window.LL;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const inr = (n) => '₹' + Math.round(n).toLocaleString('en-IN');
  const inr2 = (n) => '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const lakh = (n) => n >= 1e7 ? '₹' + (n / 1e7).toFixed(2) + ' Cr' : n >= 1e5 ? '₹' + (n / 1e5).toFixed(2) + ' L' : inr(n);
  const num = (n, d) => Number(n).toLocaleString('en-IN', { maximumFractionDigits: d == null ? 2 : d });
  const num2 = (n) => Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtD = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  const fmtDs = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  const fmtT = (d) => new Date(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  const now = () => new Date();
  const dayMs = 86400000;
  function rel(d) {
    const s = (Date.now() - new Date(d)) / 1000;
    if (s < 45) return 'just now';
    if (s < 3600) return Math.round(s / 60) + ' min ago';
    if (s < 86400 && new Date(d).getDate() === new Date().getDate()) return fmtT(d);
    if (s < 172800) return 'Yesterday';
    return fmtDs(d);
  }
  function daysUntil(d) { const a = new Date(d); a.setHours(0, 0, 0, 0); const b = new Date(); b.setHours(0, 0, 0, 0); return Math.round((a - b) / dayMs); }

  const vendorById = {}; L.vendors.forEach((v) => vendorById[v.id] = v);
  const poById = {}; L.pos.forEach((p) => poById[p.id] = p);
  const V = (inv) => vendorById[inv.vendorId];
  const PALETTE = [['#eef0ff', '#4f46e5'], ['#e6f7f5', '#0d9488'], ['#fff5e3', '#b45309'], ['#fdecea', '#dc2626'], ['#f5ebff', '#9333ea'], ['#e9f0ff', '#2563eb'], ['#e8f7ee', '#16a34a'], ['#fde7d4', '#c2410c']];
  function vColor(v) { let h = 0; for (const c of v.name) h = (h * 31 + c.charCodeAt(0)) | 0; return PALETTE[Math.abs(h) % PALETTE.length]; }
  function vInit(v) { return v.name.replace(/(Pvt|Ltd|LLP|Co\.)/g, '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase(); }
  function vAvatar(v, sm) { const c = vColor(v); return '<span class="va" style="background:' + c[0] + ';color:' + c[1] + (sm ? ';width:26px;height:26px;font-size:10px' : '') + '">' + vInit(v) + '</span>'; }
  const ME = L.team[0];
  L.STATUS.rejected = { label: 'Rejected', tone: 'gray' };

  // ---------- TDS rules ----------
  const TDS = { Freight: ['194C', 2], Maintenance: ['194C', 2], Software: ['194J', 10] };
  function tdsFor(inv) { const t = TDS[V(inv).category]; return t ? { sec: t[0], rate: t[1], amt: Math.round(inv.taxable * t[1] / 100) } : null; }
  function netPayable(inv) { const t = tdsFor(inv); return inv.total - (t ? t.amt : 0); }

  // ---------- persistence ----------
  const KEY = 'll_workspace_v1';
  const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
  let store = { inv: {}, added: [], emails: [], read: {}, notifRead: false, settings: {}, ints: {} };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) store = Object.assign(store, JSON.parse(raw, (k, v) => typeof v === 'string' && ISO.test(v) ? new Date(v) : v));
  } catch (e) { /* storage unavailable */ }
  // re-apply saved state
  store.added.forEach((inv) => { if (!L.invoices.find((x) => x.id === inv.id)) L.invoices.push(inv); });
  L.invoices.forEach((inv) => { if (store.inv[inv.id]) Object.assign(inv, store.inv[inv.id]); });
  (store.pos || []).forEach((p) => { if (!poById[p.id]) { L.pos.unshift(p); poById[p.id] = p; } });
  store.emails.forEach((m) => { if (!L.emails.find((x) => x.id === m.id)) L.emails.push(m); });
  L.invoices.sort((a, b) => b.received - a.received);
  L.emails.sort((a, b) => b.at - a.at);
  function save(inv) {
    if (inv) {
      if (store.added.find((x) => x.id === inv.id)) store.added = store.added.map((x) => x.id === inv.id ? inv : x);
      else store.inv[inv.id] = { status: inv.status, bill: inv.bill, payment: inv.payment, exception: inv.exception, resolved: inv.resolved, events: inv.events, number: inv.number, invDate: inv.invDate, due: inv.due, assignee: inv.assignee, approved: inv.approved, edited: inv.edited };
    }
    try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* ignore */ }
  }
  const settings = Object.assign({ priceTol: 2, priceAbs: 5000, qtyTol: 0, autoPost: true, autoSchedule: true, payDay: 'Friday', slackChannel: '#ap-exceptions', approvalLimit: 500000, dupWindow: 365 }, store.settings);

  // ---------- toast ----------
  function toast(title, sub, ic, action) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = '<span class="ti">' + icon(ic || 'check') + '</span><div><b>' + title + '</b>' + (sub ? '<small>' + sub + '</small>' : '') + (action ? '<div style="margin-top:6px"><a class="link" style="color:#a5b4fc">' + action.label + ' →</a></div>' : '') + '</div><button aria-label="Dismiss">×</button>';
    $('#toasts').appendChild(t);
    const kill = () => { t.classList.add('out'); setTimeout(() => t.remove(), 250); };
    t.querySelector('button').onclick = kill;
    if (action) t.querySelector('a').onclick = () => { action.fn(); kill(); };
    setTimeout(kill, action ? 7000 : 4500);
  }

  // ---------- modal ----------
  function modal(o) {
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = '<form class="modal" style="' + (o.width ? 'width:min(' + o.width + 'px,100%)' : '') + '"><div class="modal-h"><div><h3>' + o.title + '</h3>' + (o.sub ? '<p>' + o.sub + '</p>' : '') + '</div><button type="button" class="modal-x" aria-label="Close">×</button></div><div class="modal-b">' + o.body + '</div>' + (o.ok !== false ? '<div class="modal-f">' + (o.extra || '') + '<button type="button" class="btn btn-ghost" data-close>' + (o.cancel || 'Cancel') + '</button><button class="btn ' + (o.danger ? 'btn-dark' : 'btn-primary') + '" type="submit">' + (o.ok || 'Save') + '</button></div>' : '') + '</form>';
    document.body.appendChild(bg);
    const close = () => { bg.remove(); document.removeEventListener('keydown', onEsc); };
    const onEsc = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onEsc);
    bg.querySelector('.modal-x').onclick = close;
    $$('[data-close]', bg).forEach((b) => b.onclick = close);
    bg.addEventListener('mousedown', (e) => { if (e.target === bg) close(); });
    bg.querySelector('form').onsubmit = (e) => { e.preventDefault(); if (o.onOk && o.onOk(bg) === false) return; close(); };
    if (o.onOpen) o.onOpen(bg, close);
    const f = bg.querySelector('input:not([type=hidden]),textarea,select'); if (f && !o.noFocus) setTimeout(() => f.focus(), 50);
    return { el: bg, close };
  }

  // ---------- derived ----------
  const needsAction = (i) => ['exception', 'review', 'duplicate'].includes(i.status);
  const EXC_TONE = { price: 'red', qty: 'red', nopo: 'amber', gstin: 'red', tax: 'amber', dup: 'purple' };
  function statusBadge(inv) {
    const s = L.STATUS[inv.status];
    let lbl = s.label;
    if (inv.status === 'scheduled' && inv.payment && daysUntil(inv.payment.date) < 0) return '<span class="badge red">Overdue ' + -daysUntil(inv.payment.date) + 'd</span>';
    if (inv.status === 'scheduled' && inv.approved) lbl = 'In payment run';
    return '<span class="badge ' + s.tone + (inv.status === 'extracting' ? ' pulse' : '') + '">' + lbl + '</span>';
  }
  function excLabel(inv) { return L.EXC[inv.exception] || (inv.status === 'review' ? 'Low-confidence fields need review' : ''); }
  function confBar(c) { const col = c >= 92 ? 'var(--green)' : c >= 85 ? 'var(--amber)' : 'var(--red)'; return '<span class="conf"><i style="--w:' + c + '%;--c:' + col + '"></i>' + c.toFixed(1) + '%</span>'; }
  function last(days) { const t = Date.now() - days * dayMs; return L.invoices.filter((i) => i.received >= t); }

  function updateCounts() {
    const exc = L.invoices.filter(needsAction).length;
    $('#cExc').textContent = exc || '';
    $('#cExc').style.display = exc ? '' : 'none';
    const unread = L.emails.filter((m) => !store.read[m.id] && !m.ignored).filter((m) => (Date.now() - m.at) < 0.5 * dayMs).length;
    $('#cInbox').textContent = unread || '';
    $('#cInbox').style.display = unread ? '' : 'none';
    const used = L.invoices.filter((i) => i.received.getMonth() === now().getMonth() && i.received.getFullYear() === now().getFullYear()).length;
    const cycle = last(30).length;
    const pct = Math.min(100, cycle / L.company.planLimit * 100);
    $('#usage').innerHTML = '<div style="display:flex;justify-content:space-between"><b>Invoice volume</b><span class="muted">30 days</span></div><div class="bar"><i style="width:' + pct + '%"></i></div><div style="display:flex;justify-content:space-between"><span><b>' + cycle + '</b> / ' + L.company.planLimit + '</span><a href="#/settings" data-tab="billing">Upgrade</a></div>';
    document.title = (exc ? '(' + exc + ') ' : '') + 'Ledgerloop · Arvind Precision Components';
    return used;
  }

  // ---------- router ----------
  const routes = {};
  let current = '';
  function go(h) { location.hash = h; }
  function route() {
    const h = location.hash.replace(/^#\/?/, '') || 'overview';
    const [path, qs] = h.split('?');
    const parts = path.split('/');
    const name = routes[parts[0]] ? parts[0] : 'overview';
    const params = new URLSearchParams(qs || '');
    current = name;
    $$('.side a.nl').forEach((a) => a.classList.toggle('on', a.dataset.r === name));
    $('#side').classList.remove('open');
    const view = $('#view');
    view.innerHTML = '<div class="page">' + routes[name].render(params, parts) + '</div>';
    if (routes[name].mount) routes[name].mount(view, params, parts);
    window.scrollTo(0, 0);
    updateCounts();
  }
  function rerender() {
    const view = $('#view');
    const y = window.scrollY;
    const h = location.hash.replace(/^#\/?/, '') || 'overview';
    const [path, qs] = h.split('?');
    const parts = path.split('/');
    const params = new URLSearchParams(qs || '');
    view.innerHTML = '<div class="page" style="animation:none">' + routes[current].render(params, parts) + '</div>';
    if (routes[current].mount) routes[current].mount(view, params, parts);
    window.scrollTo(0, y);
    updateCounts();
  }

  // =====================================================================
  // OVERVIEW
  // =====================================================================
  routes.overview = {
    render() {
      const d30 = last(30), d14 = last(14);
      const prev14 = L.invoices.filter((i) => i.received < Date.now() - 14 * dayMs && i.received >= Date.now() - 28 * dayMs);
      const delta = prev14.length ? Math.round((d14.length - prev14.length) / prev14.length * 100) : 0;
      const touched = d30.filter((i) => i.resolved || needsAction(i)).length;
      const touchless = d30.length ? (1 - touched / d30.length) * 100 : 0;
      const act = L.invoices.filter(needsAction);
      const actAmt = act.reduce((s, i) => s + i.total, 0);
      const due7 = L.invoices.filter((i) => i.status === 'scheduled' && daysUntil(i.payment.date) <= 7);
      const due7Amt = due7.reduce((s, i) => s + netPayable(i), 0);
      const overdue = due7.filter((i) => daysUntil(i.payment.date) < 0).length;
      const h = new Date().getHours();
      const greet = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
      const todayCount = L.invoices.filter((i) => daysUntil(i.received) === 0).length;

      // funnel for 30 days
      const f = {
        rec: d30.length,
        ext: d30.filter((i) => i.status !== 'extracting' && i.status !== 'received').length,
        val: d30.filter((i) => !['extracting', 'received'].includes(i.status) && i.exception !== 'gstin' && i.exception !== 'dup').length,
        mat: d30.filter((i) => ['posted', 'scheduled', 'paid'].includes(i.status) && !i.resolved).length,
        post: d30.filter((i) => ['posted', 'scheduled', 'paid'].includes(i.status)).length,
        paid: d30.filter((i) => i.status === 'paid').length
      };
      const fr = (n) => (n / (f.rec || 1) * 100).toFixed(0);

      const upcoming = L.invoices.filter((i) => i.status === 'scheduled').sort((a, b) => a.payment.date - b.payment.date).slice(0, 5);
      const events = [];
      L.invoices.slice(0, 40).forEach((i) => i.events.forEach((e) => events.push(Object.assign({ inv: i }, e))));
      events.sort((a, b) => b.at - a.at);

      // spend by vendor 30d
      const spend = {};
      d30.forEach((i) => spend[i.vendorId] = (spend[i.vendorId] || 0) + i.total);
      const top = Object.entries(spend).sort((a, b) => b[1] - a[1]).slice(0, 5);
      const topMax = top.length ? top[0][1] : 1;

      return `
      <div class="ph"><div><h1>${greet}, ${ME.name.split(' ')[0]}</h1><p>${todayCount} invoices arrived today · ${act.length} need your attention · next payment run ${settings.payDay}</p></div>
        <div class="acts"><button class="btn btn-ghost" data-act="upload">${icon('upload')}Upload invoice</button><a class="btn btn-primary" href="#/exceptions">${icon('alert')}Review exceptions (${act.length})</a></div></div>
      <div class="grid g4">
        <div class="card kpi clickable" data-go="#/invoices"><div class="kl">${icon('file')}Invoices processed · 30d</div><div class="kv">${d30.length.toLocaleString('en-IN')}</div><div class="kd"><span class="${delta >= 0 ? 'up' : 'down'}">${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)}%</span> vs previous 14 days</div></div>
        <div class="card kpi"><div class="kl">${icon('zap')}Touchless rate</div><div class="kv">${touchless.toFixed(1)}%</div><div class="kd">${d30.length - touched} of ${d30.length} posted with no human touch</div></div>
        <div class="card kpi clickable" data-go="#/exceptions"><div class="kl" style="color:var(--red)">${icon('alert')}Awaiting action</div><div class="kv">${act.length}</div><div class="kd">${lakh(actAmt)} on hold · oldest ${act.length ? rel(act[act.length - 1].received) : '—'}</div></div>
        <div class="card kpi clickable" data-go="#/payments"><div class="kl">${icon('calendar')}Due in next 7 days</div><div class="kv">${lakh(due7Amt)}</div><div class="kd">${due7.length} bills${overdue ? ' · <span class="down">' + overdue + ' overdue</span>' : ' · none overdue'}</div></div>
      </div>

      <div class="grid g-main" style="margin-top:16px">
        <div class="card">
          <div class="card-h"><div><h3>Invoice volume</h3><span class="sub">Last 14 days · by outcome</span></div><div class="legend"><span><i style="background:var(--brand)"></i>Touchless</span><span><i style="background:#f59e0b"></i>Needed review</span></div></div>
          <div class="card-b"><svg class="chart" id="volChart" viewBox="0 0 700 220" preserveAspectRatio="none"></svg></div>
        </div>
        <div class="card">
          <div class="card-h"><div><h3>Pipeline</h3><span class="sub">Last 30 days</span></div></div>
          <div class="card-b funnel">
            ${[['Received', f.rec, '#94a3b8'], ['Extracted', f.ext, '#6366f1'], ['GSTIN & dup check', f.val, '#4f46e5'], ['Auto-matched', f.mat, '#0d9488'], ['Bill posted', f.post, '#2563eb'], ['Paid', f.paid, '#16a34a']].map((r) => `<div class="fn-row"><span>${r[0]}</span><div class="fn-bar"><i style="width:0;background:${r[2]}" data-w="${fr(r[1])}%"></i></div><b>${r[1]}</b></div>`).join('')}
            <div style="display:flex;justify-content:space-between;border-top:1px solid var(--line);padding-top:12px;margin-top:4px;font-size:13px"><span class="muted">Median email → bill</span><b>41 sec</b></div>
          </div>
        </div>
      </div>

      <div class="grid g-main" style="margin-top:16px">
        <div class="card">
          <div class="card-h"><div><h3>Live activity</h3><span class="sub">Everything Ledgerloop did for you</span></div><span class="badge green pulse">Live</span></div>
          <div class="feed" id="feed">${events.slice(0, 9).map(evRow).join('')}</div>
        </div>
        <div class="grid" style="align-content:start">
          <div class="card">
            <div class="card-h"><h3>Needs your attention</h3><a class="link" href="#/exceptions">View all</a></div>
            <div>${act.slice(0, 4).map((i) => `<div class="ev" style="cursor:pointer" data-open="${i.id}"><span class="ei tone-${i.status === 'duplicate' ? 'slack' : i.status === 'review' ? 'warn' : 'err'}">${icon(i.status === 'duplicate' ? 'copy' : 'alert')}</span><div><b>${esc(V(i).name)}</b><small>${esc(excLabel(i))}</small></div><b style="font-size:13px">${inr(i.total)}</b></div>`).join('') || '<div class="empty"><b>All clear</b>No exceptions waiting.</div>'}</div>
          </div>
          <div class="card">
            <div class="card-h"><h3>Upcoming payments</h3><a class="link" href="#/payments">Payment run</a></div>
            <div>${upcoming.map((i) => { const du = daysUntil(i.payment.date); return `<div class="ev" style="cursor:pointer" data-open="${i.id}">${vAvatar(V(i))}<div><b>${esc(V(i).name)}</b><small>${esc(i.number)} · ${i.payment.mode}</small></div><div style="text-align:right"><b style="font-size:13px">${inr(netPayable(i))}</b><small style="${du < 0 ? 'color:var(--red);font-weight:600' : ''}">${du < 0 ? 'Overdue ' + -du + 'd' : du === 0 ? 'Today' : 'in ' + du + 'd · ' + fmtDs(i.payment.date)}</small></div></div>`; }).join('')}</div>
          </div>
        </div>
      </div>

      <div class="grid g2" style="margin-top:16px">
        <div class="card"><div class="card-h"><div><h3>Top vendors by spend</h3><span class="sub">Last 30 days</span></div><a class="link" href="#/vendors">All vendors</a></div>
          <div class="card-b funnel">${top.map(([id, amt]) => `<div class="fn-row" style="grid-template-columns:200px 1fr 90px"><span style="display:flex;gap:8px;align-items:center;overflow:hidden;white-space:nowrap">${vAvatar(vendorById[id], 1)}<span style="overflow:hidden;text-overflow:ellipsis">${esc(vendorById[id].name)}</span></span><div class="fn-bar"><i style="width:0;background:var(--brand)" data-w="${amt / topMax * 100}%"></i></div><b>${lakh(amt)}</b></div>`).join('')}</div></div>
        <div class="card"><div class="card-h"><div><h3>Exceptions by reason</h3><span class="sub">Last 30 days · ${touched} total</span></div></div>
          <div class="card-b funnel">${excBreakdown(d30)}</div></div>
      </div>`;
    },
    mount(view) {
      drawVolume($('#volChart'));
      requestAnimationFrame(() => $$('[data-w]', view).forEach((el) => el.style.width = el.dataset.w));
    }
  };

  function excBreakdown(list) {
    const c = {};
    list.forEach((i) => { const t = i.resolved ? i.resolved.type : needsAction(i) ? (i.exception || 'review') : null; if (t) c[t] = (c[t] || 0) + 1; });
    const lab = Object.assign({}, L.EXC, { review: 'Low-confidence extraction' });
    const tot = Object.values(c).reduce((a, b) => a + b, 0) || 1;
    const col = { price: '#dc2626', qty: '#f97316', nopo: '#d97706', gstin: '#be123c', tax: '#eab308', dup: '#9333ea', review: '#64748b' };
    return Object.entries(c).sort((a, b) => b[1] - a[1]).map(([k, n]) => `<div class="fn-row" style="grid-template-columns:200px 1fr 50px"><span>${lab[k]}</span><div class="fn-bar"><i style="width:0;background:${col[k]}" data-w="${n / tot * 100}%"></i></div><b>${n}</b></div>`).join('');
  }

  function evRow(e) {
    const ic = { mail: 'mail', ai: 'sparkles', ok: 'check', warn: 'alert', slack: 'slack', book: 'book', pay: 'calendar', err: 'x', note: 'send' }[e.kind] || 'check';
    return `<div class="ev${e.fresh ? ' new' : ''}" style="cursor:pointer" data-open="${e.inv.id}"><span class="ei tone-${e.kind === 'note' ? 'ai' : e.kind}">${icon(ic)}</span><div><span>${esc(e.text)}</span><small>${esc(V(e.inv).name)} · ${esc(e.inv.number)}</small></div><time>${rel(e.at)}</time></div>`;
  }

  function drawVolume(svg) {
    if (!svg) return;
    const days = [];
    for (let d = 13; d >= 0; d--) {
      const day = new Date(); day.setDate(day.getDate() - d);
      const list = L.invoices.filter((i) => i.received.toDateString() === day.toDateString());
      const rev = list.filter((i) => i.resolved || needsAction(i)).length;
      days.push({ day, a: list.length - rev, b: rev });
    }
    const W = 700, H = 220, padL = 30, padB = 26, top = 10;
    const max = Math.max(10, ...days.map((d) => d.a + d.b));
    const step = Math.ceil(max / 4 / 5) * 5;
    const nice = Math.ceil(max / step) * step, ticks = nice / step;
    const bw = (W - padL) / days.length;
    let s = '';
    for (let g = 0; g <= ticks; g++) {
      const y = top + (H - padB - top) * (1 - g / ticks);
      s += `<line x1="${padL}" x2="${W}" y1="${y}" y2="${y}" stroke="#eef1f6"/><text x="${padL - 6}" y="${y + 4}" text-anchor="end">${g * step}</text>`;
    }
    days.forEach((d, i) => {
      const x = padL + i * bw + bw * 0.22, w = bw * 0.56;
      const sc = (H - padB - top) / nice;
      const ha = d.a * sc, hb = d.b * sc;
      const y0 = H - padB;
      const tip = `${d.day.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}: ${d.a + d.b} invoices · ${d.a} touchless · ${d.b} reviewed`;
      s += `<g data-tip="${tip}"><rect x="${x}" y="${y0 - ha}" width="${w}" height="${Math.max(0, ha)}" rx="3" class="bar-a"/><rect x="${x}" y="${y0 - ha - hb - (hb ? 2 : 0)}" width="${w}" height="${hb}" rx="3" class="bar-b"/><rect x="${padL + i * bw}" y="${top}" width="${bw}" height="${H - padB - top}" fill="transparent"/></g>`;
      if (i % 2 === 0 || i === 13) s += `<text x="${x + w / 2}" y="${H - 8}" text-anchor="middle">${i === 13 ? 'Today' : d.day.getDate() + ' ' + d.day.toLocaleDateString('en-IN', { month: 'short' })}</text>`;
    });
    svg.innerHTML = s;
    let tipEl;
    $$('g[data-tip]', svg).forEach((g) => {
      g.addEventListener('mousemove', (e) => { if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'ctip'; document.body.appendChild(tipEl); } tipEl.textContent = g.dataset.tip; tipEl.style.left = (e.clientX + 12) + 'px'; tipEl.style.top = (e.clientY - 36) + 'px'; });
      g.addEventListener('mouseleave', () => { if (tipEl) { tipEl.remove(); tipEl = null; } });
    });
  }

  // =====================================================================
  // INBOX
  // =====================================================================
  let inboxSel = null, inboxFilter = 'all';
  routes.inbox = {
    render() {
      const list = L.emails.filter((m) => inboxFilter === 'all' ? true : inboxFilter === 'inv' ? !m.ignored : !!m.ignored);
      if (!inboxSel || !L.emails.find((m) => m.id === inboxSel)) inboxSel = list[0] && list[0].id;
      return `<div class="ph"><div><h1>Inbox</h1><p>Monitoring <b>${L.company.inbox}</b> · ${L.emails.length} emails in the last 45 days</p></div><div class="acts"><button class="btn btn-ghost" data-act="sync">${icon('refresh')}Sync now</button><button class="btn btn-ghost" data-act="forward">${icon('send')}Forwarding address</button></div></div>
      <div class="card" style="overflow:hidden">
        <div class="toolbar"><div class="tabs">${[['all', 'All mail'], ['inv', 'Invoices'], ['ign', 'Filtered out']].map((t) => `<button class="tab${inboxFilter === t[0] ? ' on' : ''}" data-ifilter="${t[0]}">${t[1]}</button>`).join('')}</div><span class="muted" style="margin-left:auto;font-size:12.5px">${icon('sparkles', '').replace('<svg', '<svg style="width:14px;height:14px;display:inline;vertical-align:-2px"')} AI classifier filtered ${L.emails.filter((m) => m.ignored).length} non-invoice emails</span></div>
        <div class="inbox" id="inboxPane">
          <div class="mlist">${list.map(mailRow).join('')}</div>
          <div class="mview" id="mview"></div>
        </div>
      </div>`;
    },
    mount(view) {
      showMail(inboxSel, true);
      view.addEventListener('click', (e) => {
        const r = e.target.closest('.mi'); if (r) { showMail(r.dataset.m); $('#inboxPane').classList.add('reading'); }
        const f = e.target.closest('[data-ifilter]'); if (f) { inboxFilter = f.dataset.ifilter; inboxSel = null; rerender(); }
      });
    }
  };
  function mailRow(m) {
    const inv = m.invId && L.invoices.find((i) => i.id === m.invId);
    return `<div class="mi${m.id === inboxSel ? ' on' : ''}${!store.read[m.id] && (Date.now() - m.at) < 0.5 * dayMs && !m.ignored ? ' unread' : ''}${m.fresh ? ' new' : ''}" data-m="${m.id}"><div class="row"><span class="mf">${esc(m.from)}${m.vendor && m.vendor !== m.from ? ' <span class="muted" style="font-weight:500">· ' + esc(m.vendor) + '</span>' : ''}</span><time>${rel(m.at)}</time></div><div class="ms">${esc(m.subject)}</div><div class="row"><span class="att">${m.file ? icon('paperclip') + esc(m.file) : ''}</span>${inv ? statusBadge(inv) : m.ignored ? '<span class="badge gray plain">Filtered</span>' : ''}</div></div>`;
  }
  function showMail(id, initial) {
    const m = L.emails.find((x) => x.id === id); if (!m) { $('#mview').innerHTML = '<div class="empty">' + icon('inbox') + '<b>No email selected</b></div>'; return; }
    inboxSel = id;
    if (!initial || !store.read[id]) { store.read[id] = 1; save(); }
    $$('.mi').forEach((r) => { r.classList.toggle('on', r.dataset.m === id); if (r.dataset.m === id) r.classList.remove('unread'); });
    const inv = m.invId && L.invoices.find((i) => i.id === m.invId);
    const v = inv && V(inv);
    let proc = '';
    if (inv) {
      const st = inv.status;
      const extracted = st !== 'extracting' && st !== 'received';
      const gOk = inv.exception !== 'gstin';
      const dOk = inv.exception !== 'dup';
      const mOk = !inv.exception || inv.exception === 'gstin' || inv.exception === 'dup';
      const steps = [
        ['ok', 'Classified as vendor invoice', '99.4% · ' + inv.pages + '-page PDF'],
        [extracted ? 'ok' : 'run', 'Extracted fields with OCR + AI', extracted ? '14 fields · ' + inv.lines.length + ' line items · ' + inv.confidence.toFixed(1) + '% avg confidence' : 'Reading ' + m.file + '…'],
        [!extracted ? '' : gOk ? 'ok' : 'bad', 'GSTIN validation', !extracted ? 'Waiting' : gOk ? inv.gstin + ' · Active' : inv.gstin + ' · checksum failed'],
        [!extracted ? '' : dOk ? 'ok' : 'warn', 'Duplicate check', !extracted ? 'Waiting' : dOk ? 'Unique across 2,914 invoices' : 'Same number & amount as a paid bill'],
        [!extracted ? '' : inv.poId ? (mOk ? 'ok' : 'warn') : 'warn', 'PO & GRN matching', !extracted ? 'Waiting' : inv.poId ? (mOk ? 'Matched ' + inv.poId : excLabel(inv) + ' · ' + inv.poId) : 'No open PO found'],
        [inv.bill ? 'ok' : needsAction(inv) ? 'warn' : '', inv.bill ? 'Bill posted to ' + L.company.books : needsAction(inv) ? 'Sent to accountant on Slack' : 'Post to books', inv.bill ? inv.bill.ref : needsAction(inv) ? settings.slackChannel + ' · ' + (inv.assignee || 'Neha Kulkarni') : 'Waiting']
      ];
      proc = `<div class="proc"><div class="proc-h"><span>${icon('sparkles').replace('<svg', '<svg style="width:15px;height:15px;display:inline;vertical-align:-3px;margin-right:6px;color:var(--brand)"')}Ledgerloop processing</span>${statusBadge(inv)}</div>${steps.map((s) => `<div class="pstep ${s[0]}"><span class="pd">${s[0] === 'ok' ? icon('check') : s[0] === 'warn' || s[0] === 'bad' ? icon(s[0] === 'bad' ? 'x' : 'alert') : ''}</span><span>${s[1]}</span><small>${esc(s[2])}</small></div>`).join('')}</div>
      <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap"><button class="btn btn-primary" data-open="${inv.id}">Open invoice ${icon('arrowRight')}</button>${needsAction(inv) ? `<button class="btn btn-ghost" data-act="slack" data-id="${inv.id}">${icon('slack')}View Slack thread</button>` : ''}</div>`;
    } else if (m.ignored) {
      proc = `<div class="alert-box blue" style="margin-top:20px"><span class="ai">${icon('filter')}</span><div><b>Not an invoice — filtered out</b><p>${esc(m.ignored)}. If this was a mistake, Ledgerloop will learn from it.</p><div class="acts"><button class="btn btn-ghost btn-sm" data-act="reclassify" data-m="${m.id}">Process as invoice</button></div></div></div>`;
    }
    $('#mview').innerHTML = `<button class="btn btn-ghost btn-sm mobile-only" style="margin-bottom:12px" onclick="document.getElementById('inboxPane').classList.remove('reading')">← Back</button>
      <h2>${esc(m.subject)}</h2>
      <div class="mhead">${v ? vAvatar(v) : '<span class="va" style="background:#eef1f6">' + esc(m.from[0]) + '</span>'}<div><b>${esc(m.from)}</b> <span class="muted">&lt;${esc(m.fromEmail)}&gt;</span><div class="muted" style="font-size:12.5px">to ${L.company.inbox} · ${new Date(m.at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</div></div></div>
      <div class="mbody">${esc(m.body)}</div>
      ${m.file ? `<div class="attcard"><span class="pdf">${m.file.split('.').pop().toUpperCase()}</span><div><b style="font-size:13.5px">${esc(m.file)}</b><div class="muted" style="font-size:12px">${m.size || '120 KB'}</div></div>${inv ? `<button class="btn btn-ghost btn-sm" data-open="${inv.id}">${icon('eye')}Preview</button>` : ''}</div>` : ''}
      ${proc}`;
  }

  // =====================================================================
  // INVOICES
  // =====================================================================
  const invState = { tab: 'all', q: '', sort: 'received', dir: -1, page: 1, sel: new Set(), vendor: '' };
  const TABS = [['all', 'All'], ['action', 'Needs action'], ['posted', 'Bill posted'], ['scheduled', 'Scheduled'], ['paid', 'Paid'], ['duplicate', 'Duplicates']];
  function invFilter(i, tab) {
    if (tab === 'all') return true;
    if (tab === 'action') return needsAction(i) && i.status !== 'duplicate';
    return i.status === tab;
  }
  routes.invoices = {
    render(params) {
      if (params.get('tab')) invState.tab = params.get('tab');
      if (params.get('vendor') != null) invState.vendor = params.get('vendor');
      const q = invState.q.toLowerCase();
      let list = L.invoices.filter((i) => invFilter(i, invState.tab)).filter((i) => !invState.vendor || i.vendorId === invState.vendor);
      if (q) list = list.filter((i) => (i.number + ' ' + V(i).name + ' ' + i.gstin + ' ' + (i.poId || '') + ' ' + i.total).toLowerCase().includes(q));
      const k = invState.sort, dir = invState.dir;
      list.sort((a, b) => (k === 'vendor' ? V(a).name.localeCompare(V(b).name) : (a[k] > b[k] ? 1 : a[k] < b[k] ? -1 : 0)) * dir);
      const per = 20, pages = Math.max(1, Math.ceil(list.length / per));
      invState.page = Math.min(invState.page, pages);
      const rows = list.slice((invState.page - 1) * per, invState.page * per);
      const totalAmt = list.reduce((s, i) => s + i.total, 0);
      const th = (key, label, cls) => `<th class="sortable ${cls || ''}" data-sort="${key}">${label}<span class="arr">${invState.sort === key ? (invState.dir > 0 ? ' ↑' : ' ↓') : ''}</span></th>`;
      const vend = invState.vendor && vendorById[invState.vendor];
      return `<div class="ph"><div><h1>Invoices</h1><p>${list.length} invoices · ${lakh(totalAmt)} total${vend ? ' · filtered to <b>' + esc(vend.name) + '</b> <a class="link" href="#/invoices?vendor=">clear</a>' : ''}</p></div><div class="acts"><button class="btn btn-ghost" data-act="export">${icon('download')}Export CSV</button><button class="btn btn-primary" data-act="upload">${icon('plus')}Add invoice</button></div></div>
      <div class="card">
        <div class="toolbar"><div class="tabs">${TABS.map((t) => `<button class="tab${invState.tab === t[0] ? ' on' : ''}" data-tab="${t[0]}">${t[1]} <span class="n">${L.invoices.filter((i) => invFilter(i, t[0])).length}</span></button>`).join('')}</div>
          <label class="tsearch">${icon('search')}<input id="invQ" placeholder="Search number, vendor, GSTIN, PO, amount" value="${esc(invState.q)}"></label></div>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th style="width:36px"><input type="checkbox" class="cb" id="selAll"></th>${th('vendor', 'Vendor')}${th('number', 'Invoice #')}${th('received', 'Received')}<th>PO</th>${th('total', 'Amount', 'num')}${th('due', 'Due')}<th>Status</th><th>Confidence</th></tr></thead>
        <tbody>${rows.map((i) => { const v = V(i); const du = daysUntil(i.due); return `<tr data-open="${i.id}" class="${invState.sel.has(i.id) ? 'sel' : ''}"><td data-stop><input type="checkbox" class="cb" data-sel="${i.id}" ${invState.sel.has(i.id) ? 'checked' : ''}></td><td><div class="v">${vAvatar(v)}<div><b>${esc(v.name)}</b><small class="mono">${esc(i.gstin)}</small></div></div></td><td class="mono">${esc(i.number)}</td><td>${rel(i.received)}<small class="muted" style="display:block;font-size:12px">Inv. ${fmtDs(i.invDate)}</small></td><td>${i.poId ? '<span class="mono">' + i.poId + '</span>' : '<span class="muted">—</span>'}</td><td class="num"><b>${inr2(i.total)}</b></td><td>${i.status === 'paid' ? '<span class="muted">Paid ' + fmtDs(i.payment.paidOn) + '</span>' : fmtDs(i.due) + (du < 0 && i.status !== 'paid' ? ' <small style="color:var(--red);font-weight:600">' + -du + 'd late</small>' : '')}</td><td>${statusBadge(i)}</td><td>${i.status === 'extracting' ? '<span class="muted">…</span>' : confBar(i.confidence)}</td></tr>`; }).join('')}</tbody></table>
        ${rows.length ? '' : `<div class="empty">${icon('search')}<b>No invoices found</b>Try a different search or filter.</div>`}</div>
        <div class="pager"><span>Showing ${list.length ? (invState.page - 1) * per + 1 : 0}–${Math.min(invState.page * per, list.length)} of ${list.length}</span><div class="btns"><button class="btn btn-ghost btn-sm" data-page="-1" ${invState.page <= 1 ? 'disabled' : ''}>← Prev</button><span style="padding:6px 8px">Page ${invState.page} of ${pages}</span><button class="btn btn-ghost btn-sm" data-page="1" ${invState.page >= pages ? 'disabled' : ''}>Next →</button></div></div>
      </div>
      ${invState.sel.size ? `<div class="bulk"><b>${invState.sel.size} selected</b><button class="btn btn-ghost" data-act="bulk-export">${icon('download')}Export</button><button class="btn btn-ghost" data-act="bulk-approve">${icon('check')}Approve &amp; post</button><button class="btn btn-ghost" data-act="bulk-clear">Clear</button></div>` : ''}`;
    },
    mount(view) {
      const qi = $('#invQ');
      let t;
      qi.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { invState.q = qi.value; invState.page = 1; rerender(); const n = $('#invQ'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 180); });
      view.addEventListener('click', (e) => {
        const tb = e.target.closest('[data-tab]'); if (tb && tb.classList.contains('tab')) { invState.tab = tb.dataset.tab; invState.page = 1; invState.sel.clear(); history.replaceState(null, '', '#/invoices'); rerender(); return; }
        const s = e.target.closest('[data-sort]'); if (s) { if (invState.sort === s.dataset.sort) invState.dir *= -1; else { invState.sort = s.dataset.sort; invState.dir = s.dataset.sort === 'vendor' || s.dataset.sort === 'due' ? 1 : -1; } rerender(); return; }
        const p = e.target.closest('[data-page]'); if (p) { invState.page += +p.dataset.page; rerender(); return; }
      });
      view.addEventListener('change', (e) => {
        if (e.target.dataset.sel) { e.target.checked ? invState.sel.add(e.target.dataset.sel) : invState.sel.delete(e.target.dataset.sel); rerender(); }
        if (e.target.id === 'selAll') { $$('[data-sel]').forEach((c) => e.target.checked ? invState.sel.add(c.dataset.sel) : invState.sel.delete(c.dataset.sel)); rerender(); }
      });
      const sa = $('#selAll'); if (sa) sa.checked = $$('[data-sel]').length > 0 && $$('[data-sel]').every((c) => c.checked);
    }
  };

  // =====================================================================
  // EXCEPTIONS
  // =====================================================================
  let excFilter = 'all';
  routes.exceptions = {
    render() {
      const all = L.invoices.filter(needsAction);
      const list = all.filter((i) => excFilter === 'all' || (i.exception || 'review') === excFilter);
      const types = {}; all.forEach((i) => { const k = i.exception || 'review'; types[k] = (types[k] || 0) + 1; });
      const resolved30 = last(30).filter((i) => i.resolved).length;
      const lab = Object.assign({}, L.EXC, { review: 'Low confidence' });
      return `<div class="ph"><div><h1>Exceptions</h1><p>Invoices Ledgerloop couldn't post on its own. Each one is also in <b>${settings.slackChannel}</b> on Slack.</p></div><div class="acts"><a class="btn btn-ghost" href="#/settings">${icon('settings')}Tolerance rules</a></div></div>
      <div class="grid g4" style="margin-bottom:16px">
        <div class="card kpi"><div class="kl">Open exceptions</div><div class="kv">${all.length}</div><div class="kd">${lakh(all.reduce((s, i) => s + i.total, 0))} on hold</div></div>
        <div class="card kpi"><div class="kl">Resolved · 30d</div><div class="kv">${resolved30}</div><div class="kd">by Neha, Rahul &amp; Anita</div></div>
        <div class="card kpi"><div class="kl">Median time to resolve</div><div class="kv">2h 40m</div><div class="kd"><span class="up">▼ 38%</span> since Slack routing</div></div>
        <div class="card kpi"><div class="kl">Saved by catching</div><div class="kv">${lakh(L.invoices.filter((i) => i.resolved && i.resolved.type === 'price').length * 18400 + 64800)}</div><div class="kd">overbilling &amp; duplicates · 30d</div></div>
      </div>
      <div class="card" style="margin-bottom:14px"><div class="toolbar" style="border:0"><div class="tabs"><button class="tab${excFilter === 'all' ? ' on' : ''}" data-ef="all">All <span class="n">${all.length}</span></button>${Object.entries(types).map(([k, n]) => `<button class="tab${excFilter === k ? ' on' : ''}" data-ef="${k}">${lab[k]} <span class="n">${n}</span></button>`).join('')}</div></div></div>
      <div class="exc-list">${list.map(excCard).join('') || `<div class="card empty">${icon('check')}<b>Inbox zero for exceptions 🎉</b>Every invoice has been matched and posted.</div>`}</div>`;
    },
    mount(view) {
      view.addEventListener('click', (e) => { const f = e.target.closest('[data-ef]'); if (f) { excFilter = f.dataset.ef; rerender(); } });
    }
  };
  function excDetail(i) {
    const po = i.poId && poById[i.poId];
    switch (i.exception) {
      case 'price': { const l = i.lines[0], pl = po.lines[0]; return `${esc(l.desc)} billed at <b>${inr2(l.rate)}/${l.unit}</b> vs PO rate <b>${inr2(pl.rate)}</b> (+${((l.rate / pl.rate - 1) * 100).toFixed(1)}%). Variance ${inr(i.total - po.amount)} exceeds tolerance of ±${settings.priceTol}% / ${inr(settings.priceAbs)}.`; }
      case 'qty': { const l = i.lines[0]; return `Invoice bills <b>${num(l.qty, 0)} ${l.unit}</b> of ${esc(l.desc)} but GRN records only <b>${num(po.grn[0], 0)} ${l.unit}</b> received at stores.`; }
      case 'nopo': return `No open purchase order for ${esc(V(i).name)} covers this amount. Closest PO is fully billed. This may be a non-PO service — needs approver sign-off.`;
      case 'gstin': return `GSTIN on invoice <b class="mono">${esc(i.gstin)}</b> fails checksum. Vendor master has <b class="mono">${esc(V(i).gstin)}</b>. Input tax credit at risk if posted as-is.`;
      case 'tax': return `Invoice charges GST @ <b>${i.lines[0].gst}%</b> on HSN ${i.lines[0].hsn} but PO specifies <b>${po.lines[0].gst}%</b>. Tax difference ${inr(i.tax - (po.amount - i.taxable))}.`;
      case 'dup': { const o = dupOriginal(i); return `Same invoice number <b>${esc(i.number)}</b> and amount ${inr(i.total)} as ${o ? `<a class="link" data-open="${o.id}">${o.id}</a> paid on ${fmtD(o.payment && o.payment.paidOn)}` : 'an earlier bill'}. Looks like a re-forwarded email.`; }
      default: return `Due date and one line item were read with low confidence (${i.confidence.toFixed(1)}%). Please confirm the highlighted fields.`;
    }
  }
  function dupOriginal(i) { return L.invoices.find((x) => x !== i && x.number === i.number && x.vendorId === i.vendorId); }
  function excCard(i) {
    const v = V(i);
    const age = (Date.now() - i.received) / 3600000;
    const slaLeft = 24 - age;
    const tone = i.status === 'duplicate' ? 'purple' : i.status === 'review' ? 'amber' : EXC_TONE[i.exception] === 'amber' ? 'amber' : '';
    const asg = L.team.find((t) => t.name === i.assignee) || L.team[0];
    return `<div class="exc"><span class="stripe ${tone}"></span><div class="c"><div class="t">${vAvatar(v, 1)}<b>${esc(v.name)}</b><span class="mono muted">${esc(i.number)}</span>${statusBadge(i)}<span class="badge ${tone || 'red'} plain">${esc(excLabel(i))}</span></div><p>${excDetail(i)}</p><div class="m"><span>Received ${rel(i.received)}</span><span style="display:inline-flex;gap:6px;align-items:center"><span class="avatar sm" style="background:${asg.color}">${asg.initials}</span>${asg.name}</span><span>${icon('slack').replace('<svg', '<svg style="width:13px;height:13px;display:inline;vertical-align:-2px"')} ${settings.slackChannel}</span><span class="sla ${slaLeft < 0 ? 'late' : ''}">${slaLeft < 0 ? 'SLA breached ' + Math.round(-slaLeft) + 'h ago' : 'SLA ' + Math.round(slaLeft) + 'h left'}</span></div></div>
      <div class="r"><span class="amt">${inr(i.total)}</span><div class="acts"><button class="btn btn-ghost btn-sm" data-open="${i.id}">Review</button>${i.status === 'duplicate' ? `<button class="btn btn-dark btn-sm" data-act="reject" data-id="${i.id}">Reject</button>` : `<button class="btn btn-primary btn-sm" data-act="approve" data-id="${i.id}">Approve</button>`}</div></div></div>`;
  }

  // =====================================================================
  // PAYMENTS
  // =====================================================================
  const runSel = new Set();
  let runInit = false, runAll = false;
  routes.payments = {
    render() {
      const sched = L.invoices.filter((i) => i.status === 'scheduled').sort((a, b) => a.payment.date - b.payment.date);
      const posted = L.invoices.filter((i) => i.status === 'posted');
      const overdue = sched.filter((i) => daysUntil(i.payment.date) < 0);
      const week = sched.filter((i) => daysUntil(i.payment.date) <= 7);
      const paidMonth = L.invoices.filter((i) => i.status === 'paid' && i.payment.paidOn && Date.now() - i.payment.paidOn < 30 * dayMs);
      if (!runInit) { week.forEach((i) => runSel.add(i.id)); runInit = true; }
      const runList = week;
      const runTotal = runList.filter((i) => runSel.has(i.id)).reduce((s, i) => s + netPayable(i), 0);
      const groups = {};
      sched.filter((i) => daysUntil(i.payment.date) > 7).forEach((i) => { const d = new Date(i.payment.date); const mon = new Date(d); mon.setDate(d.getDate() - ((d.getDay() + 6) % 7)); const k = mon.toDateString(); (groups[k] = groups[k] || []).push(i); });
      const feed = L.invoices.filter((i) => i.status === 'paid').sort((a, b) => b.payment.paidOn - a.payment.paidOn).slice(0, 10);
      return `<div class="ph"><div><h1>Payments</h1><p>Bills are scheduled by vendor terms. Weekly payment run every <b>${settings.payDay}</b> from HDFC Bank ••4471.</p></div><div class="acts"><button class="btn btn-ghost" data-act="bankconfirm">${icon('bank')}Fetch bank statement</button></div></div>
      <div class="grid g4" style="margin-bottom:16px">
        <div class="card kpi"><div class="kl">${icon('calendar')}Due this week</div><div class="kv">${lakh(week.reduce((s, i) => s + netPayable(i), 0))}</div><div class="kd">${week.length} bills</div></div>
        <div class="card kpi"><div class="kl" style="color:${overdue.length ? 'var(--red)' : ''}">${icon('clock')}Overdue</div><div class="kv">${overdue.length}</div><div class="kd">${overdue.length ? lakh(overdue.reduce((s, i) => s + i.total, 0)) + ' · MSME 45-day risk' : 'All vendors paid on time'}</div></div>
        <div class="card kpi"><div class="kl">${icon('layers')}Total payables</div><div class="kv">${lakh(sched.concat(posted).reduce((s, i) => s + netPayable(i), 0))}</div><div class="kd">${sched.length} scheduled · ${posted.length} awaiting schedule</div></div>
        <div class="card kpi"><div class="kl">${icon('check')}Paid · 30d</div><div class="kv">${lakh(paidMonth.reduce((s, i) => s + netPayable(i), 0))}</div><div class="kd">${paidMonth.length} bills · 100% reconciled</div></div>
      </div>
      <div class="grid g-main">
        <div>
          <div class="card" style="margin-bottom:16px">
            <div class="card-h"><div><h3>This week's payment run</h3><span class="sub">${runList.length} bills due on or before ${fmtD(new Date(Date.now() + 7 * dayMs))}</span></div><div style="display:flex;gap:8px;align-items:center"><b>${inr(runTotal)}</b><button class="btn btn-primary btn-sm" data-act="runpay" ${runSel.size ? '' : 'disabled'}>${icon('send')}Approve &amp; create bank file</button></div></div>
            <div class="tbl-wrap"><table class="tbl"><thead><tr><th style="width:36px"></th><th>Vendor</th><th>Bill</th><th>Due</th><th>Mode</th><th class="num">Invoice</th><th class="num">TDS</th><th class="num">Net payable</th><th></th></tr></thead><tbody>
            ${runList.slice(0, runAll ? 999 : 12).map((i) => { const t = tdsFor(i); const du = daysUntil(i.payment.date); return `<tr data-open="${i.id}"><td data-stop><input type="checkbox" class="cb" data-run="${i.id}" ${runSel.has(i.id) ? 'checked' : ''}></td><td><div class="v">${vAvatar(V(i), 1)}<b>${esc(V(i).name)}</b></div></td><td class="mono">${esc(i.number)}</td><td>${du < 0 ? '<span style="color:var(--red);font-weight:600">' + -du + 'd overdue</span>' : du === 0 ? '<b>Today</b>' : fmtDs(i.payment.date)}</td><td>${i.payment.mode}</td><td class="num">${inr(i.total)}</td><td class="num muted">${t ? '−' + inr(t.amt) + ' <small>' + t.sec + '</small>' : '—'}</td><td class="num"><b>${inr(netPayable(i))}</b></td><td>${i.approved ? '<span class="badge green">Approved</span>' : ''}</td></tr>`; }).join('')}
            </tbody></table>${runList.length ? '' : '<div class="empty"><b>Nothing due this week</b></div>'}</div>
            ${runList.length > 12 ? `<div class="pager"><span>${runAll ? 'Showing all ' + runList.length : 'Showing 12 of ' + runList.length} bills · ${runSel.size} selected</span><button class="link" data-act="runall">${runAll ? 'Show less' : 'Show all ' + runList.length}</button></div>` : ''}
          </div>
          <div class="card">
            <div class="card-h"><h3>Scheduled later</h3><span class="sub">${sched.length - week.length} bills</span></div>
            <div class="card-b">${Object.entries(groups).slice(0, 6).map(([k, list]) => `<div class="pay-week"><h4><span>Week of ${fmtDs(new Date(k))}</span><span>${inr(list.reduce((s, i) => s + netPayable(i), 0))}</span></h4><div class="cal">${list.slice(0, 4).map((i) => `<div class="cal-row" style="cursor:pointer" data-open="${i.id}"><div class="cal-date"><small>${new Date(i.payment.date).toLocaleDateString('en-IN', { month: 'short' })}</small><b>${new Date(i.payment.date).getDate()}</b></div><div><div class="v">${esc(V(i).name)}</div><div class="s">${esc(i.number)} · Net ${V(i).terms} · ${i.payment.mode}</div></div><div class="amt">${inr(netPayable(i))}</div></div>`).join('')}${list.length > 4 ? `<div class="muted" style="font-size:12.5px;padding:4px 12px">+ ${list.length - 4} more bills</div>` : ''}</div></div>`).join('')}</div>
          </div>
        </div>
        <div class="card" style="align-self:start">
          <div class="card-h"><div><h3>Bank feed</h3><span class="sub">HDFC Bank ••4471 · auto-reconciled</span></div><span class="badge green">Connected</span></div>
          <div id="bankFeed">${feed.map((i) => `<div class="bank-row matched" style="cursor:pointer" data-open="${i.id}"><div><b>${i.payment.mode} DR · ${esc(V(i).name.toUpperCase().slice(0, 24))}</b><div class="utr">UTR ${i.payment.utr}</div></div><div><div class="amt">−${inr(netPayable(i))}</div><div class="muted" style="font-size:11.5px;text-align:right">${fmtDs(i.payment.paidOn)}</div></div><div style="grid-column:1/-1;font-size:12px;color:var(--green);font-weight:600">Matched to ${esc(i.number)} · marked paid in ${L.company.books}</div></div>`).join('')}</div>
        </div>
      </div>`;
    },
    mount(view) {
      view.addEventListener('change', (e) => { if (e.target.dataset.run) { e.target.checked ? runSel.add(e.target.dataset.run) : runSel.delete(e.target.dataset.run); rerender(); } });
    }
  };

  // =====================================================================
  // PURCHASE ORDERS
  // =====================================================================
  let poQ = '';
  routes.pos = {
    render() {
      const billed = {};
      L.invoices.forEach((i) => { if (i.poId && !['duplicate'].includes(i.status)) billed[i.poId] = (billed[i.poId] || 0) + i.total; });
      let list = L.pos.slice();
      if (poQ) list = list.filter((p) => (p.id + ' ' + vendorById[p.vendorId].name + ' ' + p.source).toLowerCase().includes(poQ.toLowerCase()));
      const open = L.pos.filter((p) => !billed[p.id]);
      return `<div class="ph"><div><h1>Purchase orders</h1><p>${L.pos.length} POs synced from Google Sheets, Excel (OneDrive) and Tally Prime · last sync ${rel(new Date(Date.now() - 4 * 60000))}</p></div><div class="acts"><button class="btn btn-ghost" data-act="posync">${icon('refresh')}Sync now</button><button class="btn btn-primary" data-act="newpo">${icon('plus')}New PO</button></div></div>
      <div class="grid g3" style="margin-bottom:16px">
        ${[['Google Sheets', 'sheet', '#0f9d58', '“PO Register FY26-27” · tab Purchase'], ['Excel (OneDrive)', 'grid', '#1d6f42', 'Stores/GRN_Log.xlsx'], ['Tally Prime', 'book', '#1c3d72', 'Purchase Orders voucher type']].map((s) => `<div class="card kpi"><div class="kl" style="color:${s[2]}">${icon(s[1])}${s[0]}</div><div class="kv">${L.pos.filter((p) => p.source === s[0]).length}</div><div class="kd">${s[3]}</div></div>`).join('')}
      </div>
      <div class="card"><div class="toolbar"><b>${open.length} open POs</b><label class="tsearch">${icon('search')}<input id="poQ" placeholder="Search PO, vendor" value="${esc(poQ)}"></label></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>PO #</th><th>Vendor</th><th>Date</th><th>Source</th><th>Raised by</th><th class="num">PO value</th><th>Billed</th><th>Status</th></tr></thead><tbody>
      ${list.slice(0, 60).map((p) => { const b = billed[p.id] || 0; const pct = Math.min(100, b / p.amount * 100); const st = b === 0 ? '<span class="badge blue">Open</span>' : b > p.amount * 1.001 ? '<span class="badge red">Over-billed</span>' : '<span class="badge green">Fully billed</span>'; return `<tr data-po="${p.id}"><td class="mono"><b>${p.id}</b></td><td><div class="v">${vAvatar(vendorById[p.vendorId], 1)}<b>${esc(vendorById[p.vendorId].name)}</b></div></td><td>${fmtD(p.date)}</td><td>${p.source}</td><td>${p.raisedBy}</td><td class="num">${inr(p.amount)}</td><td><div class="fn-bar" style="width:90px;display:inline-block;vertical-align:middle"><i style="width:${pct}%;background:${pct > 100.1 ? 'var(--red)' : 'var(--teal)'}"></i></div> <small class="muted">${pct.toFixed(0)}%</small></td><td>${st}</td></tr>`; }).join('')}
      </tbody></table></div><div class="pager"><span>Showing ${Math.min(60, list.length)} of ${list.length}</span></div></div>`;
    },
    mount(view) {
      const q = $('#poQ'); let t;
      q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { poQ = q.value; rerender(); const n = $('#poQ'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 180); });
      view.addEventListener('click', (e) => { const r = e.target.closest('[data-po]'); if (r) openPO(r.dataset.po); });
    }
  };
  function openPO(id) {
    const p = poById[id]; const v = vendorById[p.vendorId];
    const invs = L.invoices.filter((i) => i.poId === id);
    modal({ title: p.id + ' · ' + esc(v.name), sub: 'Raised by ' + p.raisedBy + ' on ' + fmtD(p.date) + ' · source: ' + p.source, width: 720, ok: false,
      body: `<div class="tbl-wrap" style="border:1px solid var(--line);border-radius:10px"><table class="tbl"><thead><tr><th>Item</th><th>HSN</th><th class="num">Qty</th><th class="num">GRN</th><th class="num">Rate</th><th class="num">GST</th></tr></thead><tbody>${p.lines.map((l, k) => `<tr style="cursor:default"><td>${esc(l.desc)}</td><td>${l.hsn}</td><td class="num">${num(l.qty, 0)} ${l.unit}</td><td class="num">${num(p.grn[k], 0)}</td><td class="num">${inr2(l.rate)}</td><td class="num">${l.gst}%</td></tr>`).join('')}</tbody></table></div>
      <div style="display:flex;justify-content:space-between"><span class="muted">PO value incl. GST</span><b>${inr(p.amount)}</b></div>
      <div><b style="font-size:13px">Linked invoices</b>${invs.length ? invs.map((i) => `<div class="ev" style="padding:10px 0;cursor:pointer" data-open="${i.id}" data-closemodal>${vAvatar(v, 1)}<div><b>${esc(i.number)}</b><small>${fmtD(i.invDate)}</small></div><div style="text-align:right">${statusBadge(i)}<small>${inr(i.total)}</small></div></div>`).join('') : '<p class="muted" style="margin-top:6px">No invoices billed against this PO yet.</p>'}</div>` });
  }

  // =====================================================================
  // VENDORS
  // =====================================================================
  let vQ = '';
  routes.vendors = {
    render() {
      const d30 = last(30);
      const list = L.vendors.filter((v) => !vQ || (v.name + v.gstin + v.city + v.category).toLowerCase().includes(vQ.toLowerCase()));
      return `<div class="ph"><div><h1>Vendors</h1><p>${L.vendors.length} active vendors · GSTINs re-verified nightly against the GST portal</p></div><div class="acts"><label class="tsearch" style="min-width:260px">${icon('search')}<input id="vQ" placeholder="Search vendors or GSTIN" value="${esc(vQ)}"></label><button class="btn btn-primary" data-act="newvendor">${icon('plus')}Add vendor</button></div></div>
      <div class="grid g3">${list.map((v) => {
        const invs = L.invoices.filter((i) => i.vendorId === v.id);
        const spend = d30.filter((i) => i.vendorId === v.id).reduce((s, i) => s + i.total, 0);
        const open = invs.filter((i) => ['posted', 'scheduled'].includes(i.status)).reduce((s, i) => s + i.total, 0);
        const exc = invs.filter((i) => needsAction(i)).length;
        const gv = L.validateGstin(v.gstin);
        return `<div class="card vcard" data-vendor="${v.id}"><div class="top1">${vAvatar(v)}<div style="min-width:0"><b>${esc(v.name)}</b><small>${esc(v.city)}, ${v.stateName} · ${v.category}</small></div>${exc ? `<span class="badge red" style="margin-left:auto">${exc}</span>` : ''}</div>
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:12.5px"><span class="mono">${v.gstin}</span>${gv.valid ? '<span class="badge green">GSTIN active</span>' : '<span class="badge red">Invalid</span>'}</div>
        <div class="stats3"><div><b>${lakh(spend)}</b><small>Spend · 30d</small></div><div><b>${lakh(open)}</b><small>Outstanding</small></div><div><b>Net ${v.terms}</b><small>Terms${v.terms >= 45 ? ' · MSME' : ''}</small></div></div></div>`;
      }).join('')}</div>`;
    },
    mount(view) {
      const q = $('#vQ'); let t;
      q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { vQ = q.value; rerender(); const n = $('#vQ'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 180); });
      view.addEventListener('click', (e) => { const c = e.target.closest('[data-vendor]'); if (c) openVendor(c.dataset.vendor); });
    }
  };
  function openVendor(id) {
    const v = vendorById[id];
    const invs = L.invoices.filter((i) => i.vendorId === id);
    const paid = invs.filter((i) => i.status === 'paid');
    const avg = paid.length ? Math.round(paid.reduce((s, i) => s + (i.payment.paidOn - i.invDate) / dayMs, 0) / paid.length) : 0;
    modal({ title: esc(v.name), sub: esc(v.city) + ', ' + v.stateName + ' · vendor since ' + v.since, width: 620, ok: false,
      body: `<dl class="kv"><dt>GSTIN</dt><dd class="mono">${v.gstin}</dd><dt>Contact</dt><dd>${esc(v.contact)} · ${esc(v.email)}</dd><dt>Category</dt><dd>${v.category}</dd><dt>Payment terms</dt><dd>Net ${v.terms} days</dd><dt>TDS</dt><dd>${TDS[v.category] ? 'Section ' + TDS[v.category][0] + ' @ ' + TDS[v.category][1] + '%' : 'Not applicable (goods)'}</dd><dt>Avg. days to pay</dt><dd>${avg} days</dd><dt>Bank</dt><dd>${bankFor(v)}</dd></dl>
      <div><b style="font-size:13px">Recent invoices (${invs.length})</b>${invs.slice(0, 5).map((i) => `<div class="ev" style="padding:10px 0;cursor:pointer" data-open="${i.id}" data-closemodal><span class="ei tone-ai">${icon('file')}</span><div><b>${esc(i.number)}</b><small>${fmtD(i.invDate)}</small></div><div style="text-align:right">${statusBadge(i)}<small>${inr(i.total)}</small></div></div>`).join('')}</div>
      <a class="btn btn-ghost" href="#/invoices?vendor=${v.id}&tab=all" data-closemodal>View all invoices from this vendor</a>` });
  }
  function bankFor(v) {
    const banks = ['HDFC Bank', 'ICICI Bank', 'State Bank of India', 'Axis Bank', 'Kotak Mahindra Bank', 'Bank of Baroda'];
    const codes = ['HDFC', 'ICIC', 'SBIN', 'UTIB', 'KKBK', 'BARB'];
    const k = parseInt(v.id.slice(1)) % banks.length;
    return banks[k] + ' · A/c ••' + (4000 + parseInt(v.id.slice(1)) * 37).toString().slice(-4) + ' · IFSC ' + codes[k] + '000' + (1200 + parseInt(v.id.slice(1)) * 13);
  }

  // =====================================================================
  // INTEGRATIONS
  // =====================================================================
  const INTS = [
    { k: 'gmail', n: 'Gmail', c: '#ea4335', l: 'G', cat: 'Capture', d: 'Monitoring invoices@arvindprecision.in and accounts@ with delegated read access.', on: true, sync: 'just now' },
    { k: 'wa', n: 'WhatsApp Business', c: '#25d366', l: 'W', cat: 'Capture', d: 'Vendors and site staff can forward invoice photos to +91 98220 41190.', on: false },
    { k: 'tally', n: 'Tally Prime', c: '#1c3d72', l: 'T', cat: 'Accounting', d: 'Posting purchase vouchers to company “Arvind Precision 26-27” via Ledgerloop Connector v3.2.', on: true, sync: '2 min ago' },
    { k: 'zoho', n: 'Zoho Books', c: '#e42527', l: 'Z', cat: 'Accounting', d: 'Create bills, vendors and record payments in Zoho Books.', on: false },
    { k: 'sheets', n: 'Google Sheets', c: '#0f9d58', l: 'S', cat: 'Purchase orders', d: 'Reading “PO Register FY26-27” every 5 minutes.', on: true, sync: '4 min ago' },
    { k: 'excel', n: 'Excel · OneDrive', c: '#1d6f42', l: 'X', cat: 'Purchase orders', d: 'Reading GRN log from Stores/GRN_Log.xlsx.', on: true, sync: '9 min ago' },
    { k: 'slack', n: 'Slack', c: '#4a154b', l: '#', cat: 'Exceptions', d: 'Posting exceptions to #ap-exceptions and DMs to assignees.', on: true, sync: '12 min ago' },
    { k: 'teams', n: 'Microsoft Teams', c: '#5059c9', l: 'T', cat: 'Exceptions', d: 'Route approvals to a Teams channel instead of Slack.', on: false },
    { k: 'hdfc', n: 'HDFC Bank', c: '#004c8f', l: 'H', cat: 'Banking', d: 'Bulk payment files and statement feed for ••4471 via ENet.', on: true, sync: '1 hr ago' },
    { k: 'gst', n: 'GST Portal (GSP)', c: '#2d3e8e', l: 'G', cat: 'Compliance', d: 'GSTIN status, e-invoice IRN and GSTR-2B reconciliation.', on: true, sync: 'nightly' },
    { k: 'sap', n: 'SAP Business One', c: '#0f6ab4', l: 'S', cat: 'ERP', d: 'Two-way PO and GRN sync for multi-plant operations.', on: false, plan: 'Scale' },
    { k: 'api', n: 'Webhooks & API', c: '#0d1424', l: '{}', cat: 'Developers', d: 'Push invoice.posted and payment.confirmed events to your systems.', on: false }
  ];
  routes.integrations = {
    render() {
      return `<div class="ph"><div><h1>Integrations</h1><p>${INTS.filter((x) => intOn(x)).length} of ${INTS.length} connected</p></div></div>
      <div class="grid g3">${INTS.map((x) => `<div class="card icard"><div class="row"><span class="int-logo" style="background:${x.c}">${x.l}</span><div style="min-width:0"><b>${x.n}</b><small>${x.cat}</small></div><label class="switch" style="margin-left:auto"><input type="checkbox" data-int="${x.k}" ${intOn(x) ? 'checked' : ''}><span></span></label></div><p>${x.d}</p><div class="foot"><span>${intOn(x) ? '<span class="status-dot">Connected' + (x.sync ? ' · synced ' + x.sync : '') + '</span>' : x.plan ? 'Available on ' + x.plan : 'Not connected'}</span><button class="link" data-cfg="${x.k}">${intOn(x) ? 'Configure' : 'Connect'}</button></div></div>`).join('')}</div>`;
    },
    mount(view) {
      view.addEventListener('change', (e) => {
        const k = e.target.dataset.int; if (!k) return;
        const x = INTS.find((i) => i.k === k);
        if (x.plan && e.target.checked) { e.target.checked = false; toast(x.n + ' needs the ' + x.plan + ' plan', 'Upgrade from Rules & settings → Billing.', 'lock'); return; }
        if (e.target.checked) { e.target.checked = false; connectFlow(x); return; }
        modal({ title: 'Disconnect ' + x.n + '?', sub: 'Ledgerloop will stop syncing. Existing data stays intact.', body: '<p class="muted">You can reconnect any time.</p>', ok: 'Disconnect', danger: true, onOk() { store.ints[k] = false; save(); rerender(); toast(x.n + ' disconnected', '', 'plug'); } });
        e.target.checked = true;
      });
      view.addEventListener('click', (e) => { const c = e.target.closest('[data-cfg]'); if (c) { const x = INTS.find((i) => i.k === c.dataset.cfg); intOn(x) ? configInt(x) : connectFlow(x); } });
    }
  };
  function intOn(x) { return store.ints[x.k] != null ? store.ints[x.k] : x.on; }
  function connectFlow(x) {
    const m = modal({ title: 'Connect ' + x.n, sub: x.d, ok: 'Authorize', body: `<div class="alert-box blue"><span class="ai">${icon('lock')}</span><div><b>Secure OAuth connection</b><p>You'll be asked to sign in to ${x.n} and grant Ledgerloop access. We only request the permissions listed below.</p></div></div><ul class="checks" style="margin:0">${['Read data needed for invoice processing', 'Write records you approve', 'Revoke access any time'].map((t) => '<li>' + icon('check') + '<span>' + t + '</span></li>').join('')}</ul>`,
      onOk(bg) { const b = bg.querySelector('[type=submit]'); b.innerHTML = '<span class="spinner"></span> Connecting…'; b.disabled = true; setTimeout(() => { store.ints[x.k] = true; save(); m.close(); rerender(); toast(x.n + ' connected', 'First sync started — this usually takes under a minute.', 'plug'); }, 1400); return false; } });
  }
  function configInt(x) {
    modal({ title: x.n + ' settings', sub: 'Connected · last synced ' + (x.sync || 'recently'), ok: 'Save changes',
      body: x.k === 'slack' ? `<div class="field"><label>Exceptions channel</label><input class="input" id="cfgCh" value="${esc(settings.slackChannel)}"></div><div class="field"><label>Mention</label><select class="select"><option>Assignee</option><option>@ap-team</option><option>No mention</option></select></div>`
        : x.k === 'tally' ? `<div class="field"><label>Company</label><select class="select"><option>Arvind Precision 26-27</option><option>Arvind Precision 25-26</option></select></div><div class="field"><label>Voucher type</label><select class="select"><option>Purchase</option><option>Journal</option></select></div><div class="field"><label>Attach PDF to voucher</label><select class="select"><option>Yes</option><option>No</option></select></div>`
          : `<div class="field"><label>Sync frequency</label><select class="select"><option>Every 5 minutes</option><option>Every 15 minutes</option><option>Hourly</option></select></div><button type="button" class="btn btn-ghost" onclick="this.innerHTML='Synced ✓'">${icon('refresh')}Sync now</button>`,
      onOk(bg) { const ch = bg.querySelector('#cfgCh'); if (ch) { settings.slackChannel = ch.value; store.settings = settings; save(); } toast('Settings saved', x.n); } });
  }

  // =====================================================================
  // SETTINGS
  // =====================================================================
  routes.settings = {
    render() {
      return `<div class="ph"><div><h1>Rules &amp; settings</h1><p>Control how Ledgerloop matches, posts and pays.</p></div></div>
      <div class="grid g2" style="align-items:start">
        <div class="grid">
          <div class="card"><div class="card-h"><h3>Matching tolerances</h3><span class="sub">Applied to every invoice</span></div>
            <div class="set-row"><div><b>Unit price tolerance</b><small>Allow price variance up to this % of PO rate</small></div><input class="input" type="number" step="0.5" data-set="priceTol" value="${settings.priceTol}"></div>
            <div class="set-row"><div><b>Absolute price tolerance</b><small>…or up to this amount per invoice (₹)</small></div><input class="input" type="number" step="500" data-set="priceAbs" value="${settings.priceAbs}"></div>
            <div class="set-row"><div><b>Quantity tolerance vs GRN</b><small>Over-billing allowed above received quantity (%)</small></div><input class="input" type="number" step="1" data-set="qtyTol" value="${settings.qtyTol}"></div>
            <div class="set-row"><div><b>Duplicate look-back window</b><small>Days to search for matching invoice numbers</small></div><select class="select" data-set="dupWindow">${[90, 180, 365, 730].map((d) => `<option value="${d}" ${settings.dupWindow == d ? 'selected' : ''}>${d} days</option>`).join('')}</select></div>
          </div>
          <div class="card"><div class="card-h"><h3>Automation</h3></div>
            <div class="set-row"><div><b>Auto-post matched bills to ${L.company.books}</b><small>Bills within tolerance are posted without approval</small></div><label class="switch"><input type="checkbox" data-set="autoPost" ${settings.autoPost ? 'checked' : ''}><span></span></label></div>
            <div class="set-row"><div><b>Auto-schedule payments</b><small>Schedule by vendor terms after posting</small></div><label class="switch"><input type="checkbox" data-set="autoSchedule" ${settings.autoSchedule ? 'checked' : ''}><span></span></label></div>
            <div class="set-row"><div><b>Payment run day</b><small>Weekly batch day</small></div><select class="select" data-set="payDay">${['Monday', 'Wednesday', 'Friday'].map((d) => `<option ${settings.payDay === d ? 'selected' : ''}>${d}</option>`).join('')}</select></div>
            <div class="set-row"><div><b>Second approver above</b><small>Payment runs above this need ${L.team[3].name}</small></div><input class="input" type="number" step="50000" data-set="approvalLimit" value="${settings.approvalLimit}"></div>
          </div>
          <div class="card"><div class="card-h"><h3>Exception routing</h3><button class="link" data-act="addrule">+ Add rule</button></div>
            ${[['Price or quantity variance', 'Neha Kulkarni', 'Slack DM + ' + settings.slackChannel], ['No PO found', 'Vikram Joshi', settings.slackChannel], ['GSTIN invalid / cancelled', 'Rahul Menon', settings.slackChannel], ['Invoice above ₹5,00,000', 'Anita Sharma', 'Slack DM + email']].map((r) => `<div class="set-row"><div><b>${r[0]}</b><small>→ ${r[1]} · ${r[2]}</small></div><span class="badge green">Active</span></div>`).join('')}
          </div>
        </div>
        <div class="grid">
          <div class="card"><div class="card-h"><div><h3>GSTIN validator</h3><span class="sub">Same check Ledgerloop runs on every invoice</span></div></div>
            <div class="card-b"><div style="display:flex;gap:8px"><input class="input mono" id="gstIn" placeholder="e.g. 27AAHCA4821K1Z…" maxlength="15" value="${L.company.gstin}" style="text-transform:uppercase"><button class="btn btn-primary" id="gstBtn">Validate</button></div><div class="gst-res" id="gstRes"></div></div></div>
          <div class="card"><div class="card-h"><h3>Team</h3><button class="link" data-act="invite">+ Invite</button></div>
            ${L.team.map((t) => `<div class="set-row"><div style="display:flex;gap:12px;align-items:center"><span class="avatar" style="background:${t.color}">${t.initials}</span><div><b>${t.name}${t === ME ? ' <span class="muted" style="font-weight:500">(you)</span>' : ''}</b><small>${t.email}</small></div></div><span class="badge gray plain">${t.role}</span></div>`).join('')}
          </div>
          <div class="card" id="billing"><div class="card-h"><h3>Plan &amp; billing</h3><span class="badge indigo plain">Growth · annual</span></div>
            <div class="set-row"><div><b>${last(30).length} of ${L.company.planLimit} invoices</b><small>Current 30-day usage · renews 1 Apr 2027</small></div><button class="btn btn-ghost btn-sm" data-act="upgrade">Upgrade to Scale</button></div>
            <div class="set-row"><div><b>Billing entity</b><small>${L.company.name} · GSTIN ${L.company.gstin}</small></div><button class="link" data-act="invoices-dl">Download invoices</button></div>
          </div>
          <div class="card"><div class="card-h"><h3>Workspace data</h3></div>
            <div class="set-row"><div><b>Reset workspace</b><small>Restore all invoices, approvals and settings to their original state</small></div><button class="btn btn-ghost btn-sm" data-act="reset">Reset</button></div>
          </div>
        </div>
      </div>`;
    },
    mount(view) {
      const run = () => {
        const r = L.validateGstin($('#gstIn').value);
        $('#gstRes').innerHTML = r.checks.map((c) => `<div class="ck ${c.ok ? 'ok' : 'no'}">${icon(c.ok ? 'check' : 'x')}${esc(c.label)}</div>`).join('') + `<div class="alert-box ${r.valid ? 'green' : 'red'}" style="margin-top:6px"><span class="ai">${icon(r.valid ? 'shield' : 'alert')}</span><div><b>${r.valid ? 'Valid GSTIN' : 'Invalid GSTIN'}</b><p>${r.valid ? (r.state ? 'Registered in ' + r.state + '. ' : '') + 'Portal status will be fetched when used on an invoice.' : 'Do not claim input tax credit until the vendor issues a corrected invoice.'}</p></div></div>`;
      };
      $('#gstBtn').onclick = run; $('#gstIn').addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); }); run();
      view.addEventListener('change', (e) => {
        const k = e.target.dataset.set; if (!k) return;
        settings[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.type === 'number' ? +e.target.value : e.target.value;
        store.settings = settings; save();
        toast('Rule updated', 'Applies to invoices received from now on.', 'settings');
      });
      if (location.hash.includes('billing')) setTimeout(() => $('#billing').scrollIntoView({ behavior: 'smooth' }), 50);
    }
  };

  // =====================================================================
  // ONBOARDING
  // =====================================================================
  routes.onboarding = {
    render() {
      const steps = [['Connect Gmail inbox', 'invoices@arvindprecision.in · 1,284 past invoices found'], ['Connect Tally Prime', 'Company “Arvind Precision 26-27” · 16 vendor ledgers mapped'], ['Import purchase orders', 'Google Sheets “PO Register FY26-27” · 80 POs'], ['Connect Slack for exceptions', '#ap-exceptions'], ['Process first invoices', 'Running AI extraction on the last 45 days']];
      return `<div class="ob"><div class="ph" style="display:block;text-align:center"><span class="logo-mark" style="width:52px;height:52px;margin:0 auto 16px;border-radius:14px"></span><h1>Setting up your workspace</h1><p>We're connecting your tools and back-filling the last 45 days of invoices.</p></div>
      <div class="ob-steps">${steps.map((s, i) => `<div class="card ob-step" data-ob="${i}"><span class="n">${i + 1}</span><div><b>${s[0]}</b><div class="muted" style="font-size:13px">${s[1]}</div></div><span class="ob-st muted" style="font-size:13px">Waiting</span></div>`).join('')}</div>
      <div style="text-align:center;margin-top:24px"><a href="#/overview" class="btn btn-primary btn-lg" id="obGo" style="opacity:.4;pointer-events:none">Go to my dashboard ${icon('arrowRight')}</a></div></div>`;
    },
    mount() {
      $$('[data-ob]').forEach((el, i) => {
        setTimeout(() => { el.querySelector('.ob-st').innerHTML = '<span class="spinner" style="border-color:#dde;border-top-color:var(--brand);display:inline-block;vertical-align:middle"></span>'; }, i * 1100);
        setTimeout(() => { el.classList.add('done'); el.querySelector('.n').innerHTML = icon('check'); el.querySelector('.ob-st').innerHTML = '<span class="badge green">Done</span>'; if (i === 4) { const g = $('#obGo'); g.style.opacity = 1; g.style.pointerEvents = ''; toast('Workspace ready', '732 invoices processed · 7 need your attention', 'sparkles'); } }, i * 1100 + 1000);
      });
    }
  };

  // =====================================================================
  // INVOICE DRAWER
  // =====================================================================
  let drawerId = null;
  function openInvoice(id) {
    const inv = L.invoices.find((i) => i.id === id); if (!inv) return;
    closeDrawer(true);
    drawerId = id;
    const bg = document.createElement('div'); bg.className = 'drawer-bg'; bg.id = 'drBg';
    const dr = document.createElement('aside'); dr.className = 'drawer'; dr.id = 'drawer';
    document.body.appendChild(bg); document.body.appendChild(dr);
    bg.onclick = () => closeDrawer();
    renderDrawer();
    document.body.style.overflow = 'hidden';
    const m = L.emails.find((x) => x.invId === id); if (m && !store.read[m.id]) { store.read[m.id] = 1; save(); updateCounts(); }
  }
  function closeDrawer(instant) {
    const dr = $('#drawer'), bg = $('#drBg');
    if (!dr) return;
    drawerId = null;
    document.body.style.overflow = '';
    if (instant) { dr.remove(); bg.remove(); return; }
    dr.classList.add('out'); bg.style.opacity = 0; setTimeout(() => { dr.remove(); bg.remove(); }, 180);
  }
  function renderDrawer() {
    const dr = $('#drawer'); if (!dr) return;
    const inv = L.invoices.find((i) => i.id === drawerId);
    const v = V(inv);
    const po = inv.poId && poById[inv.poId];
    const g = L.validateGstin(inv.gstin);
    const extracted = inv.status !== 'extracting';
    const t = tdsFor(inv);
    let actions = '';
    if (inv.status === 'exception' || inv.status === 'review') actions = `<button class="btn btn-ghost btn-sm" data-act="slack" data-id="${inv.id}">${icon('slack')}Slack thread</button><button class="btn btn-ghost btn-sm" data-act="askvendor" data-id="${inv.id}">${icon('mail')}Email vendor</button><button class="btn btn-ghost btn-sm" data-act="reject" data-id="${inv.id}">Reject</button><button class="btn btn-primary btn-sm" data-act="approve" data-id="${inv.id}">${icon('check')}${inv.status === 'review' ? 'Confirm & post' : 'Approve & post'}</button>`;
    else if (inv.status === 'duplicate') actions = `<button class="btn btn-ghost btn-sm" data-act="notdup" data-id="${inv.id}">Not a duplicate</button><button class="btn btn-dark btn-sm" data-act="reject" data-id="${inv.id}">${icon('x')}Reject duplicate</button>`;
    else if (inv.status === 'posted') actions = `<button class="btn btn-primary btn-sm" data-act="schedule" data-id="${inv.id}">${icon('calendar')}Schedule payment</button>`;
    else if (inv.status === 'scheduled') actions = `<button class="btn btn-ghost btn-sm" data-act="reschedule" data-id="${inv.id}">${icon('calendar')}Reschedule</button><button class="btn btn-primary btn-sm" data-act="markpaid" data-id="${inv.id}">${icon('bank')}Mark as paid</button>`;
    else if (inv.status === 'paid') actions = `<button class="btn btn-ghost btn-sm" data-act="remit" data-id="${inv.id}">${icon('send')}Resend remittance</button>`;

    let alertHtml = '';
    if (needsAction(inv)) {
      const tone = inv.status === 'duplicate' ? 'purple' : inv.status === 'review' ? 'amber' : EXC_TONE[inv.exception] || 'red';
      alertHtml = `<div class="alert-box ${tone}"><span class="ai">${icon(inv.status === 'duplicate' ? 'copy' : 'alert')}</span><div><b>${esc(excLabel(inv))}</b><p>${excDetail(inv)}</p><div class="acts" style="font-size:12.5px;color:var(--ink-3)">Assigned to ${esc(inv.assignee || ME.name)} · posted in ${settings.slackChannel} ${rel(inv.received)}</div></div></div>`;
    } else if (inv.status === 'extracting') {
      alertHtml = `<div class="alert-box blue"><span class="ai"><span class="spinner" style="border-color:#c7d2fe;border-top-color:var(--blue)"></span></span><div><b>Reading invoice…</b><p>Running OCR and AI extraction on ${esc(inv.file)}. This usually takes a few seconds.</p></div></div>`;
    } else if (inv.resolved) {
      alertHtml = `<div class="alert-box green"><span class="ai">${icon('check')}</span><div><b>Exception resolved</b><p>${esc(L.EXC[inv.resolved.type] || 'Exception')} — approved by ${esc(inv.resolved.by)} on ${fmtD(inv.resolved.at)}${inv.resolved.note ? ': “' + esc(inv.resolved.note) + '”' : ''}.</p></div></div>`;
    }

    const fld = (key, label, val, conf, cls) => `<div class="fl" data-f="${key}"><label>${label}${conf ? `<em class="${conf < 85 ? 'low' : conf < 92 ? 'mid' : ''}">${conf.toFixed(1)}%</em>` : ''}</label><div class="${cls || ''}" data-val>${val}</div>${['num', 'date', 'due'].includes(key) && extracted ? '<button class="edit" data-edit="' + key + '">Edit</button>' : ''}</div>`;
    const c = inv.confidence;
    const lowDue = inv.status === 'review';
    const fields = extracted ? `
      ${fld('vendor', 'Vendor', esc(v.name), Math.min(99.8, c + 2))}
      ${fld('gstin', 'Vendor GSTIN', esc(inv.gstin), inv.exception === 'gstin' ? 88.4 : Math.min(99.9, c + 2.4), 'mono')}
      ${fld('num', 'Invoice number', esc(inv.number), Math.min(99.7, c + 1.8), 'mono')}
      ${fld('date', 'Invoice date', fmtD(inv.invDate), Math.min(99.5, c + 1))}
      ${fld('po', 'PO reference', inv.poId || '<span class="muted">Not found</span>', inv.poId ? Math.min(99, c) : null)}
      ${fld('pos', 'Place of supply', '27 · Maharashtra', 98.6)}
      ${fld('taxable', 'Taxable value', inr2(inv.taxable), Math.min(99.6, c + 1.5))}
      ${inv.intra ? fld('tax', 'CGST + SGST', inr2(inv.cgst) + ' + ' + inr2(inv.sgst), Math.min(99.4, c + 1)) : fld('tax', 'IGST', inr2(inv.igst), Math.min(99.4, c + 1))}
      ${fld('total', 'Invoice total', '<b>' + inr2(inv.total) + '</b>', Math.min(99.8, c + 2))}
      ${fld('due', 'Due date', fmtD(inv.due) + ' <span class="muted" style="font-weight:500">(Net ' + v.terms + ')</span>', lowDue ? 71.3 : Math.min(98, c - 1))}` : '';

    const matchRows = po ? inv.lines.map((l, k) => {
      const pl = po.lines[k] || l; const grn = po.grn[k];
      const pOk = Math.abs(l.rate - pl.rate) / pl.rate * 100 <= settings.priceTol || inv.resolved;
      const qOk = l.qty <= grn * (1 + settings.qtyTol / 100) || inv.resolved;
      const tOk = l.gst === pl.gst || inv.resolved;
      return `<tr class="${pOk && qOk && tOk ? '' : 'badrow'}"><td style="white-space:normal;max-width:200px">${esc(l.desc)}</td><td class="num">${num(pl.qty, 0)}</td><td class="num">${num(grn, 0)}</td><td class="num ${qOk ? '' : 'bad'}">${num(l.qty, 0)}</td><td class="num">${inr2(pl.rate)}</td><td class="num ${pOk ? '' : 'bad'}">${inr2(l.rate)}</td><td class="num ${tOk ? '' : 'bad'}">${l.gst}%${tOk ? '' : ' <small>(PO ' + pl.gst + '%)</small>'}</td><td class="${pOk && qOk && tOk ? 'ok' : 'bad'}">${pOk && qOk && tOk ? '✓' : '✕'}</td></tr>`;
    }).join('') : '';

    const ledger = [
      ['Purchase – ' + v.category + ' @' + inv.lines[0].gst + '%', inv.taxable, 0],
      ...(inv.intra ? [['Input CGST', inv.cgst, 0], ['Input SGST', inv.sgst, 0]] : [['Input IGST', inv.igst, 0]]),
      ...(inv.roundOff ? [['Round off', inv.roundOff > 0 ? inv.roundOff : 0, inv.roundOff < 0 ? -inv.roundOff : 0]] : []),
      ...(t ? [['TDS payable – ' + t.sec, 0, t.amt]] : []),
      [v.name + ' (Sundry Creditor)', 0, netPayable(inv)]
    ];

    dr.innerHTML = `
      <div class="dr-h">${vAvatar(v)}<div><h2>${esc(v.name)}</h2><div class="meta"><span class="mono">${esc(inv.number)}</span> · ${inr2(inv.total)} · received ${rel(inv.received)} · ${inv.id}</div></div>${statusBadge(inv)}
        <div class="acts">${actions}<button class="ibtn" data-act="prevnext" data-d="-1" title="Previous (k)">${icon('chevron').replace('<svg', '<svg style="transform:rotate(180deg)"')}</button><button class="ibtn" data-act="prevnext" data-d="1" title="Next (j)">${icon('chevron')}</button><button class="ibtn" data-act="closedr" title="Close (Esc)">${icon('x')}</button></div></div>
      <div class="dr-body">
        <div class="dr-doc"><div class="doc-tools"><span>${icon('file').replace('<svg', '<svg style="width:13px;height:13px;display:inline;vertical-align:-2px"')} ${esc(inv.file)} · page 1 of ${inv.pages}</span><div class="btns"><button data-zoom="-1" title="Zoom out">−</button><button data-zoom="1" title="Zoom in">+</button><button data-act="dlpdf" title="Download">${icon('download')}</button></div></div>${paper(inv)}</div>
        <div class="dr-info">
          ${alertHtml}
          ${extracted ? `<div class="card"><div class="card-h"><div><h3>Extracted fields</h3><span class="sub">Hover a field to locate it on the invoice</span></div>${confBar(c)}</div><div class="fields">${fields}</div></div>` : ''}
          ${extracted ? `<div class="card"><div class="card-h"><h3>Line items</h3><span class="sub">${inv.lines.length} line${inv.lines.length > 1 ? 's' : ''}</span></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Description</th><th>HSN</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">GST</th><th class="num">Amount</th></tr></thead><tbody>${inv.lines.map((l) => `<tr style="cursor:default"><td style="white-space:normal">${esc(l.desc)}</td><td>${l.hsn}</td><td class="num">${num(l.qty, 0)} ${l.unit}</td><td class="num">${inr2(l.rate)}</td><td class="num">${l.gst}%</td><td class="num">${inr2(l.qty * l.rate)}</td></tr>`).join('')}</tbody></table></div></div>` : ''}
          ${extracted ? `<div class="card"><div class="card-h"><div><h3>GSTIN &amp; duplicate check</h3></div>${g.valid ? '<span class="badge green">Passed</span>' : '<span class="badge red">Failed</span>'}</div><div class="card-b gst-res" style="margin:0">${g.checks.map((ch) => `<div class="ck ${ch.ok ? 'ok' : 'no'}">${icon(ch.ok ? 'check' : 'x')}${esc(ch.label)}</div>`).join('')}<div class="ck ${g.valid ? 'ok' : 'no'}">${icon(g.valid ? 'check' : 'x')}GST portal: ${g.valid ? 'Active · Regular taxpayer · filed GSTR-1 for Oct' : 'Not found — vendor master has ' + v.gstin}</div><div class="ck ${inv.exception === 'dup' ? 'no' : 'ok'}">${icon(inv.exception === 'dup' ? 'x' : 'check')}${inv.exception === 'dup' ? 'Duplicate of ' + (dupOriginal(inv) ? dupOriginal(inv).id : 'earlier bill') + ' (same number, vendor & amount)' : 'No duplicate in last ' + settings.dupWindow + ' days'}</div></div></div>` : ''}
          ${extracted ? (po ? `<div class="card match"><div class="card-h"><div><h3>3-way match</h3><span class="sub">${po.id} (${po.source}) · GRN-${8800 + parseInt(po.id.slice(3)) % 400} · tolerance ±${settings.priceTol}%</span></div><button class="link" data-po-open="${po.id}">Open PO</button></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Item</th><th class="num">PO qty</th><th class="num">GRN</th><th class="num">Billed</th><th class="num">PO rate</th><th class="num">Inv rate</th><th class="num">GST</th><th></th></tr></thead><tbody>${matchRows}</tbody></table></div></div>`
            : `<div class="card"><div class="card-h"><h3>3-way match</h3><span class="badge amber">No PO</span></div><div class="card-b"><p class="muted">No open PO found for ${esc(v.name)} in Google Sheets, Excel or Tally. You can link one manually or approve as a non-PO expense.</p><button class="btn btn-ghost btn-sm" style="margin-top:10px" data-act="linkpo" data-id="${inv.id}">${icon('link')}Link a PO</button></div></div>`) : ''}
          ${extracted ? `<div class="card"><div class="card-h"><div><h3>Accounting entry</h3><span class="sub">${inv.bill ? 'Posted to ' + L.company.books + ' as ' + inv.bill.ref : 'Preview — will post to ' + L.company.books}</span></div>${inv.bill ? '<span class="badge indigo">Posted</span>' : '<span class="badge gray">Draft</span>'}</div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Ledger</th><th class="num">Debit</th><th class="num">Credit</th></tr></thead><tbody>${ledger.map((r) => `<tr style="cursor:default"><td>${esc(r[0])}</td><td class="num">${r[1] ? inr2(r[1]) : ''}</td><td class="num">${r[2] ? inr2(r[2]) : ''}</td></tr>`).join('')}</tbody></table></div></div>` : ''}
          ${inv.payment ? `<div class="card"><div class="card-h"><h3>Payment</h3>${inv.status === 'paid' ? '<span class="badge green">Paid</span>' : '<span class="badge teal">Scheduled</span>'}</div><div class="card-b"><dl class="kv"><dt>${inv.status === 'paid' ? 'Paid on' : 'Scheduled for'}</dt><dd>${fmtD(inv.status === 'paid' ? inv.payment.paidOn : inv.payment.date)}</dd><dt>Amount</dt><dd>${inr2(netPayable(inv))}${t ? ' <span class="muted" style="font-weight:500">(after TDS ' + inr(t.amt) + ')</span>' : ''}</dd><dt>Mode</dt><dd>${inv.payment.mode} from ${inv.payment.bank}</dd><dt>Beneficiary</dt><dd style="font-weight:500">${bankFor(v)}</dd>${inv.payment.utr ? `<dt>UTR</dt><dd class="mono">${inv.payment.utr}</dd>` : ''}</dl></div></div>` : ''}
          <div class="card"><div class="card-h"><h3>Activity</h3></div><div class="timeline">${inv.events.slice().sort((a, b) => a.at - b.at).map((e) => `<div class="tl"><span class="tdot tone-${e.kind === 'note' ? 'ai' : e.kind}">${icon({ mail: 'mail', ai: 'sparkles', ok: 'check', warn: 'alert', slack: 'slack', book: 'book', pay: 'calendar', err: 'x', note: 'send' }[e.kind] || 'check')}</span><div>${esc(e.text)}<small>${new Date(e.at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}${e.by ? ' · ' + esc(e.by) : ''}</small></div></div>`).join('')}</div>
            <div style="display:flex;gap:8px;padding:12px 18px;border-top:1px solid var(--line)"><input class="input" id="noteIn" placeholder="Add a note for the team… (@mention to notify)"><button class="btn btn-ghost" data-act="note" data-id="${inv.id}">Post</button></div></div>
        </div>
      </div>`;
    // field ↔ paper highlight
    $$('.fl', dr).forEach((f) => {
      f.addEventListener('mouseenter', () => $$('.paper .hl[data-f="' + f.dataset.f + '"]', dr).forEach((h) => h.classList.add('on')));
      f.addEventListener('mouseleave', () => $$('.paper .hl.on', dr).forEach((h) => h.classList.remove('on')));
    });
    let z = 1;
    $$('[data-zoom]', dr).forEach((b) => b.onclick = () => { z = Math.max(0.6, Math.min(1.6, z + 0.15 * b.dataset.zoom)); $('.paper', dr).style.transform = 'scale(' + z + ')'; });
    $$('[data-po-open]', dr).forEach((b) => b.onclick = () => openPO(b.dataset.poOpen));
    $$('[data-edit]', dr).forEach((b) => b.onclick = () => editField(inv, b.dataset.edit, b.closest('.fl')));
    const ni = $('#noteIn', dr); if (ni) ni.addEventListener('keydown', (e) => { if (e.key === 'Enter') addNote(inv); });
  }

  function editField(inv, key, el) {
    const box = el.querySelector('[data-val]');
    const cur = key === 'num' ? inv.number : (key === 'date' ? inv.invDate : inv.due).toISOString().slice(0, 10);
    box.outerHTML = '<input data-val type="' + (key === 'num' ? 'text' : 'date') + '" value="' + esc(cur) + '">';
    const inp = el.querySelector('input'); inp.focus();
    const done = () => {
      const val = inp.value; if (!val) return renderDrawer();
      if (key === 'num') inv.number = val; else if (key === 'date') inv.invDate = new Date(val + 'T00:00'); else inv.due = new Date(val + 'T00:00');
      inv.edited = true;
      inv.events.push({ at: now(), kind: 'note', text: 'Corrected ' + (key === 'num' ? 'invoice number' : key === 'date' ? 'invoice date' : 'due date') + ' → ' + (key === 'num' ? val : fmtD(new Date(val))), by: ME.name });
      save(inv); renderDrawer();
      toast('Correction saved', 'Ledgerloop will remember this layout for ' + V(inv).name + '.', 'sparkles');
    };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(); if (e.key === 'Escape') { e.stopPropagation(); renderDrawer(); } });
    inp.addEventListener('blur', done);
  }

  function addNote(inv) {
    const ni = $('#noteIn'); const t = ni.value.trim(); if (!t) return;
    inv.events.push({ at: now(), kind: 'note', text: t, by: ME.name });
    save(inv); renderDrawer();
    toast('Note posted', /@/.test(t) ? 'Mentioned teammates were notified on Slack.' : 'Visible to everyone in the workspace.', 'send');
  }

  // Indian number to words
  function words(n) {
    const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const two = (x) => x < 20 ? a[x] : b[Math.floor(x / 10)] + (x % 10 ? ' ' + a[x % 10] : '');
    const three = (x) => (x >= 100 ? a[Math.floor(x / 100)] + ' Hundred' + (x % 100 ? ' ' : '') : '') + (x % 100 ? two(x % 100) : '');
    n = Math.round(n); if (!n) return 'Zero';
    const cr = Math.floor(n / 1e7), lk = Math.floor(n / 1e5) % 100, th = Math.floor(n / 1000) % 100, rest = n % 1000;
    return [cr ? three(cr) + ' Crore' : '', lk ? two(lk) + ' Lakh' : '', th ? two(th) + ' Thousand' : '', rest ? three(rest) : ''].filter(Boolean).join(' ');
  }

  function paper(inv) {
    const v = V(inv);
    const bad = (f) => (inv.exception === 'gstin' && f === 'gstin') || (inv.exception === 'price' && f === 'rate0') || (inv.exception === 'tax' && f === 'gst0') || (inv.exception === 'qty' && f === 'qty0') ? ' bad' : '';
    const hl = (f, txt) => `<span class="hl${bad(f)}" data-f="${f}">${txt}</span>`;
    const streets = ['Plot 17, GIDC Vatva', '#14, 2nd Cross, Peenya Industrial Area', 'Gat No. 112, Chakan MIDC', 'Survey 48, Makarpura GIDC', 'B-62, Okhla Phase II', 'Plot 9, IDA Jeedimetla', 'Focal Point, Phase V', 'Unit 4, Taloja MIDC', 'SF 221, Avinashi Road', 'No. 8, Mysore Road', '22 Strand Road', 'Road No. 5, VKI Area', 'Shop 3, Bhosari Gaon', 'Embassy Tech Square', 'Plot 31, Satpur MIDC', 'Kalamassery Industrial Estate'];
    const idx = parseInt(v.id.slice(1)) - 101;
    return `<div class="paper">${inv.status === 'duplicate' ? '<div class="watermark">DUPLICATE?</div>' : ''}
      <div class="ph1"><div><div class="vn">${hl('vendor', esc(v.name.toUpperCase()))}</div><div>${streets[idx] || 'Industrial Estate'}, ${esc(v.city)}</div><div>${v.stateName} · State code ${v.state}</div><div>GSTIN: <b>${hl('gstin', esc(inv.gstin))}</b></div><div>${esc(v.email)}</div></div><div><div class="tt">TAX INVOICE</div><div style="text-align:right;margin-top:6px">Invoice No: <b>${hl('num', esc(inv.number))}</b><br>Date: ${hl('date', inv.invDate.toLocaleDateString('en-GB'))}<br>${inv.poId ? 'Your PO: ' + hl('po', inv.poId) : 'Ref: verbal order'}<br>Terms: ${hl('due', 'Net ' + v.terms + ' days')}</div></div></div>
      <div class="blk"><div><div class="lab">Bill to</div><b>${L.company.name}</b><br>${L.company.address}<br>GSTIN: ${L.company.gstin}</div><div><div class="lab">Ship to</div>Stores, Plant 1<br>Plot 42, MIDC Bhosari, Pune 411026<br>Place of supply: ${hl('pos', '27-Maharashtra')}</div></div>
      <table><thead><tr><th>#</th><th>Description</th><th>HSN/SAC</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">GST</th><th class="r">Amount</th></tr></thead><tbody>${inv.lines.map((l, k) => `<tr><td>${k + 1}</td><td>${esc(l.desc)}</td><td>${l.hsn}</td><td class="r">${k === 0 ? hl('qty0', num(l.qty, 0) + ' ' + l.unit) : num(l.qty, 0) + ' ' + l.unit}</td><td class="r">${k === 0 ? hl('rate0', num2(l.rate)) : num2(l.rate)}</td><td class="r">${k === 0 ? hl('gst0', l.gst + '%') : l.gst + '%'}</td><td class="r">${num2(l.qty * l.rate)}</td></tr>`).join('')}${inv.lines.length < 3 ? '<tr><td colspan="7" style="height:' + (3 - inv.lines.length) * 24 + 'px"></td></tr>' : ''}</tbody></table>
      <div class="tot"><div><span>Taxable value</span>${hl('taxable', num2(inv.taxable))}</div>${inv.intra ? `<div><span>CGST</span>${hl('tax', num2(inv.cgst))}</div><div><span>SGST</span><span>${num2(inv.sgst)}</span></div>` : `<div><span>IGST</span>${hl('tax', num2(inv.igst))}</div>`}<div><span>Round off</span><span>${inv.roundOff.toFixed(2)}</span></div><div class="g"><span>TOTAL</span>${hl('total', '₹ ' + num2(inv.total))}</div></div>
      <div class="words">Rupees ${words(inv.total)} Only</div>
      <div class="foot"><div><div class="lab">Bank details</div>${bankFor(v)}<br><br>Interest @18% p.a. will be charged on overdue bills.<br>Subject to ${esc(v.city)} jurisdiction.</div><div style="text-align:center"><div class="stamp">${esc(v.name.split(' ')[0].toUpperCase())}<br>${esc(v.city.toUpperCase())}</div><div style="margin-top:6px">For ${esc(v.name)}<br><b>Authorised Signatory</b></div></div></div></div>`;
  }

  // ---------- actions ----------
  function addEvent(inv, kind, text, by) { inv.events.push({ at: now(), kind, text, by }); }
  function billRef() { return 'TLY-PUR-' + (5400 + Math.floor(Math.random() * 500)); }

  function approve(inv, note, silent) {
    const wasExc = inv.exception || (inv.status === 'review' ? 'review' : null);
    if (wasExc && wasExc !== 'review') inv.resolved = { type: wasExc, by: ME.name, at: now(), note };
    inv.exception = null;
    inv.status = 'posted';
    inv.bill = { ref: billRef(), at: now() };
    addEvent(inv, 'ok', (wasExc === 'review' ? 'Fields confirmed' : 'Exception approved') + (note ? ': “' + note + '”' : ''), ME.name);
    addEvent(inv, 'book', 'Purchase voucher ' + inv.bill.ref + ' created in ' + L.company.books);
    if (settings.autoSchedule) {
      inv.status = 'scheduled';
      const due = new Date(Math.max(+inv.due, Date.now()));
      inv.payment = { date: due, mode: inv.total > 200000 ? 'RTGS' : 'NEFT', bank: 'HDFC Bank ••4471' };
      addEvent(inv, 'pay', 'Payment scheduled for ' + fmtD(due) + ' via ' + inv.payment.mode);
    }
    save(inv);
    if (!silent) toast('Approved & posted to ' + L.company.books, inv.bill.ref + (inv.payment ? ' · payment on ' + fmtDs(inv.payment.date) : ''), 'book');
  }

  function doApprove(inv) {
    if (inv.status === 'review') { approve(inv); afterChange(); return; }
    modal({ title: 'Approve with variance?', sub: esc(V(inv).name) + ' · ' + esc(inv.number) + ' · ' + inr(inv.total), ok: 'Approve & post',
      body: `<div class="alert-box ${EXC_TONE[inv.exception] || 'red'}"><span class="ai">${icon('alert')}</span><div><b>${esc(excLabel(inv))}</b><p>${excDetail(inv)}</p></div></div><div class="field"><label>Reason (saved to audit log)</label><textarea class="textarea" id="apNote" required placeholder="e.g. Rate revised on 1 Nov per steel index, confirmed by Vikram">${inv.exception === 'price' ? 'Rate revision confirmed by purchase team' : ''}</textarea></div><label style="display:flex;gap:8px;align-items:center;font-size:13.5px"><input type="checkbox" class="cb" checked> Update PO rate in Google Sheets for future invoices</label>`,
      onOk(bg) { approve(inv, bg.querySelector('#apNote').value.trim()); afterChange(); } });
  }

  function afterChange() { if (drawerId) renderDrawer(); rerender(); }

  function doReject(inv) {
    const isDup = inv.status === 'duplicate';
    modal({ title: isDup ? 'Reject duplicate invoice' : 'Reject invoice', sub: esc(V(inv).name) + ' · ' + esc(inv.number), ok: 'Reject & notify vendor', danger: true,
      body: `<div class="field"><label>Email to vendor</label><input class="input" value="${esc(V(inv).email)}"></div><div class="field"><label>Message</label><textarea class="textarea" style="min-height:130px">Dear ${esc(V(inv).contact)},\n\n${isDup ? 'Invoice ' + inv.number + ' appears to be a duplicate of a bill already received and paid. We are not processing this copy.' : 'We are unable to process invoice ' + inv.number + ': ' + excLabel(inv).toLowerCase() + '. Kindly share a corrected invoice / credit note.'}\n\nRegards,\n${ME.name}\nAccounts Payable, ${L.company.short}</textarea></div>`,
      onOk() {
        inv.status = 'duplicate'; inv.exception = isDup ? 'dup' : inv.exception; inv.rejected = true;
        addEvent(inv, 'err', 'Rejected — vendor notified at ' + V(inv).email, ME.name);
        inv.status = 'paid' === inv.status ? inv.status : 'duplicate';
        // remove from action list by giving it a terminal state
        inv.status = 'rejected';
        save(inv);
        toast('Invoice rejected', 'Email sent to ' + V(inv).contact + '.', 'mail');
        afterChange();
      } });
  }

  function doSlack(inv) {
    const v = V(inv);
    modal({ title: settings.slackChannel, sub: 'Thread for ' + esc(v.name) + ' · ' + esc(inv.number), width: 560, ok: 'Reply in thread', cancel: 'Close',
      body: `<div class="slack" style="box-shadow:none"><div class="slack-msg"><div class="slack-av" style="background:linear-gradient(135deg,#6366f1,#0d9488)"><span class="logo-mark" style="width:22px;height:22px;box-shadow:none;background:none">${window.LOGO_SVG}</span></div><div><div class="slack-name">Ledgerloop<span class="app">APP</span><small>${fmtT(inv.received)}</small></div><div>⚠️ <b>${esc(excLabel(inv))}</b> on invoice from <b>${esc(v.name)}</b> <span style="color:#1264a3">@${esc(inv.assignee || ME.name)}</span></div><div class="slack-att" style="border-color:${inv.status === 'review' ? 'var(--amber)' : 'var(--red)'}"><div class="kv" style="display:grid;grid-template-columns:1fr 1fr"><div><b>Invoice</b>${esc(inv.number)} · ${inr(inv.total)}</div><div><b>PO</b>${inv.poId ? inv.poId + ' · ' + inr(poById[inv.poId].amount) : 'Not found'}</div></div><div style="font-size:13px;color:var(--ink-2)">${excDetail(inv)}</div></div></div></div>
      <div class="slack-msg" style="padding-top:0"><span class="avatar" style="background:#ea580c;border-radius:8px;width:36px;height:36px">VJ</span><div><div class="slack-name">Vikram Joshi<small>${fmtT(new Date(+inv.received + 1500000))}</small></div><div>${inv.exception === 'price' ? 'Steel prices went up on 1 Nov, I had agreed the new rate on call. PO will be amended.' : inv.exception === 'nopo' ? 'This was an urgent regrinding job, I\'ll raise a PO retroactively.' : 'Checking with stores, give me 30 min.'}</div></div></div></div>
      <div class="field"><label>Reply</label><input class="input" id="slReply" placeholder="Reply to thread…"></div>`,
      onOk(bg) { const t = bg.querySelector('#slReply').value.trim(); if (!t) return false; addEvent(inv, 'slack', 'Replied in Slack: “' + t + '”', ME.name); save(inv); toast('Reply posted to Slack', settings.slackChannel, 'slack'); if (drawerId) renderDrawer(); } });
  }

  function doMarkPaid(inv) {
    const utr = 'HDFCR5' + Math.floor(20000000 + Math.random() * 79999999) + Math.floor(10 + Math.random() * 89);
    modal({ title: 'Record payment', sub: esc(V(inv).name) + ' · ' + esc(inv.number), ok: 'Mark as paid',
      body: `<div class="row2"><div class="field"><label>Amount paid</label><input class="input" value="${inr2(netPayable(inv))}" readonly></div><div class="field"><label>Payment date</label><input class="input" type="date" id="pdDate" value="${new Date().toISOString().slice(0, 10)}"></div></div><div class="field"><label>UTR / reference</label><input class="input mono" id="pdUtr" value="${utr}"></div><p class="muted" style="font-size:13px">Tip: Ledgerloop marks bills paid automatically when the bank statement shows the UTR.</p>`,
      onOk(bg) { markPaid(inv, bg.querySelector('#pdUtr').value, new Date(bg.querySelector('#pdDate').value + 'T12:00')); afterChange(); } });
  }
  function markPaid(inv, utr, when, auto) {
    inv.status = 'paid';
    inv.payment = Object.assign(inv.payment || { mode: 'NEFT', bank: 'HDFC Bank ••4471', date: when }, { paidOn: when || now(), utr });
    addEvent(inv, 'ok', (auto ? 'Bank confirmed UTR ' : 'Payment recorded · UTR ') + utr + ' · marked paid in ' + L.company.books, auto ? null : ME.name);
    addEvent(inv, 'mail', 'Remittance advice emailed to ' + V(inv).email);
    save(inv);
    toast(auto ? 'Bank confirmation received' : 'Marked as paid', V(inv).name + ' · ' + inr(netPayable(inv)) + ' · UTR ' + utr, 'bank', { label: 'View', fn: () => openInvoice(inv.id) });
  }

  function exportCSV(list, name) {
    const head = ['Invoice ID', 'Vendor', 'GSTIN', 'Invoice No', 'Invoice Date', 'PO', 'Taxable', 'CGST', 'SGST', 'IGST', 'Total', 'Due', 'Status', 'Bill Ref'];
    const rows = list.map((i) => [i.id, V(i).name, i.gstin, i.number, i.invDate.toISOString().slice(0, 10), i.poId || '', i.taxable.toFixed(2), i.cgst.toFixed(2), i.sgst.toFixed(2), i.igst.toFixed(2), i.total.toFixed(2), i.due.toISOString().slice(0, 10), L.STATUS[i.status].label, i.bill ? i.bill.ref : '']);
    download(name, [head].concat(rows).map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n'));
  }
  function download(name, text) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
  }

  // ---------- upload / new invoice simulation ----------
  let simSeq = 0;
  function newInvoiceFrom(v, opts) {
    opts = opts || {};
    const tpl = L.invoices.find((i) => i.vendorId === v.id && i.lines.length) || L.invoices[0];
    const lines = tpl.lines.map((l) => Object.assign({}, l, { qty: Math.max(1, Math.round(l.qty * (0.6 + Math.random() * 0.8))) }));
    const intra = v.state === '27';
    let taxable = 0, tax = 0; lines.forEach((l) => { taxable += l.qty * l.rate; tax += l.qty * l.rate * l.gst / 100; });
    taxable = Math.round(taxable * 100) / 100; tax = Math.round(tax * 100) / 100;
    const total = Math.round(taxable + tax);
    const id = 'INV-' + (11300 + Date.now() % 100000 + (simSeq++));
    const number = opts.number || tpl.number.replace(/\d+(?=\D*$)/, (m) => String(+m + 7 + simSeq).padStart(m.length, '0'));
    const poId = 'PO-' + (2600 + simSeq + Math.floor(Math.random() * 50));
    const po = { id: poId, vendorId: v.id, date: new Date(Date.now() - 9 * dayMs), lines: lines.map((l, k) => Object.assign({}, l, { rate: opts.exc === 'price' && k === 0 ? Math.round(l.rate * 0.95 * 10) / 10 : l.rate })), source: 'Google Sheets', raisedBy: 'Vikram Joshi', grn: lines.map((l) => l.qty) };
    let pt = 0; po.lines.forEach((l) => pt += l.qty * l.rate * (1 + l.gst / 100)); po.amount = Math.round(pt);
    L.pos.unshift(po); poById[poId] = po;
    store.pos = store.pos || []; store.pos.push(po);
    const rec = now();
    const inv = { id, number, vendorId: v.id, gstin: v.gstin, invDate: new Date(rec - dayMs), received: rec, due: new Date(rec - dayMs + v.terms * dayMs), lines, intra, taxable, tax, cgst: intra ? tax / 2 : 0, sgst: intra ? tax / 2 : 0, igst: intra ? 0 : tax, total, roundOff: Math.round((total - taxable - tax) * 100) / 100, poId, status: 'extracting', exception: null, confidence: 93 + Math.random() * 6, file: opts.file || number.replace(/[\/ ]/g, '_') + '.pdf', pages: 1, bill: null, payment: null, assignee: null, events: [{ at: rec, kind: 'mail', text: opts.upload ? 'Uploaded by ' + ME.name : 'Email received from ' + v.email }] };
    L.invoices.unshift(inv);
    store.added.push(inv);
    if (!opts.upload) {
      const m = { id: 'M' + id.slice(4), invId: id, from: v.contact, fromEmail: v.email, vendor: v.name, subject: 'Invoice ' + number + ' – ' + v.name, at: rec, file: inv.file, size: (90 + Math.floor(Math.random() * 300)) + ' KB', body: 'Dear Accounts Team,\n\nPlease find attached our tax invoice no. ' + number + ' against your PO ' + poId + '.\nKindly process the payment as per agreed terms of ' + v.terms + ' days.\n\nThanks & regards,\n' + v.contact + '\n' + v.name, fresh: true };
      L.emails.unshift(m); store.emails.push(m);
    }
    save();
    return { inv, exc: opts.exc };
  }
  function finishProcessing(inv, exc) {
    if (!L.invoices.includes(inv) || inv.status !== 'extracting') return;
    const r = new Date();
    inv.events.push({ at: new Date(+r - 3000), kind: 'ai', text: 'Extracted 14 fields from ' + inv.file + ' (' + inv.pages + ' page)' });
    inv.events.push({ at: new Date(+r - 2000), kind: 'ok', text: 'GSTIN ' + inv.gstin + ' verified · Active' });
    inv.events.push({ at: new Date(+r - 1500), kind: 'ok', text: 'No duplicate found across 2,914 invoices' });
    if (exc) {
      inv.status = 'exception'; inv.exception = exc; inv.assignee = 'Neha Kulkarni';
      inv.events.push({ at: new Date(+r - 1000), kind: 'warn', text: '3-way match failed: ' + L.EXC[exc] + ' (' + inv.poId + ')' });
      inv.events.push({ at: r, kind: 'slack', text: 'Sent to ' + settings.slackChannel + ' on Slack, assigned to Neha Kulkarni' });
      toast('Exception: ' + V(inv).name, L.EXC[exc] + ' · ' + inr(inv.total), 'alert', { label: 'Review now', fn: () => openInvoice(inv.id) });
    } else {
      inv.events.push({ at: new Date(+r - 1000), kind: 'ok', text: '3-way match passed against ' + inv.poId + ' and GRN' });
      inv.status = 'posted'; inv.bill = { ref: billRef(), at: r };
      inv.events.push({ at: r, kind: 'book', text: 'Purchase voucher ' + inv.bill.ref + ' created in ' + L.company.books });
      if (settings.autoSchedule) { inv.status = 'scheduled'; inv.payment = { date: inv.due, mode: inv.total > 200000 ? 'RTGS' : 'NEFT', bank: 'HDFC Bank ••4471' }; inv.events.push({ at: r, kind: 'pay', text: 'Payment scheduled for ' + fmtD(inv.due) + ' via ' + inv.payment.mode }); }
      toast('Bill posted · ' + V(inv).name, inv.number + ' · ' + inr(inv.total) + ' → ' + inv.bill.ref, 'book', { label: 'View', fn: () => openInvoice(inv.id) });
    }
    save(inv);
    pushNotif(inv);
    liveRefresh();
  }
  function liveRefresh() {
    updateCounts();
    if (drawerId) renderDrawer();
    const focused = document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);
    if (!focused && ['overview', 'inbox', 'exceptions'].includes(current) && !$('.modal-bg')) rerender();
  }
  function simulateArrival() {
    const v = L.vendors[Math.floor(Math.random() * L.vendors.length)];
    const exc = Math.random() < 0.22 ? 'price' : null;
    const { inv } = newInvoiceFrom(v, { exc });
    $('#syncTxt').innerHTML = '<i></i>New email from ' + esc(v.name.split(' ')[0]) + '…';
    liveRefresh();
    setTimeout(() => { finishProcessing(inv, exc); $('#syncTxt').innerHTML = '<i></i>Gmail synced just now'; }, 4200 + Math.random() * 2000);
  }

  function doUpload() {
    const m = modal({ title: 'Upload invoices', sub: 'PDF, JPG, PNG or e-invoice JSON · up to 25 MB each', ok: false, width: 560,
      body: `<label id="dz" style="display:grid;place-items:center;gap:8px;border:2px dashed var(--line-2);border-radius:14px;padding:36px 20px;text-align:center;cursor:pointer;transition:all .15s;background:var(--bg-soft)">${icon('upload').replace('<svg', '<svg style="width:30px;height:30px;color:var(--brand)"')}<b>Drop invoice files here or click to browse</b><span class="muted" style="font-size:13px">Multi-invoice PDFs are split automatically</span><input type="file" id="dzIn" multiple accept=".pdf,.jpg,.jpeg,.png,.json" style="display:none"></label>
      <div class="field"><label>Vendor (optional — we'll detect it)</label><select class="select" id="dzV"><option value="">Auto-detect from invoice</option>${L.vendors.map((v) => `<option value="${v.id}">${esc(v.name)}</option>`).join('')}</select></div>
      <div id="dzList" style="display:grid;gap:8px"></div>
      <p class="muted" style="font-size:12.5px">Or forward to <b class="mono">arvind-precision@in.ledgerloop.app</b></p>`,
      onOpen(bg) {
        const dz = bg.querySelector('#dz'), inp = bg.querySelector('#dzIn');
        const handle = (files) => {
          if (!files.length) return;
          const list = bg.querySelector('#dzList');
          Array.from(files).slice(0, 5).forEach((f, k) => {
            const vid = bg.querySelector('#dzV').value;
            const v = vid ? vendorById[vid] : L.vendors[Math.floor(Math.random() * L.vendors.length)];
            const row = document.createElement('div');
            row.className = 'attcard'; row.style.cssText = 'margin:0;width:100%';
            row.innerHTML = `<span class="pdf">${(f.name.split('.').pop() || 'PDF').toUpperCase().slice(0, 4)}</span><div style="flex:1;min-width:0"><b style="font-size:13.5px;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(f.name)}</b><div class="muted" style="font-size:12px" data-st>Uploading… ${Math.max(1, Math.round(f.size / 1024))} KB</div></div><span class="spinner" style="border-color:#dde;border-top-color:var(--brand)"></span>`;
            list.appendChild(row);
            setTimeout(() => { row.querySelector('[data-st]').textContent = 'Extracting with AI…'; }, 700 + k * 300);
            setTimeout(() => {
              const { inv } = newInvoiceFrom(v, { upload: true, file: f.name });
              finishProcessing(inv, null);
              row.querySelector('[data-st]').innerHTML = `Detected <b>${esc(v.name)}</b> · ${esc(inv.number)} · ${inr(inv.total)}`;
              row.querySelector('.spinner').outerHTML = `<button class="btn btn-ghost btn-sm" data-open="${inv.id}">Open</button>`;
              row.querySelector('[data-open]').onclick = () => { m.close(); openInvoice(inv.id); };
            }, 2600 + k * 500);
          });
        };
        inp.onchange = () => handle(inp.files);
        dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.style.borderColor = 'var(--brand)'; dz.style.background = 'var(--brand-soft)'; });
        dz.addEventListener('dragleave', () => { dz.style.borderColor = ''; dz.style.background = 'var(--bg-soft)'; });
        dz.addEventListener('drop', (e) => { e.preventDefault(); dz.style.borderColor = ''; dz.style.background = 'var(--bg-soft)'; handle(e.dataTransfer.files); });
      } });
  }

  // ---------- notifications ----------
  const notifs = [];
  function seedNotifs() {
    L.invoices.filter(needsAction).forEach((i) => notifs.push({ inv: i, at: i.received, ic: 'alert', tone: 'err', t: '<b>' + esc(V(i).name) + '</b> — ' + esc(excLabel(i)) }));
    const p = L.invoices.find((i) => i.status === 'paid');
    notifs.push({ inv: p, at: p.payment.paidOn, ic: 'bank', tone: 'pay', t: 'Bank confirmed payment to <b>' + esc(V(p).name) + '</b> · ' + inr(p.total) });
    notifs.push({ at: new Date(Date.now() - 26 * 3600000), ic: 'sparkles', tone: 'ai', t: '<b>Weekly digest:</b> 212 bills posted, 91.4% touchless, ₹64,800 overbilling caught', go: '#/overview' });
    notifs.sort((a, b) => b.at - a.at);
  }
  function pushNotif(inv) {
    notifs.unshift({ inv, at: now(), ic: inv.exception ? 'alert' : 'book', tone: inv.exception ? 'err' : 'book', t: inv.exception ? '<b>' + esc(V(inv).name) + '</b> — ' + esc(L.EXC[inv.exception]) : 'Bill posted for <b>' + esc(V(inv).name) + '</b> · ' + inr(inv.total), unread: true });
    store.notifRead = false; $('#bellDot').style.display = '';
  }
  function toggleDD(kind, btn) {
    const ex = $('.dd'); if (ex) { const k = ex.dataset.k; ex.remove(); if (k === kind) return; }
    const dd = document.createElement('div'); dd.className = 'dd' + (kind === 'me' ? ' menu' : ''); dd.dataset.k = kind;
    if (kind === 'bell') {
      dd.innerHTML = `<div class="dd-h">Notifications <a id="markAll">Mark all read</a></div><div class="dd-list">${notifs.slice(0, 12).map((n, k) => `<div class="dd-item${!store.notifRead && k < 5 ? ' unread' : ''}" data-n="${k}"><span class="di tone-${n.tone}">${icon(n.ic)}</span><div>${n.t}<small>${rel(n.at)}</small></div></div>`).join('')}</div>`;
      dd.querySelector('#markAll').onclick = () => { store.notifRead = true; save(); $('#bellDot').style.display = 'none'; $$('.dd-item', dd).forEach((x) => x.classList.remove('unread')); };
      $$('.dd-item', dd).forEach((x) => x.onclick = () => { const n = notifs[+x.dataset.n]; dd.remove(); if (n.inv) openInvoice(n.inv.id); else if (n.go) go(n.go); });
    } else {
      dd.innerHTML = `<div style="padding:10px 10px 6px;display:flex;gap:10px;align-items:center"><span class="avatar" style="background:${ME.color}">${ME.initials}</span><div><b style="font-size:14px">${ME.name}</b><div class="muted" style="font-size:12px">${ME.email}</div></div></div><hr><a href="#/settings">${icon('settings')}Rules &amp; settings</a><a href="#/integrations">${icon('plug')}Integrations</a><button data-act="shortcuts">${icon('zap')}Keyboard shortcuts</button><a href="index.html">${icon('ext')}Ledgerloop website</a><hr><a href="login.html">${icon('logout')}Sign out</a>`;
      $$('a,button', dd).forEach((x) => x.addEventListener('click', () => setTimeout(() => dd.remove())));
    }
    document.body.appendChild(dd);
  }

  // ---------- command palette ----------
  function openCmdk() {
    if ($('.cmdk-bg')) return;
    const bg = document.createElement('div'); bg.className = 'cmdk-bg';
    bg.innerHTML = `<div class="cmdk"><div class="cmdk-in">${icon('search')}<input placeholder="Search invoices, vendors, POs or jump to…" id="cmdIn"><kbd class="kbd">Esc</kbd></div><div class="cmdk-list" id="cmdList"></div></div>`;
    document.body.appendChild(bg);
    const inp = $('#cmdIn'); let items = [], idx = 0;
    const pages = [['Overview', '#/overview', 'home'], ['Inbox', '#/inbox', 'inbox'], ['Invoices', '#/invoices', 'file'], ['Exceptions', '#/exceptions', 'alert'], ['Payments', '#/payments', 'calendar'], ['Purchase orders', '#/pos', 'clipboard'], ['Vendors', '#/vendors', 'users'], ['Integrations', '#/integrations', 'plug'], ['Rules & settings', '#/settings', 'settings']];
    function draw() {
      const q = inp.value.trim().toLowerCase();
      const pg = pages.filter((p) => !q || p[0].toLowerCase().includes(q)).map((p) => ({ sec: 'Pages', label: p[0], ic: p[2], fn: () => go(p[1]) }));
      const iv = q ? L.invoices.filter((i) => (i.number + ' ' + V(i).name + ' ' + i.id + ' ' + Math.round(i.total)).toLowerCase().includes(q)).slice(0, 6).map((i) => ({ sec: 'Invoices', label: esc(V(i).name) + ' · <span class="mono">' + esc(i.number) + '</span>', meta: inr(i.total), ic: 'file', fn: () => openInvoice(i.id) })) : L.invoices.filter(needsAction).slice(0, 4).map((i) => ({ sec: 'Needs action', label: esc(V(i).name) + ' · <span class="mono">' + esc(i.number) + '</span>', meta: esc(excLabel(i)), ic: 'alert', fn: () => openInvoice(i.id) }));
      const vd = q ? L.vendors.filter((v) => (v.name + v.gstin).toLowerCase().includes(q)).slice(0, 4).map((v) => ({ sec: 'Vendors', label: esc(v.name), meta: v.gstin, ic: 'users', fn: () => { go('#/vendors'); setTimeout(() => openVendor(v.id), 50); } })) : [];
      const pp = q ? L.pos.filter((p) => p.id.toLowerCase().includes(q)).slice(0, 3).map((p) => ({ sec: 'Purchase orders', label: p.id + ' · ' + esc(vendorById[p.vendorId].name), meta: inr(p.amount), ic: 'clipboard', fn: () => openPO(p.id) })) : [];
      const acts = [{ sec: 'Actions', label: 'Upload invoice', ic: 'upload', fn: doUpload }, { sec: 'Actions', label: 'Export invoices to CSV', ic: 'download', fn: () => exportCSV(L.invoices, 'ledgerloop-invoices.csv') }].filter((a) => !q || a.label.toLowerCase().includes(q));
      items = iv.concat(vd, pp, pg, acts);
      idx = Math.min(idx, Math.max(0, items.length - 1));
      let sec = '';
      $('#cmdList').innerHTML = items.map((it, k) => { const h = it.sec !== sec ? '<div class="cmdk-sec">' + it.sec + '</div>' : ''; sec = it.sec; return h + `<div class="cmdk-it${k === idx ? ' on' : ''}" data-k="${k}">${icon(it.ic)}<span>${it.label}</span>${it.meta ? '<small>' + it.meta + '</small>' : ''}</div>`; }).join('') || '<div class="empty"><b>No results</b>Try an invoice number, vendor or GSTIN</div>';
    }
    const close = () => bg.remove();
    const pick = (k) => { const it = items[k]; close(); if (it) it.fn(); };
    inp.addEventListener('input', () => { idx = 0; draw(); });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { idx = Math.min(items.length - 1, idx + 1); draw(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { idx = Math.max(0, idx - 1); draw(); e.preventDefault(); }
      else if (e.key === 'Enter') pick(idx);
      else if (e.key === 'Escape') close();
    });
    bg.addEventListener('mousedown', (e) => { if (e.target === bg) close(); });
    $('#cmdList').addEventListener('click', (e) => { const it = e.target.closest('[data-k]'); if (it) pick(+it.dataset.k); });
    draw(); inp.focus();
  }

  // ---------- global events ----------
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.dd') && !e.target.closest('#bellBtn') && !e.target.closest('#meBtn')) { const d = $('.dd'); if (d) d.remove(); }
    const cm = e.target.closest('[data-closemodal]'); if (cm) { const mb = cm.closest('.modal-bg'); if (mb) mb.remove(); }
    if (e.target.closest('[data-stop]')) return;
    const go2 = e.target.closest('[data-go]'); if (go2) { go(go2.dataset.go); return; }
    const a = e.target.closest('[data-act]');
    if (a) {
      const id = a.dataset.id, inv = id && L.invoices.find((i) => i.id === id);
      e.stopPropagation();
      switch (a.dataset.act) {
        case 'approve': return doApprove(inv);
        case 'reject': return doReject(inv);
        case 'slack': return doSlack(inv);
        case 'markpaid': return doMarkPaid(inv);
        case 'upload': return doUpload();
        case 'closedr': return closeDrawer();
        case 'note': return addNote(inv);
        case 'export': { const list = L.invoices.filter((i) => invFilter(i, invState.tab)); exportCSV(list, 'ledgerloop-invoices-' + invState.tab + '.csv'); return toast('Export ready', list.length + ' invoices downloaded as CSV', 'download'); }
        case 'bulk-export': { const list = L.invoices.filter((i) => invState.sel.has(i.id)); exportCSV(list, 'ledgerloop-selected.csv'); return toast('Export ready', list.length + ' invoices', 'download'); }
        case 'bulk-approve': { let n = 0; L.invoices.filter((i) => invState.sel.has(i.id) && (i.status === 'review' || i.status === 'exception')).forEach((i) => { approve(i, 'Bulk approved', true); n++; }); invState.sel.clear(); rerender(); return toast(n ? n + ' invoices approved & posted' : 'Nothing to approve', n ? 'Posted to ' + L.company.books : 'Only invoices needing action can be approved.', n ? 'book' : 'alert'); }
        case 'bulk-clear': invState.sel.clear(); return rerender();
        case 'runall': runAll = !runAll; return rerender();
        case 'notdup': inv.status = 'posted'; inv.exception = null; inv.bill = { ref: billRef(), at: now() }; addEvent(inv, 'ok', 'Marked as not a duplicate', ME.name); addEvent(inv, 'book', 'Purchase voucher ' + inv.bill.ref + ' created in ' + L.company.books); save(inv); toast('Posted to ' + L.company.books, inv.bill.ref, 'book'); return afterChange();
        case 'schedule': inv.status = 'scheduled'; inv.payment = { date: new Date(Math.max(+inv.due, Date.now())), mode: inv.total > 200000 ? 'RTGS' : 'NEFT', bank: 'HDFC Bank ••4471' }; addEvent(inv, 'pay', 'Payment scheduled for ' + fmtD(inv.payment.date), ME.name); save(inv); toast('Payment scheduled', fmtD(inv.payment.date), 'calendar'); return afterChange();
        case 'reschedule': return modal({ title: 'Reschedule payment', sub: esc(V(inv).name) + ' · due ' + fmtD(inv.due), ok: 'Reschedule', body: `<div class="field"><label>New payment date</label><input class="input" type="date" id="rsD" value="${new Date(inv.payment.date).toISOString().slice(0, 10)}"></div><p class="muted" style="font-size:13px">${V(inv).terms >= 45 ? '⚠️ MSME vendor — payments beyond 45 days are disallowed under Sec 43B(h).' : 'Vendor will see the updated date on their remittance.'}</p>`, onOk(bg) { inv.payment.date = new Date(bg.querySelector('#rsD').value + 'T12:00'); addEvent(inv, 'pay', 'Payment rescheduled to ' + fmtD(inv.payment.date), ME.name); save(inv); toast('Payment rescheduled', fmtD(inv.payment.date), 'calendar'); afterChange(); } });
        case 'remit': return toast('Remittance advice sent', 'to ' + V(inv).email, 'send');
        case 'askvendor': return modal({ title: 'Email vendor', sub: esc(V(inv).email), ok: 'Send email', body: `<div class="field"><label>Subject</label><input class="input" value="Query on invoice ${esc(inv.number)}"></div><div class="field"><label>Message</label><textarea class="textarea" style="min-height:140px">Dear ${esc(V(inv).contact)},\n\nRegarding invoice ${inv.number}: ${excLabel(inv).toLowerCase()}.\n${inv.exception === 'price' ? 'Kindly issue a credit note for the rate difference or share the revised rate approval.' : 'Kindly confirm or share a corrected invoice.'}\n\nRegards,\n${ME.name}</textarea></div>`, onOk() { addEvent(inv, 'mail', 'Emailed vendor at ' + V(inv).email, ME.name); save(inv); toast('Email sent', V(inv).email, 'mail'); if (drawerId) renderDrawer(); } });
        case 'linkpo': return modal({ title: 'Link a purchase order', ok: 'Link & re-match', body: `<div class="field"><label>Purchase order</label><select class="select" id="lpo">${L.pos.filter((p) => p.vendorId === inv.vendorId).map((p) => `<option value="${p.id}">${p.id} · ${fmtD(p.date)} · ${inr(p.amount)}</option>`).join('') || '<option>No POs for this vendor</option>'}</select></div>`, onOk() { toast('Re-matching…', 'Linked PO amount differs — still needs approval as non-PO spend.', 'link'); } });
        case 'prevnext': { const list = current === 'exceptions' ? L.invoices.filter(needsAction) : L.invoices; const k = list.findIndex((i) => i.id === drawerId); const n = list[k + +a.dataset.d]; if (n) { drawerId = n.id; renderDrawer(); } return; }
        case 'dlpdf': return toast('Downloading original', L.invoices.find((i) => i.id === drawerId).file, 'download');
        case 'sync': a.innerHTML = '<span class="spinner" style="border-color:#dde;border-top-color:var(--brand)"></span> Syncing…'; return setTimeout(() => { a.innerHTML = icon('refresh') + 'Sync now'; toast('Inbox up to date', 'No new invoices since ' + fmtT(now()), 'refresh'); }, 1200);
        case 'forward': return modal({ title: 'Forwarding address', sub: 'Vendors or colleagues can send invoices here too', ok: false, body: `<div style="display:flex;gap:8px"><input class="input mono" readonly value="arvind-precision@in.ledgerloop.app" id="fwd"><button type="button" class="btn btn-primary" onclick="navigator.clipboard&&navigator.clipboard.writeText(document.getElementById('fwd').value);this.textContent='Copied ✓'">Copy</button></div><p class="muted" style="font-size:13px">Tip: set up a Gmail filter to auto-forward attachments from vendor domains.</p>` });
        case 'reclassify': { const m = L.emails.find((x) => x.id === a.dataset.m); const v = L.vendors.find((x) => x.name === m.vendor) || L.vendors[1]; m.ignored = null; const { inv: ni } = newInvoiceFrom(v, { upload: true, file: m.file }); m.invId = ni.id; save(); toast('Processing as invoice', 'Thanks — the classifier will learn from this.', 'sparkles'); setTimeout(() => finishProcessing(ni, null), 3000); return rerender(); }
        case 'runpay': {
          const list = L.invoices.filter((i) => runSel.has(i.id) && i.status === 'scheduled');
          const tot = list.reduce((s, i) => s + netPayable(i), 0);
          return modal({ title: 'Approve payment run', sub: list.length + ' bills · ' + inr(tot) + ' from HDFC Bank ••4471', ok: 'Approve & download file',
            body: `${tot > settings.approvalLimit ? `<div class="alert-box amber"><span class="ai">${icon('users')}</span><div><b>Second approval required</b><p>Runs above ${inr(settings.approvalLimit)} also need ${L.team[3].name}. We'll notify her on Slack after you approve.</p></div></div>` : ''}<div class="field"><label>Bank file format</label><select class="select"><option>HDFC ENet bulk upload (.csv)</option><option>ICICI CIB (.txt)</option><option>Generic NEFT/RTGS (.xlsx)</option></select></div><div class="field"><label>Enter OTP sent to +91 ••••• •4417</label><input class="input mono" required value="482913" maxlength="6"></div>`,
            onOk() {
              list.forEach((i) => { i.approved = true; addEvent(i, 'pay', 'Included in payment run approved by ' + ME.name, ME.name); save(i); });
              download('HDFC_ENET_' + new Date().toISOString().slice(0, 10) + '.csv', ['Transaction Type,Beneficiary Code,Beneficiary Name,Amount,Payment Date,Customer Reference'].concat(list.map((i) => [i.payment.mode === 'RTGS' ? 'R' : 'N', V(i).id, '"' + V(i).name + '"', netPayable(i).toFixed(2), new Date().toLocaleDateString('en-GB'), i.number].join(','))).join('\n'));
              toast('Payment run approved', inr(tot) + ' · bank file downloaded · ' + (tot > settings.approvalLimit ? 'awaiting ' + L.team[3].name.split(' ')[0] : 'ready to upload'), 'bank');
              rerender();
            } });
        }
        case 'bankconfirm': {
          const cand = L.invoices.filter((i) => i.status === 'scheduled').sort((x, y) => x.payment.date - y.payment.date).slice(0, 2);
          a.innerHTML = '<span class="spinner" style="border-color:#dde;border-top-color:var(--brand)"></span> Fetching…';
          return setTimeout(() => { cand.forEach((i, k) => setTimeout(() => { markPaid(i, 'HDFCR5' + Math.floor(20000000 + Math.random() * 79999999) + Math.floor(10 + Math.random() * 89), now(), true); rerender(); }, k * 700)); if (!cand.length) toast('Statement fetched', 'No new debits to reconcile', 'bank'); }, 1300);
        }
        case 'posync': a.innerHTML = '<span class="spinner" style="border-color:#dde;border-top-color:var(--brand)"></span> Syncing…'; return setTimeout(() => { a.innerHTML = icon('refresh') + 'Sync now'; toast('Purchase orders synced', 'Google Sheets: 0 new · Excel: 2 GRN updates · Tally: 0 new', 'refresh'); }, 1400);
        case 'newpo': return modal({ title: 'New purchase order', sub: 'Will be added to “PO Register FY26-27” in Google Sheets', ok: 'Create PO', body: `<div class="field"><label>Vendor</label><select class="select">${L.vendors.map((v) => `<option>${esc(v.name)}</option>`).join('')}</select></div><div class="row2"><div class="field"><label>Item</label><input class="input" required placeholder="e.g. MS round bar EN8"></div><div class="field"><label>Amount (₹)</label><input class="input" type="number" required placeholder="0"></div></div>`, onOk() { toast('PO-' + (2600 + L.pos.length) + ' created', 'Synced to Google Sheets', 'clipboard'); } });
        case 'newvendor': return modal({ title: 'Add vendor', ok: 'Add vendor', body: `<div class="field"><label>GSTIN</label><input class="input mono" id="nvG" required maxlength="15" placeholder="15-character GSTIN" style="text-transform:uppercase"></div><div id="nvR" class="muted" style="font-size:13px">We'll fetch the legal name and address from the GST portal.</div><div class="field"><label>Payment terms</label><select class="select"><option>Net 15</option><option selected>Net 30</option><option>Net 45 (MSME)</option></select></div>`, onOpen(bg) { bg.querySelector('#nvG').addEventListener('input', (e) => { const r = L.validateGstin(e.target.value); if (e.target.value.length === 15) bg.querySelector('#nvR').innerHTML = r.valid ? '<span style="color:var(--green);font-weight:600">✓ Valid GSTIN · ' + r.state + '</span>' : '<span style="color:var(--red);font-weight:600">✕ Invalid GSTIN — check the checksum digit</span>'; }); }, onOk(bg) { if (!L.validateGstin(bg.querySelector('#nvG').value).valid) { bg.querySelector('#nvR').innerHTML = '<span style="color:var(--red);font-weight:600">Enter a valid GSTIN to continue</span>'; return false; } toast('Vendor added', 'Details fetched from GST portal', 'users'); } });
        case 'addrule': return modal({ title: 'Add routing rule', ok: 'Create rule', body: `<div class="field"><label>When</label><select class="select"><option>Vendor category is Freight</option><option>Amount is above ₹2,00,000</option><option>Exception type is No PO</option></select></div><div class="field"><label>Route to</label><select class="select">${L.team.map((t) => `<option>${t.name}</option>`).join('')}</select></div><div class="field"><label>Via</label><select class="select"><option>Slack DM</option><option>${settings.slackChannel}</option><option>Email</option></select></div>`, onOk() { toast('Rule created', 'Active for new exceptions', 'settings'); } });
        case 'invite': return modal({ title: 'Invite teammate', sub: 'Unlimited seats on every plan', ok: 'Send invite', body: `<div class="field"><label>Email</label><input class="input" type="email" required placeholder="name@arvindprecision.in"></div><div class="field"><label>Role</label><select class="select"><option>Accountant</option><option>Approver</option><option>Purchase (view POs)</option><option>Auditor (read-only)</option><option>External CA</option></select></div>`, onOk(bg) { toast('Invite sent', bg.querySelector('input').value, 'mail'); } });
        case 'upgrade': return modal({ title: 'Upgrade to Scale', sub: 'Up to 2,500 invoices / month · ₹15,999/mo billed annually', ok: 'Upgrade now', body: `<ul class="checks" style="margin:0">${['Multi-plant / multi-GSTIN', 'SAP B1 & custom ERP connectors', 'Approval matrices by amount', 'Priority support · 4h SLA'].map((t) => '<li>' + icon('check') + '<span>' + t + '</span></li>').join('')}</ul><p class="muted" style="font-size:13px">Prorated difference for the remaining term will be charged to the card on file (Visa ••4242).</p>`, onOk() { toast('Plan upgraded', 'Welcome to Scale — new limits are active now.', 'zap'); } });
        case 'invoices-dl': return toast('Billing invoices', 'Sent to accounts@arvindprecision.in', 'mail');
        case 'shortcuts': return modal({ title: 'Keyboard shortcuts', ok: false, body: `<dl class="kv">${[['Ctrl / ⌘ + K', 'Search & command palette'], ['g then o', 'Go to overview'], ['g then i', 'Go to invoices'], ['g then e', 'Go to exceptions'], ['g then p', 'Go to payments'], ['u', 'Upload invoice'], ['j / k', 'Next / previous invoice in drawer'], ['a', 'Approve invoice in drawer'], ['Esc', 'Close drawer or dialog']].map((r) => `<dt><kbd class="kbd">${r[0]}</kbd></dt><dd style="font-weight:500">${r[1]}</dd>`).join('')}</dl>` });
        case 'reset': return modal({ title: 'Reset workspace?', sub: 'All approvals, uploads and setting changes made in this browser will be cleared.', body: '<p class="muted">This cannot be undone.</p>', ok: 'Reset workspace', danger: true, onOk() { try { localStorage.removeItem(KEY); } catch (e) { /* */ } location.hash = '#/overview'; location.reload(); } });
      }
      return;
    }
    const o = e.target.closest('[data-open]');
    if (o) { openInvoice(o.dataset.open); }
  });

  document.addEventListener('keydown', (e) => {
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openCmdk(); return; }
    if (e.key === 'Escape') { if ($('.modal-bg') || $('.cmdk-bg')) return; if ($('.dd')) return $('.dd').remove(); if (drawerId) closeDrawer(); return; }
    if (typing || $('.modal-bg') || $('.cmdk-bg')) return;
    if (drawerId && (e.key === 'j' || e.key === 'k')) { const b = $('[data-act="prevnext"][data-d="' + (e.key === 'j' ? 1 : -1) + '"]'); if (b) b.click(); return; }
    if (drawerId && e.key === 'a') { const b = $('#drawer [data-act="approve"]'); if (b) b.click(); return; }
    if (e.key === '/') { e.preventDefault(); openCmdk(); return; }
    if (e.key === 'u') { doUpload(); return; }
    if (window._g) { const m = { o: '#/overview', i: '#/invoices', e: '#/exceptions', p: '#/payments', v: '#/vendors', b: '#/inbox' }[e.key]; window._g = false; if (m) go(m); return; }
    if (e.key === 'g') { window._g = true; setTimeout(() => window._g = false, 900); }
  });

  // ---------- boot ----------
  document.addEventListener('DOMContentLoaded', () => {
    seedNotifs();
    if (store.notifRead) $('#bellDot').style.display = 'none';
    $('#searchBtn').onclick = openCmdk;
    $('#searchBtn').onkeydown = (e) => { if (e.key === 'Enter') openCmdk(); };
    $('#uploadBtn').onclick = doUpload;
    $('#bellBtn').onclick = (e) => { e.stopPropagation(); toggleDD('bell'); };
    $('#meBtn').onclick = (e) => { e.stopPropagation(); toggleDD('me'); };
    $('#helpBtn').onclick = () => modal({ title: 'Help & support', ok: false, body: `<div class="alert-box blue"><span class="ai">${icon('help')}</span><div><b>Chat with support</b><p>Average first response: 4 minutes (Mon–Sat, 9am–9pm IST).</p><div class="acts"><button type="button" class="btn btn-primary btn-sm" onclick="this.textContent='Connecting you to Priya…'">Start chat</button></div></div></div><dl class="kv"><dt>Help centre</dt><dd>help.ledgerloop.app</dd><dt>Phone</dt><dd>+91 20 6712 4400</dd><dt>Your CSM</dt><dd>Karan Mehta · karan@ledgerloop.app</dd></dl><button type="button" class="btn btn-ghost" data-act="shortcuts" data-closemodal>${icon('zap')}Keyboard shortcuts</button>` });
    $('#burger').onclick = (e) => { e.stopPropagation(); $('#side').classList.toggle('open'); };
    $('#orgBtn').onclick = () => modal({ title: 'Switch workspace', ok: false, body: [['AP', 'Arvind Precision Components', 'Pune plant · Growth', '#fde7d4', '#c2410c', true], ['AC', 'Arvind Castings LLP', 'Chakan · Starter', '#e6f7f5', '#0d9488'], ['+', 'Create new workspace', 'For another entity or GSTIN', '#eef1f6', '#6b7489']].map((w) => `<button type="button" class="org" style="margin:0" ${w[5] ? 'data-closemodal' : 'onclick="this.querySelector(\'small\').textContent=\'Switching…\'"'}><span class="oa" style="background:${w[3]};color:${w[4]}">${w[0]}</span><span style="min-width:0"><b>${w[1]}</b><small>${w[2]}</small></span>${w[5] ? '<span class="badge green plain" style="margin-left:auto">Current</span>' : ''}</button>`).join('') });
    window.addEventListener('hashchange', () => { closeDrawer(true); route(); });
    route();

    // finish the invoice that is "extracting" on load, then start the live stream
    const pending = L.invoices.filter((i) => i.status === 'extracting');
    pending.forEach((inv, k) => setTimeout(() => finishProcessing(inv, null), 5000 + k * 2000));
    setTimeout(function loop() { if (!document.hidden) simulateArrival(); setTimeout(loop, 50000 + Math.random() * 40000); }, 25000);
  });
})();
