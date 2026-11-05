/* Ledgerloop marketing site interactions */
(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const inr = (n) => '₹' + Math.round(n).toLocaleString('en-IN');

  window.toast = function (title, sub, ic) {
    const box = $('#toasts'); if (!box) return;
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = '<span class="ti">' + icon(ic || 'check') + '</span><div><b>' + title + '</b>' + (sub ? '<small>' + sub + '</small>' : '') + '</div><button aria-label="Dismiss">×</button>';
    box.appendChild(t);
    const kill = () => { t.classList.add('out'); setTimeout(() => t.remove(), 250); };
    t.querySelector('button').onclick = kill;
    setTimeout(kill, 4800);
  };

  document.addEventListener('DOMContentLoaded', function () {
    // nav
    const nav = $('#nav');
    const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
    $('#burger').onclick = () => $('#navMobile').classList.toggle('open');
    $$('#navMobile a').forEach((a) => a.addEventListener('click', () => $('#navMobile').classList.remove('open')));

    // reveal
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.12 });
    $$('.reveal').forEach((el) => io.observe(el));

    // counters
    const cio = new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.isIntersecting) return; cio.unobserve(e.target);
      $$('[data-count]', e.target).forEach((el) => {
        const to = +el.dataset.count, dec = +(el.dataset.dec || 0), pre = el.dataset.pre || '', suf = el.dataset.suf || '';
        const t0 = performance.now();
        (function step(t) {
          const k = Math.min(1, (t - t0) / 1300), v = to * (1 - Math.pow(1 - k, 3));
          el.textContent = pre + v.toFixed(dec) + suf;
          if (k < 1) requestAnimationFrame(step);
        })(t0);
      });
    }), { threshold: 0.4 });
    $$('.stats').forEach((el) => cio.observe(el));

    // hero pipeline loop
    const feed = [
      { v: 'Kaveri Steel Traders', s: ['Tax Invoice KST-1987 · KST-1987.pdf · 212 KB', '₹4,73,086 · IGST ₹72,166 · due 20 Dec 2026', 'Active · Regular taxpayer · no duplicate in 2,914 bills', 'Qty ✓ · Tax ✓ · Unit price 6.4% above PO', 'Assigned to Neha Kulkarni · SLA 4 working hrs'], g: '29AAJFK3319P1ZQ', po: 'PO-2419', warn: true },
      { v: 'Shree Balaji Packaging', s: ['Invoice SBP/26-27/0612 · SBP_26-27_0612.pdf · 148 KB', '₹1,12,868 · IGST ₹17,217 · due 05 Dec 2026', 'Active · Regular taxpayer · no duplicate in 2,915 bills', 'Qty ✓ · Price ✓ · Tax ✓ · within tolerance', 'Purchase voucher TLY-PUR-5303 created in Tally Prime'], g: '24AAKCS7712M1ZY', po: 'PO-2420', warn: false },
      { v: 'Om Sai Logistics', s: ['Invoice OSL/PUN/1142 · OSL_PUN_1142.pdf · 96 KB', '₹9,408 · CGST ₹504 · SGST ₹504 · due 20 Nov 2026', 'Active · Regular taxpayer · no duplicate in 2,916 bills', 'Matched to PO-2417 freight contract', 'Purchase voucher TLY-PUR-5304 created in Tally Prime'], g: '27ABMFO5520Q1ZK', po: 'PO-2417', warn: false }
    ];
    let fi = 0, count = 38;
    const steps = $$('.pipe-step');
    function runPipe() {
      const f = feed[fi % feed.length];
      steps.forEach((s) => s.classList.remove('on', 'active', 'done', 'warn'));
      steps[0].querySelector('b').textContent = 'New email from ' + f.v;
      steps[2].querySelector('b').textContent = 'GSTIN ' + f.g + ' verified';
      steps[3].querySelector('b').textContent = '3-way match with ' + f.po + ' + GRN';
      steps[3].querySelector('.check').innerHTML = icon(f.warn ? 'alert' : 'check');
      steps[4].querySelector('.pipe-ico').innerHTML = icon(f.warn ? 'slack' : 'book');
      steps[4].querySelector('.pipe-ico').style.cssText = f.warn ? 'color:#611f69;background:#f6eaf7' : 'color:#4f46e5;background:#eef0ff';
      steps[4].querySelector('b').textContent = f.warn ? 'Routed to #ap-exceptions' : 'Bill posted to Tally Prime';
      f.s.forEach((t, i) => { $('#ps' + i).textContent = t; });
      steps.forEach((s, i) => {
        setTimeout(() => { s.classList.add('on', 'active'); }, 300 + i * 900);
        setTimeout(() => { s.classList.remove('active'); s.classList.add('done'); if (i === 3 && f.warn) s.classList.add('warn'); }, 950 + i * 900);
      });
      setTimeout(() => { count++; $('#pipeCount').textContent = count; }, 300 + 5 * 900);
      fi++;
      setTimeout(runPipe, 7800);
    }
    if (steps.length) runPipe();

    // extraction hover link
    $$('.xt-field').forEach((f) => {
      f.addEventListener('mouseenter', () => $$('.hl[data-f="' + f.dataset.f + '"]').forEach((h) => h.classList.add('on')));
      f.addEventListener('mouseleave', () => $$('.hl').forEach((h) => h.classList.remove('on')));
    });
    let xi = 0; const xf = $$('.xt-field');
    setInterval(() => {
      if (document.querySelector('.xt-field:hover')) return;
      xf.forEach((f) => f.classList.remove('on')); $$('.hl').forEach((h) => h.classList.remove('on'));
      const f = xf[xi++ % xf.length]; f.classList.add('on');
      $$('.hl[data-f="' + f.dataset.f + '"]').forEach((h) => h.classList.add('on'));
    }, 1600);

    // slack demo
    const sa = $('#slackApprove');
    if (sa) sa.onclick = () => {
      sa.textContent = '✓ Approved by you'; sa.disabled = true;
      $('#slackReply').innerHTML = '✅ <b>You</b> approved the variance · bill <b>TLY-PUR-5311</b> posted to Tally Prime · payment scheduled for 20 Dec';
      toast('Variance approved', 'Bill posted to Tally Prime — this is how it feels in the product.');
    };

    // payments demo
    const today = new Date();
    const fri = new Date(today); fri.setDate(today.getDate() + ((5 - today.getDay() + 7) % 7 || 7));
    const pays = [['Kaveri Steel Traders', 'KST-1874 · Net 45 · MSME', 312400, 'RTGS'], ['Deccan Freight Carriers', 'DFC22417 · Net 15', 186250, 'NEFT'], ['Annapurna Polymers Pvt Ltd', 'APPL/INV/7356 · 2% early-pay', 291866, 'RTGS'], ['BlueLine IT Services', 'BLIT/2026/918 · Net 30', 113280, 'NEFT'], ['Mehta Print Solutions', 'MPS-231 · Net 7', 38520, 'NEFT']];
    const cal = $('#calDemo');
    if (cal) cal.innerHTML = pays.map((p, i) => {
      const d = new Date(fri); d.setDate(fri.getDate() + (i > 2 ? 7 : 0));
      return '<div class="cal-row"><div class="cal-date"><small>' + d.toLocaleDateString('en-IN', { month: 'short' }) + '</small><b>' + d.getDate() + '</b></div><div><div class="v">' + p[0] + '</div><div class="s">' + p[1] + ' · ' + p[3] + '</div></div><div class="amt">' + inr(p[2]) + '<div class="s" style="text-align:right">' + (i === 0 ? '<span class="badge green" style="height:20px">Approved</span>' : i < 3 ? '<span class="badge teal" style="height:20px">Scheduled</span>' : '<span class="badge amber" style="height:20px">Awaiting approver</span>') + '</div></div></div>';
    }).join('');

    // integrations
    const ints = [
      ['Gmail', 'Inbox monitoring', '#ea4335', 'G'], ['Google Workspace', 'Shared mailboxes', '#4285f4', 'W'], ['Outlook 365', 'Inbox monitoring', '#0a64d6', 'O'], ['WhatsApp', 'Forward invoices', '#25d366', 'W'],
      ['Tally Prime', 'Purchase vouchers', '#1c3d72', 'T'], ['Zoho Books', 'Bills & vendors', '#e42527', 'Z'], ['SAP Business One', 'ERP sync', '#0f6ab4', 'S'], ['Busy Accounting', 'Purchase entries', '#f47b20', 'B'],
      ['Google Sheets', 'PO register', '#0f9d58', 'S'], ['Excel / OneDrive', 'PO register', '#1d6f42', 'X'], ['Slack', 'Exception routing', '#4a154b', '#'], ['Microsoft Teams', 'Approvals', '#5059c9', 'T'],
      ['HDFC Bank', 'Payments & feed', '#004c8f', 'H'], ['ICICI Bank', 'Payments & feed', '#ae282e', 'I'], ['GST Portal', 'GSTIN & IRN check', '#2d3e8e', 'G'], ['REST API', 'Webhooks & SDK', '#0d1424', '{}']
    ];
    const ig = $('#intGrid');
    if (ig) ig.innerHTML = ints.map((x) => '<div class="int reveal in"><span class="int-logo" style="background:' + x[2] + '">' + x[3] + '</span><div><b>' + x[0] + '</b><small>' + x[1] + '</small></div></div>').join('');

    // ROI calculator
    const r = { inv: $('#rInv'), min: $('#rMin'), cost: $('#rCost'), err: $('#rErr') };
    function calc() {
      const inv = +r.inv.value, min = +r.min.value, cost = +r.cost.value, err = +r.err.value;
      $('#oInv').textContent = inv.toLocaleString('en-IN');
      $('#oMin').textContent = min;
      $('#oCost').textContent = inr(cost);
      $('#oErr').textContent = err + '%';
      const hoursNow = inv * min / 60, hoursAfter = inv * 0.09 * 4 / 60 + inv * 0.2 / 60;
      const saved = Math.max(0, hoursNow - hoursAfter);
      const hourly = cost / 176;
      const errCost = inv * 12 * (err / 100) * 0.6 * 1850;
      const annual = saved * hourly * 12 + errCost;
      $('#cSave').textContent = inr(annual);
      $('#cHours').textContent = Math.round(saved).toLocaleString('en-IN');
      $('#cFte').textContent = (saved / 176).toFixed(1);
      $('#cErr').textContent = inr(errCost);
      $('#cPlan').textContent = inv <= 150 ? 'Starter' : inv <= 750 ? 'Growth' : inv <= 2500 ? 'Scale' : 'Enterprise';
    }
    Object.values(r).forEach((x) => x && x.addEventListener('input', calc));
    if (r.inv) calc();

    // pricing
    const plans = [
      { n: 'Starter', f: 'For small businesses getting off spreadsheets', m: 2999, v: 'Up to 150 invoices / mo', o: '₹22 per extra invoice', feats: ['1 Gmail / Outlook inbox', 'AI extraction & GSTIN validation', 'Duplicate detection', 'Zoho Books or Tally sync', 'Email exception alerts'], cta: 'Start free trial' },
      { n: 'Growth', f: 'For SMEs with POs and an approval process', m: 8999, v: 'Up to 750 invoices / mo', o: '₹14 per extra invoice', pop: true, feats: ['Everything in Starter', '3 inboxes + WhatsApp capture', '2- & 3-way PO matching', 'Slack / Teams exception routing', 'Payment scheduling & bank recon', 'TDS & RCM handling'], cta: 'Start free trial' },
      { n: 'Scale', f: 'For manufacturers & distributors at volume', m: 19999, v: 'Up to 2,500 invoices / mo', o: '₹9 per extra invoice', feats: ['Everything in Growth', 'Multi-plant / multi-GSTIN', 'SAP B1 & custom ERP connectors', 'Approval matrices by amount', 'SSO (Google, Azure AD)', 'Priority support · 4h SLA'], cta: 'Start free trial' },
      { n: 'Firm & Enterprise', f: 'For CA firms and groups with many entities', m: null, v: 'Custom volume', o: 'Volume pricing', feats: ['Multi-client console', 'White-label vendor emails', 'Dedicated success manager', 'Custom data residency & DPA', 'On-prem Tally connector', 'Annual invoicing'], cta: 'Talk to sales' }
    ];
    let yearly = true;
    function renderPlans() {
      $('#plans').innerHTML = plans.map((p) => {
        const price = p.m == null ? '<b>Custom</b>' : '<b>' + inr(yearly ? p.m * 0.8 : p.m) + '</b><span>/ month</span>';
        return '<div class="plan' + (p.pop ? ' pop' : '') + '">' + (p.pop ? '<span class="pop-tag">Most popular</span>' : '') + '<h3>' + p.n + '</h3><p class="for">' + p.f + '</p><div class="price">' + price + '</div><small class="muted">' + (p.m == null ? 'Billed annually' : yearly ? 'Billed annually · ' + inr(p.m * 0.8 * 12) + '/yr' : 'Billed monthly') + '</small><div class="vol">' + p.v + ' · ' + p.o + '</div><ul>' + p.feats.map((x) => '<li>' + icon('check') + x + '</li>').join('') + '</ul><a href="' + (p.m == null ? '#demo' : 'login.html?signup=1&plan=' + p.n.toLowerCase()) + '" class="btn ' + (p.pop ? 'btn-primary' : 'btn-ghost') + '">' + p.cta + '</a></div>';
      }).join('');
    }
    $$('#billToggle button').forEach((b) => b.onclick = () => { yearly = b.dataset.b === 'y'; $$('#billToggle button').forEach((x) => x.classList.toggle('on', x === b)); renderPlans(); });
    if ($('#plans')) renderPlans();

    // CTA form
    const cf = $('#ctaForm');
    if (cf) cf.onsubmit = (e) => {
      e.preventDefault();
      const em = cf.querySelector('input[type=email]').value;
      const btn = cf.querySelector('button');
      btn.innerHTML = '<span class="spinner" style="border-color:rgba(0,0,0,.2);border-top-color:#1e1b4b"></span> Creating your workspace…';
      setTimeout(() => { location.href = 'login.html?signup=1&email=' + encodeURIComponent(em); }, 1100);
    };
    const dl = $('#demoLink');
    if (dl) dl.onclick = (e) => { e.preventDefault(); openDemo(); };
    $$('a[href="#demo"]').forEach((a) => { if (a.closest('.nav-cta')) a.onclick = (e) => { e.preventDefault(); openDemo(); }; });
  });

  function openDemo() {
    const d = new Date(); const slots = [];
    for (let i = 1; slots.length < 3; i++) { const x = new Date(d); x.setDate(d.getDate() + i); if (x.getDay() && x.getDay() < 6) slots.push(x); }
    const bg = document.createElement('div'); bg.className = 'modal-bg';
    bg.innerHTML = '<form class="modal"><div class="modal-h"><div><h3>Book a 20-minute walkthrough</h3><p>We\'ll run your own sample invoices through Ledgerloop live.</p></div><button type="button" class="modal-x">×</button></div><div class="modal-b"><div class="row2"><div class="field"><label>Name</label><input class="input" required placeholder="Your name"></div><div class="field"><label>Work email</label><input class="input" type="email" required placeholder="you@company.in"></div></div><div class="row2"><div class="field"><label>Invoices per month</label><select class="select"><option>Under 150</option><option selected>150 – 750</option><option>750 – 2,500</option><option>2,500+</option></select></div><div class="field"><label>Accounting system</label><select class="select"><option>Tally Prime</option><option>Zoho Books</option><option>SAP Business One</option><option>Busy</option><option>Other</option></select></div></div><div class="field"><label>Pick a slot (IST)</label><select class="select">' + slots.map((s) => ['11:00 AM', '3:30 PM'].map((t) => '<option>' + s.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) + ' · ' + t + '</option>').join('')).join('') + '</select></div></div><div class="modal-f"><button type="button" class="btn btn-ghost modal-x2">Cancel</button><button class="btn btn-primary">Confirm booking</button></div></form>';
    document.body.appendChild(bg);
    const close = () => bg.remove();
    bg.querySelector('.modal-x').onclick = close; bg.querySelector('.modal-x2').onclick = close;
    bg.onclick = (e) => { if (e.target === bg) close(); };
    bg.querySelector('form').onsubmit = (e) => { e.preventDefault(); const slot = bg.querySelectorAll('select')[2].value; close(); toast('Walkthrough booked', slot + ' — calendar invite sent to your inbox.', 'calendar'); };
  }
})();
