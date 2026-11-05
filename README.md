# Ledgerloop — Invoice Inbox Processor (static site)

A static, no-backend website for an accounts-payable automation product. It is built to look and behave like a live SaaS:
vendor invoices arrive from Gmail, get extracted, are checked for a valid GSTIN and duplicates, matched to POs/GRNs,
posted to Tally / Zoho Books, routed to Slack when they don't match, scheduled for payment and reconciled against the bank.

## Pages

| File | What it is |
| --- | --- |
| `index.html` | Marketing site: animated live pipeline, feature demos, integrations, ROI calculator, volume-based pricing, FAQ, demo booking |
| `login.html` | Sign-in / free-trial sign-up (any credentials work) |
| `app.html` | The product workspace (single-page app, hash routing) |
| `changelog.html` | Product changelog |

### Workspace (`app.html`)
- **Overview** – KPIs, 14-day volume chart, pipeline funnel, live activity feed, exceptions and upcoming payments
- **Inbox** – Gmail-style list with the processing trace for each email; non-invoice mail is filtered out
- **Invoices** – searchable, sortable, paginated table with bulk actions and CSV export
- **Invoice drawer** – rendered tax invoice with field highlighting, confidence scores, GSTIN checks, 3-way match, Tally ledger entry, payment, activity log, notes and inline corrections
- **Exceptions** – price/qty/tax variances, missing PO, invalid GSTIN, duplicates; approve, reject, email the vendor or reply in the Slack thread
- **Payments** – weekly payment run with TDS, approval and a downloadable bank bulk-upload file; bank feed reconciliation
- **Purchase orders, Vendors, Integrations, Rules & settings** (including a working GSTIN validator)
- Ctrl/⌘ K command palette, notifications, keyboard shortcuts, drag-and-drop invoice upload
- New invoices arrive every minute or so while the app is open

## How it works
- All data is generated in `assets/js/data.js` from a fixed seed, dated relative to today, so the workspace always looks current. GSTINs use the real GST checksum.
- Changes you make (approvals, payments, uploads, settings) are saved in `localStorage`. **Rules & settings → Reset workspace** clears them.
- There's no build step. Open `index.html`, or serve the folder:

```bash
python3 -m http.server 8000
```
