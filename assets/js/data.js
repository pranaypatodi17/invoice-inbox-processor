/* Ledgerloop — workspace dataset
 * Seeded so every visitor sees the same consistent books.
 * The workspace belongs to Arvind Precision Components Pvt Ltd, Pune (GSTIN state 27).
 */
(function () {
  'use strict';

  // ---------- helpers ----------
  const GST_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  function gstinChecksum(first14) {
    let sum = 0;
    for (let i = 0; i < 14; i++) {
      const v = GST_CHARS.indexOf(first14[i]);
      const p = v * (i % 2 === 0 ? 1 : 2);
      sum += Math.floor(p / 36) + (p % 36);
    }
    return GST_CHARS[(36 - (sum % 36)) % 36];
  }

  function makeGstin(state, pan, entity) {
    const base = state + pan + (entity || '1') + 'Z';
    return base + gstinChecksum(base);
  }

  const STATES = {
    '03': 'Punjab', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh',
    '19': 'West Bengal', '24': 'Gujarat', '27': 'Maharashtra', '29': 'Karnataka',
    '32': 'Kerala', '33': 'Tamil Nadu', '36': 'Telangana'
  };

  function validateGstin(g) {
    g = (g || '').trim().toUpperCase();
    const res = { gstin: g, valid: false, checks: [] };
    const fmt = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(g);
    res.checks.push({ label: 'Format (15 characters, GST pattern)', ok: fmt });
    const st = g.slice(0, 2);
    const stOk = fmt && (STATES[st] || (+st >= 1 && +st <= 38));
    res.checks.push({ label: 'State code ' + (STATES[st] ? st + ' · ' + STATES[st] : st || '—'), ok: !!stOk });
    const panOk = fmt && /^[A-Z]{3}[ABCFGHLJPT][A-Z][0-9]{4}[A-Z]$/.test(g.slice(2, 12));
    res.checks.push({ label: 'Embedded PAN ' + (g.slice(2, 12) || '—'), ok: panOk });
    const ck = fmt && gstinChecksum(g.slice(0, 14)) === g[14];
    res.checks.push({ label: 'Checksum digit', ok: !!ck });
    res.valid = !!(fmt && stOk && panOk && ck);
    res.state = STATES[st] || null;
    return res;
  }

  // deterministic RNG (mulberry32)
  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const R = rng(20261105);
  const pick = (a) => a[Math.floor(R() * a.length)];
  const between = (a, b) => Math.floor(a + R() * (b - a + 1));

  // "today" for the workspace is the real current date so the product feels live
  const TODAY = new Date();
  function minsAgo(n) { return new Date(Date.now() - n * 60000); }
  function daysAgo(n, h, m) {
    const d = new Date(TODAY);
    d.setDate(d.getDate() - n);
    d.setHours(h == null ? between(8, 19) : h, m == null ? between(0, 59) : m, 0, 0);
    return d;
  }
  function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

  // ---------- company ----------
  const company = {
    name: 'Arvind Precision Components Pvt Ltd',
    short: 'Arvind Precision',
    gstin: makeGstin('27', 'AAHCA4821K', '1'),
    address: 'Plot 42, MIDC Bhosari, Pune, Maharashtra 411026',
    inbox: 'invoices@arvindprecision.in',
    books: 'Tally Prime',
    plan: 'Growth',
    planLimit: 750
  };

  // ---------- vendors ----------
  const vendorSeed = [
    ['Shree Balaji Packaging Pvt Ltd', '24', 'AAKCS7712M', 'Packaging', 'accounts@shreebalajipack.com', 'Ahmedabad', 30, 'Rakesh Patel'],
    ['Kaveri Steel Traders', '29', 'AAJFK3319P', 'Raw material', 'billing@kaveristeel.in', 'Bengaluru', 45, 'Suresh Gowda'],
    ['Om Sai Logistics', '27', 'ABMFO5520Q', 'Freight', 'invoice@omsailogistics.co.in', 'Pune', 15, 'Prakash Jadhav'],
    ['Nirmal Chemicals LLP', '24', 'AAQFN8841D', 'Consumables', 'ar@nirmalchem.com', 'Vadodara', 30, 'Hetal Shah'],
    ['Sunrise Electricals', '07', 'AFXPS2290L', 'Maintenance', 'sunriseelec.delhi@gmail.com', 'New Delhi', 30, 'Amit Khanna'],
    ['Annapurna Polymers Pvt Ltd', '36', 'AAGCA6604R', 'Raw material', 'finance@annapurnapolymers.com', 'Hyderabad', 60, 'Srinivas Reddy'],
    ['Vardhman Corrugators', '03', 'AAKFV1187E', 'Packaging', 'accounts@vardhmancorr.in', 'Ludhiana', 30, 'Gurpreet Singh'],
    ['Deccan Freight Carriers', '27', 'AAECD4471H', 'Freight', 'billing@deccanfreight.in', 'Mumbai', 15, 'Imran Shaikh'],
    ['Ganesh Fasteners', '33', 'AEHPG9932N', 'Components', 'ganeshfasteners.cbe@gmail.com', 'Coimbatore', 45, 'K. Murugan'],
    ['Pioneer Office Supplies', '29', 'AAOFP2208C', 'Office', 'orders@pioneeroffice.in', 'Bengaluru', 30, 'Deepa Rao'],
    ['Hindustan Lubricants Co.', '19', 'AABFH5531G', 'Consumables', 'accounts@hindlube.co.in', 'Kolkata', 30, 'Sourav Banerjee'],
    ['Rathi Industrial Gases', '08', 'AAHFR7742J', 'Consumables', 'billing@rathigases.com', 'Jaipur', 30, 'Manish Rathi'],
    ['Mehta Print Solutions', '27', 'AJKPM6618B', 'Office', 'mehtaprint.pune@gmail.com', 'Pune', 7, 'Nilesh Mehta'],
    ['BlueLine IT Services Pvt Ltd', '29', 'AAICB3390F', 'Software', 'billing@bluelineit.com', 'Bengaluru', 30, 'Arjun Nair'],
    ['Precision Tooling Works', '27', 'AAJFP4410K', 'Components', 'ptw.accounts@gmail.com', 'Nashik', 45, 'Sanjay Kulkarni'],
    ['Kerala Rubber Moulders', '32', 'AAFCK8823A', 'Components', 'accounts@keralarubber.in', 'Kochi', 30, 'Joseph Mathew']
  ];
  const vendors = vendorSeed.map((v, i) => ({
    id: 'V' + String(101 + i),
    name: v[0], state: v[1], stateName: STATES[v[1]], gstin: makeGstin(v[1], v[2], '1'),
    category: v[3], email: v[4], city: v[5], terms: v[6], contact: v[7],
    since: 2019 + (i % 6)
  }));
  // One vendor sends a corrupted GSTIN on invoices (typo: last char wrong)
  const badGstinVendor = vendors[4];
  const badGstin = badGstinVendor.gstin.slice(0, 14) + (badGstinVendor.gstin[14] === 'A' ? 'B' : 'A');

  // ---------- items ----------
  const catalog = {
    'Packaging': [['5-ply corrugated box 600×400×400', 'pcs', 48, 4819, 18], ['Stretch film 23 micron', 'roll', 520, 3920, 18], ['VCI bags 12×18"', 'pcs', 6.5, 3923, 18]],
    'Raw material': [['MS round bar EN8 Ø32 mm', 'kg', 68.5, 7214, 18], ['HR sheet IS2062 3 mm', 'kg', 61.2, 7208, 18], ['PP granules H110MA', 'kg', 112, 3902, 18]],
    'Freight': [['FTL Pune → Chennai, 9 MT', 'trip', 38500, 9965, 12], ['Part load Bhosari → Chakan', 'trip', 4200, 9965, 12], ['Loading / unloading charges', 'lot', 1800, 9967, 18]],
    'Consumables': [['Coolant concentrate (20 L)', 'can', 4650, 3403, 18], ['Industrial oxygen cylinder', 'cyl', 380, 2804, 18], ['Hydraulic oil ISO VG 68', 'ltr', 182, 2710, 18]],
    'Maintenance': [['VFD repair – 15 kW', 'job', 18500, 9987, 18], ['Panel wiring & testing', 'job', 12400, 9987, 18]],
    'Components': [['Hex bolt M12×60 Gr 8.8', 'pcs', 9.4, 7318, 18], ['Bearing 6205 ZZ', 'pcs', 142, 8482, 18], ['O-ring NBR 40×3', 'pcs', 6.2, 4016, 18]],
    'Office': [['A4 copier paper 75 gsm', 'ream', 268, 4802, 12], ['Toner cartridge 88A', 'pcs', 2450, 8443, 18], ['Job cards printing (1000)', 'lot', 3600, 4911, 12]],
    'Software': [['Annual AMC – server & network', 'yr', 96000, 9983, 18], ['Microsoft 365 Business Std', 'user', 9840, 9973, 18]]
  };

  // ---------- purchase orders ----------
  const poSources = ['Google Sheets', 'Excel (OneDrive)', 'Tally Prime'];
  const pos = [];
  let poNum = 2418;

  // ---------- invoices ----------
  const STATUS = {
    received: { label: 'Received', tone: 'gray' },
    extracting: { label: 'Extracting', tone: 'blue' },
    review: { label: 'Needs review', tone: 'amber' },
    exception: { label: 'Exception', tone: 'red' },
    duplicate: { label: 'Duplicate', tone: 'purple' },
    posted: { label: 'Bill posted', tone: 'indigo' },
    scheduled: { label: 'Payment scheduled', tone: 'teal' },
    paid: { label: 'Paid', tone: 'green' }
  };

  const EXC = {
    price: 'Unit price differs from PO',
    qty: 'Billed quantity exceeds GRN',
    nopo: 'No matching purchase order',
    gstin: 'GSTIN failed validation',
    tax: 'GST rate differs from PO',
    dup: 'Possible duplicate invoice'
  };

  const invoices = [];
  let seq = 0;

  function invNumberFor(v, n) {
    const fmts = [
      () => 'SBP/' + '26-27/' + String(n).padStart(4, '0'),
      () => 'KST-' + String(n + 1200),
      () => 'OSL/PUN/' + String(n + 880),
      () => 'NC/26-27/' + String(n + 310),
      () => 'SE-' + String(n + 4400),
      () => 'APPL/INV/' + String(n + 7000),
      () => 'VC/' + String(n + 1500) + '/26-27',
      () => 'DFC' + String(n + 22000),
      () => 'GF/' + String(n + 610),
      () => 'POS-' + String(n + 9100),
      () => 'HLC/K/' + String(n + 330),
      () => 'RIG/' + String(n + 2700),
      () => 'MPS-' + String(n + 140),
      () => 'BLIT/2026/' + String(n + 560),
      () => 'PTW/' + String(n + 1180),
      () => 'KRM-' + String(n + 3050)
    ];
    return fmts[vendors.indexOf(v)]();
  }

  function buildLines(v, scale) {
    const opts = catalog[v.category];
    const count = v.category === 'Freight' || v.category === 'Software' || v.category === 'Maintenance' ? between(1, 2) : between(1, 3);
    const used = new Set();
    const lines = [];
    for (let i = 0; i < count; i++) {
      let it = pick(opts);
      if (used.has(it[0])) continue;
      used.add(it[0]);
      let qty;
      if (it[2] > 10000) qty = between(1, 2);
      else if (it[2] > 1000) qty = between(2, 12);
      else if (it[2] > 100) qty = between(10, 120) * 5;
      else qty = between(40, 400) * 10;
      qty = Math.max(1, Math.round(qty * (scale || 1)));
      lines.push({ desc: it[0], unit: it[1], rate: it[2], hsn: it[3], gst: it[4], qty: qty });
    }
    return lines;
  }

  function totals(lines, intra) {
    let taxable = 0, tax = 0;
    lines.forEach((l) => { const a = l.qty * l.rate; taxable += a; tax += a * l.gst / 100; });
    taxable = Math.round(taxable * 100) / 100;
    tax = Math.round(tax * 100) / 100;
    const total = Math.round(taxable + tax);
    return { taxable, tax, cgst: intra ? tax / 2 : 0, sgst: intra ? tax / 2 : 0, igst: intra ? 0 : tax, total, roundOff: Math.round((total - taxable - tax) * 100) / 100 };
  }

  function addInvoice(opts) {
    const v = opts.vendor;
    seq++;
    const received = opts.received || daysAgo(opts.ago || 0);
    const invDate = opts.invDate || addDays(received, -between(0, 3));
    const lines = opts.lines || buildLines(v);
    const intra = v.state === '27';
    const t = totals(lines, intra);

    // create matching PO (unless no PO)
    let po = null;
    if (opts.exception !== 'nopo') {
      const poLines = lines.map((l, li) => {
        const pl = Object.assign({}, l);
        if (opts.exception === 'price' && li === 0) pl.rate = Math.round(l.rate * 0.94 * 10) / 10;
        if (opts.exception === 'tax') pl.gst = 12;
        return pl;
      });
      const poT = totals(poLines, intra);
      po = {
        id: 'PO-' + (poNum++),
        vendorId: v.id,
        date: addDays(invDate, -between(6, 25)),
        lines: poLines,
        amount: poT.total,
        source: pick(poSources),
        raisedBy: pick(['Kiran Deshmukh', 'Vikram Joshi', 'Pooja Iyer']),
        grn: opts.exception === 'qty'
          ? poLines.map((l) => Math.round(l.qty * 0.8))
          : poLines.map((l) => l.qty)
      };
      if (opts.exception === 'qty') {
        lines.forEach((l) => { /* invoice bills full PO qty but GRN short */ });
      }
      pos.push(po);
    }

    const id = 'INV-' + String(10480 + seq);
    const st = opts.status;
    const due = addDays(invDate, v.terms);
    const inv = {
      id,
      number: opts.number || invNumberFor(v, between(10, 980)),
      vendorId: v.id,
      gstin: opts.exception === 'gstin' ? badGstin : v.gstin,
      invDate, received, due,
      lines, intra,
      taxable: t.taxable, cgst: t.cgst, sgst: t.sgst, igst: t.igst, tax: t.tax, total: t.total, roundOff: t.roundOff,
      poId: po ? po.id : null,
      status: st,
      exception: opts.exception || null,
      confidence: opts.confidence || (93 + R() * 6.6),
      file: (opts.number || 'invoice').replace(/[\/ ]/g, '_') + '.pdf',
      subject: opts.subject,
      pages: between(1, 2),
      bill: null, payment: null,
      assignee: opts.exception ? pick(['Neha Kulkarni', 'Rahul Menon']) : null,
      events: []
    };
    if (!opts.number) inv.file = inv.number.replace(/[\/ ]/g, '_') + '.pdf';
    if (['posted', 'scheduled', 'paid'].includes(st)) {
      inv.bill = { ref: (company.books === 'Tally Prime' ? 'TLY-PUR-' : 'ZB-BILL-') + String(5300 + seq), at: addDays(received, 0) };
    }
    if (st === 'scheduled' || st === 'paid') {
      inv.payment = { date: due, mode: inv.total > 200000 ? 'RTGS' : 'NEFT', bank: 'HDFC Bank ••4471' };
    }
    if (st === 'paid') {
      inv.payment.paidOn = new Date(Math.min(+addDays(due, -between(0, 3)), +daysAgo(between(0, 1), between(9, 11))));
      if (inv.payment.paidOn > TODAY) inv.payment.paidOn = daysAgo(1, 11);
      inv.payment.date = inv.payment.paidOn;
      inv.payment.utr = 'HDFCR5' + String(between(20000000, 99999999)) + String(between(10, 99));
    }
    // event trail
    const ev = inv.events;
    const r = new Date(received);
    ev.push({ at: r, kind: 'mail', text: 'Email received from ' + v.email });
    ev.push({ at: new Date(+r + 38000), kind: 'ai', text: 'Extracted 14 fields from ' + inv.file + ' (' + inv.pages + ' page' + (inv.pages > 1 ? 's' : '') + ')' });
    if (st !== 'extracting' && st !== 'received') {
      ev.push({ at: new Date(+r + 41000), kind: inv.exception === 'gstin' ? 'warn' : 'ok', text: inv.exception === 'gstin' ? 'GSTIN checksum mismatch — ' + inv.gstin : 'GSTIN ' + inv.gstin + ' verified · Active' });
      if (inv.exception === 'dup') ev.push({ at: new Date(+r + 43000), kind: 'warn', text: 'Matches invoice number already posted last month' });
      else ev.push({ at: new Date(+r + 43000), kind: 'ok', text: 'No duplicate found across 2,914 invoices' });
      if (po) ev.push({ at: new Date(+r + 47000), kind: inv.exception && inv.exception !== 'gstin' && inv.exception !== 'dup' ? 'warn' : 'ok', text: inv.exception && EXC[inv.exception] && inv.exception !== 'gstin' && inv.exception !== 'dup' ? '3-way match failed: ' + EXC[inv.exception] + ' (' + po.id + ')' : '3-way match passed against ' + po.id + ' and GRN' });
      else ev.push({ at: new Date(+r + 47000), kind: 'warn', text: 'No open PO found for vendor in Google Sheets / Tally' });
    }
    if (inv.exception) ev.push({ at: new Date(+r + 52000), kind: 'slack', text: 'Sent to #ap-exceptions on Slack, assigned to ' + inv.assignee });
    if (opts.resolved) {
      inv.resolved = { type: opts.resolved, by: pick(['Neha Kulkarni', 'Rahul Menon', 'Anita Sharma']), at: new Date(+r + between(1, 5) * 3600000) };
      const mi = ev.findIndex((e) => e.text.indexOf('3-way match passed') === 0);
      if (mi > -1) ev.splice(mi, 1);
      ev.push({ at: new Date(+r + 47000), kind: 'warn', text: '3-way match failed: ' + EXC[opts.resolved] + ' (' + inv.poId + ')' });
      ev.push({ at: new Date(+r + 52000), kind: 'slack', text: 'Sent to #ap-exceptions on Slack' });
      ev.push({ at: inv.resolved.at, kind: 'ok', text: 'Exception resolved by ' + inv.resolved.by + ' — approved with note' });
    }
    if (inv.bill) ev.push({ at: opts.resolved ? new Date(+inv.resolved.at + 9000) : new Date(+r + 61000), kind: 'book', text: 'Purchase voucher ' + inv.bill.ref + ' created in ' + company.books });
    if (inv.payment) ev.push({ at: new Date(+r + 64000), kind: 'pay', text: 'Payment scheduled for ' + inv.payment.date.toDateString().slice(4) + ' via ' + inv.payment.mode });
    if (st === 'paid') ev.push({ at: inv.payment.paidOn, kind: 'ok', text: 'Bank confirmed UTR ' + inv.payment.utr + ' · marked paid' });

    invoices.push(inv);
    return inv;
  }

  // Hand-tuned recent invoices (the "live" part of the inbox)
  const V = (n) => vendors.find((v) => v.name.startsWith(n));
  addInvoice({ vendor: V('Om Sai'), ago: 0, received: minsAgo(3), status: 'extracting', subject: 'Invoice OSL/PUN/1142 - Part load Bhosari to Chakan', number: 'OSL/PUN/1142' });
  addInvoice({ vendor: V('Kaveri'), ago: 0, received: minsAgo(38), status: 'exception', exception: 'price', subject: 'Tax Invoice KST-1987 against your PO', number: 'KST-1987', confidence: 97.2, lines: [{ desc: 'MS round bar EN8 Ø32 mm', unit: 'kg', rate: 68.5, hsn: 7214, gst: 18, qty: 4200 }, { desc: 'HR sheet IS2062 3 mm', unit: 'kg', rate: 61.2, hsn: 7208, gst: 18, qty: 1850 }] });
  addInvoice({ vendor: V('Shree Balaji'), ago: 0, received: minsAgo(54), status: 'posted', subject: 'Invoice SBP/26-27/0612 | Shree Balaji Packaging', number: 'SBP/26-27/0612' });
  addInvoice({ vendor: V('Sunrise'), ago: 0, received: minsAgo(81), status: 'exception', exception: 'gstin', subject: 'Bill for VFD repair work', number: 'SE-4871', confidence: 88.4 });
  addInvoice({ vendor: V('Nirmal'), ago: 0, received: minsAgo(106), status: 'review', subject: 'NC/26-27/544 coolant supply', number: 'NC/26-27/544', confidence: 81.6 });
  addInvoice({ vendor: V('Deccan'), ago: 1, received: daysAgo(1, 18, 22), status: 'scheduled', subject: 'Freight bill DFC22417 – Oct consignments', number: 'DFC22417' });
  addInvoice({ vendor: V('Annapurna'), ago: 1, received: daysAgo(1, 16, 8), status: 'exception', exception: 'qty', subject: 'Invoice APPL/INV/7411 – PP granules', number: 'APPL/INV/7411', confidence: 96.1 });
  const mpsLines = [{ desc: 'Job cards printing (1000)', unit: 'lot', rate: 3600, hsn: 4911, gst: 12, qty: 6 }, { desc: 'A4 copier paper 75 gsm', unit: 'ream', rate: 268, hsn: 4802, gst: 12, qty: 40 }];
  addInvoice({ vendor: V('Mehta'), ago: 1, received: daysAgo(1, 15, 2), status: 'duplicate', exception: 'dup', subject: 'Fwd: Job cards printing invoice', number: 'MPS-228', confidence: 95.0, lines: mpsLines.map((l) => Object.assign({}, l)) });
  addInvoice({ vendor: V('BlueLine'), ago: 1, received: daysAgo(1, 12, 55), status: 'scheduled', subject: 'BlueLine IT – AMC invoice Q3', number: 'BLIT/2026/918' });
  addInvoice({ vendor: V('Ganesh'), ago: 1, received: daysAgo(1, 11, 14), status: 'posted', subject: 'Invoice GF/1204 dispatch details', number: 'GF/1204' });
  addInvoice({ vendor: V('Precision Tooling'), ago: 2, received: daysAgo(2, 17, 40), status: 'exception', exception: 'nopo', subject: 'Regrinding charges – PTW/1512', number: 'PTW/1512', confidence: 94.3 });
  addInvoice({ vendor: V('Rathi'), ago: 2, received: daysAgo(2, 14, 21), status: 'paid', subject: 'Gas cylinder refill invoice RIG/3318', number: 'RIG/3318' });
  addInvoice({ vendor: V('Hindustan'), ago: 2, received: daysAgo(2, 11, 3), status: 'exception', exception: 'tax', subject: 'HLC/K/702 Hydraulic oil', number: 'HLC/K/702', confidence: 98.0 });

  // The original that the duplicate above collides with
  addInvoice({ vendor: V('Mehta'), ago: 33, status: 'paid', number: 'MPS-228', subject: 'Job cards printing invoice', lines: mpsLines.map((l) => Object.assign({}, l)) });

  // Older history — realistic daily volume (weekdays heavier, Sundays light)
  for (let d = 2; d <= 45; d++) {
    const dow = daysAgo(d, 12, 0).getDay();
    const n = dow === 0 ? between(0, 2) : dow === 6 ? between(5, 9) : between(16, 26);
    for (let k = 0; k < n; k++) {
      const v = pick(vendors);
      const recv = daysAgo(d);
      const invDate = addDays(recv, -between(0, 3));
      const dueDate = addDays(invDate, v.terms);
      let st;
      if (dueDate < TODAY) st = R() < 0.992 ? 'paid' : 'scheduled';
      else if (d <= 3) st = R() < 0.5 ? 'posted' : 'scheduled';
      else st = R() < 0.12 ? 'posted' : 'scheduled';
      if (R() < 0.04 && dueDate < TODAY) st = 'paid';
      addInvoice({ vendor: v, received: recv, invDate: invDate, status: st, resolved: R() < 0.088 ? pick(['price', 'price', 'qty', 'tax', 'price']) : null });
    }
  }

  invoices.sort((a, b) => b.received - a.received);

  // Fill out PO list with some open POs not yet billed
  for (let i = 0; i < 7; i++) {
    const v = pick(vendors);
    const lines = buildLines(v);
    const t = totals(lines, v.state === '27');
    pos.push({ id: 'PO-' + (poNum++), vendorId: v.id, date: daysAgo(between(1, 12)), lines, amount: t.total, source: pick(poSources), raisedBy: pick(['Kiran Deshmukh', 'Vikram Joshi', 'Pooja Iyer']), grn: lines.map(() => 0), open: true });
  }
  pos.sort((a, b) => b.date - a.date);

  // ---------- emails (inbox) ----------
  const emails = invoices.slice(0, 22).map((inv) => {
    const v = vendors.find((x) => x.id === inv.vendorId);
    return {
      id: 'M' + inv.id.slice(4),
      invId: inv.id,
      from: v.contact, fromEmail: v.email, vendor: v.name,
      subject: inv.subject || ('Invoice ' + inv.number + ' from ' + v.name),
      at: inv.received,
      file: inv.file,
      size: (between(84, 620)) + ' KB',
      body: emailBody(v, inv)
    };
  });
  // a couple of non-invoice emails that were ignored by the classifier
  emails.splice(3, 0, { id: 'M-x1', from: 'Tally Solutions', fromEmail: 'newsletter@tallysolutions.com', vendor: null, subject: 'What’s new in TallyPrime 6.1 – e-invoicing improvements', at: minsAgo(66), file: null, ignored: 'Newsletter · no invoice attachment', body: 'Hello,\n\nCatch up on the latest features in TallyPrime…' });
  emails.splice(9, 0, { id: 'M-x2', from: 'Kaveri Steel Traders', fromEmail: 'billing@kaveristeel.in', vendor: 'Kaveri Steel Traders', subject: 'Statement of account – October 2026', at: daysAgo(1, 13, 40), file: 'SOA_Oct26.xlsx', size: '38 KB', ignored: 'Vendor statement · filed to Vendor › Kaveri Steel', body: 'Dear Sir,\n\nPlease find attached statement of account for October 2026. Kindly arrange payment of outstanding bills.\n\nRegards,\nSuresh Gowda' });

  function emailBody(v, inv) {
    const hi = pick(['Dear Sir/Madam,', 'Hello Team,', 'Dear Accounts Team,', 'Hi,']);
    const lines = [
      'Please find attached our tax invoice no. ' + inv.number + ' dated ' + fmtDate(inv.invDate) + (inv.poId ? ' against your PO ' + inv.poId + '.' : '.'),
      'Kindly process the payment as per agreed terms of ' + v.terms + ' days.',
      'Bank details are mentioned on the invoice. Please share the UTR once payment is released.'
    ];
    return hi + '\n\n' + lines.join('\n') + '\n\nThanks & regards,\n' + v.contact + '\n' + v.name + '\n' + v.city;
  }

  function fmtDate(d) {
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  // ---------- bank feed ----------
  const bankFeed = invoices.filter((i) => i.status === 'paid').slice(0, 12).map((i) => {
    const v = vendors.find((x) => x.id === i.vendorId);
    return { at: i.payment.paidOn, utr: i.payment.utr, desc: i.payment.mode + ' DR ' + v.name.toUpperCase().slice(0, 22), amount: i.total, invId: i.id };
  });

  // ---------- team ----------
  const team = [
    { name: 'Neha Kulkarni', role: 'AP Lead', email: 'neha@arvindprecision.in', initials: 'NK', color: '#7c3aed' },
    { name: 'Rahul Menon', role: 'Accountant', email: 'rahul@arvindprecision.in', initials: 'RM', color: '#0891b2' },
    { name: 'Vikram Joshi', role: 'Purchase Manager', email: 'vikram@arvindprecision.in', initials: 'VJ', color: '#ea580c' },
    { name: 'Anita Sharma', role: 'Finance Controller (Approver)', email: 'anita@arvindprecision.in', initials: 'AS', color: '#16a34a' }
  ];

  window.LL = {
    company, vendors, invoices, pos, emails, bankFeed, team, STATUS, EXC, STATES,
    validateGstin, makeGstin, gstinChecksum, TODAY, fmtDate, addDays
  };
})();
