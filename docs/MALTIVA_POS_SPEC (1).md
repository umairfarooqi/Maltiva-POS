# Maltiva Crust POS: Functional Spec, Data Model, APIs and Build Plan

Audience: the developer who will build or fix the system.
Primary use: takeaway-first fast-food counter (token based), with optional dine-in and delivery.
Hardware target: Intel i5 3rd gen, 8 GB RAM, SSD, 1280x720 touch screen, 80 mm thermal printer, cash drawer.

---

## 0. How a real takeaway POS works (read this first)

Examples worth studying for workflow (not to copy visually): Loyverse POS (offline-first, free tier), Square for Restaurants, Toast, and the counter screens at KFC and McDonald's. All of them share the same skeleton:

1. **Shift opens.** Cashier logs in with a PIN, enters the opening cash float, and the shift starts.
2. **Order entry.** Tap category, tap item, choose modifiers (size, extra cheese, make it a meal), repeat. The ticket on the right updates live.
3. **Payment.** Cash (with change calculation), card, or wallet. Split payment allowed. Exact-cash and quick-amount buttons.
4. **Token and print.** The system issues a token number (for example T-042). A customer receipt prints with the token. A KOT (kitchen order ticket) prints in the kitchen.
5. **Kitchen flow.** Order status moves: PLACED, PREPARING, READY, COLLECTED. The token appears on a customer display or is called out.
6. **Exceptions.** Void an item before payment, void or refund an order after payment (manager PIN required), apply a discount (limit by role).
7. **Shift closes.** Cashier counts the drawer. The system shows expected cash vs counted cash and prints the **Z-report**. Day is locked.
8. **Back office (admin and manager).** Menu and prices, staff, receipt details, reports, stock.

The business rule that matters most: **the server computes every price, tax, discount, cost and profit figure. The screen only displays them.**

---

## 1. Roles and permissions

| Capability | Cashier | Manager | Admin |
|---|---|---|---|
| Log in with PIN | yes | yes | yes |
| Open and close own shift | yes | yes | yes |
| Create orders, take payment, reprint receipt | yes | yes | yes |
| Apply discount up to cap (default 10%) | yes | yes | yes |
| Apply larger discount | no | yes (cap 30%) | yes |
| Void item before payment | yes | yes | yes |
| Void or refund paid order | no (needs manager PIN) | yes | yes |
| Cash pay-in, pay-out, drop | no | yes | yes |
| See own shift totals | yes | yes | yes |
| See all shifts, sales and Z-reports | no | yes | yes |
| See profit, cost price, margin | no | yes | yes |
| Edit menu, prices, modifiers, combos | no | optional toggle | yes |
| Manage stock, stock adjustments | no | yes | yes |
| Add, edit, deactivate staff and set roles | no | no | yes |
| Reset another user's PIN | no | no | yes |
| Edit store profile (name, phone, address, receipt footer, tax) | no | no | yes |
| Printer and device settings | no | no | yes |
| View audit log | no | yes (read) | yes |
| Backup and restore | no | no | yes |

Rules:
- Cashiers must never receive cost price or profit fields in any API response.
- Every sensitive action writes to `audit_log` with user id, action, entity, before and after values.
- At least one active admin must always exist (block deactivating the last admin).

---

## 2. Admin functionality (what the admin screen must contain)

### 2.1 Staff management
- List staff: name, role, status, last login.
- Add employee: name, username, role (cashier, manager, admin, kitchen), 4 to 6 digit PIN, optional password (admin and manager only).
- Edit employee: change role, deactivate or reactivate. Never hard delete (orders reference them).
- Reset PIN. Unlock locked account.
- Lock rule: 5 wrong PINs locks the account for 5 minutes.

### 2.2 Store profile and receipt settings (this is where the phone number lives)
Editable by admin, saved in the `settings` table, printed on every receipt:
- Store name, tagline
- **Phone number and WhatsApp number**
- Address
- Receipt footer text (for example "Thank you, visit again")
- Tax rate, tax mode (inclusive or exclusive), currency symbol
- Paper width (58 mm or 80 mm), auto print customer copy, auto print KOT
- Customer display greeting
- Business day cut-off hour (for example 04:00, so a 1 AM sale belongs to the previous business day)

### 2.3 Menu management
- Categories: add, rename, reorder (drag), hide.
- Products: name, category, selling price, **cost price**, image (small), availability toggle, track stock toggle, sort order.
- Modifier groups (for example "Size", "Extras") with options and price delta and cost delta. Attach groups to products. Rules: required or optional, min and max choices.
- Combos and meals: a combo is a product made of component slots (burger + fries + drink) with a fixed price and component costs for P&L.
- "Out of stock" quick toggle available to manager from the cashier screen.

### 2.4 Reports
- Sales by day, by cashier, by category, by item, by hour.
- Profit report: revenue, cost, gross profit, margin percent (item level and day level).
- Discounts given, voids and refunds, payment method split.
- Shift history and Z-reports (reprint).
- Export CSV.

### 2.5 System
- Backup now, scheduled backup, restore.
- Device settings: receipt printer, kitchen printer, cash drawer kick on cash payments.
- Audit log viewer.

---

## 3. Cashier functionality (main screen)

1. **Login:** PIN pad only. No keyboard.
2. **Open shift:** enter opening float. Blocked from selling until a shift is open.
3. **Order screen:**
   - Order type buttons: Takeaway (default), Dine-in, Delivery.
   - Category rail, item grid, ticket panel.
   - Tap item: adds quantity 1. If item has modifier groups, a bottom sheet opens with big buttons.
   - Ticket line: tap to edit quantity, add note, remove.
   - Customer name and phone are optional (required for Delivery).
   - Discount button (percent or amount, reason required above the cashier cap).
   - Hold order (park) and recall held orders.
4. **Pay screen:**
   - Quick buttons: Exact, 500, 1000, 2000, 5000 (configurable), Card, Wallet.
   - Split: add several payment lines until paid total equals total.
   - Shows change due in large text.
5. **After payment:** receipt and KOT print automatically, token shown big on screen, "New order" button.
6. **Order queue:** list of today's orders with status chips. Tap READY to mark COLLECTED. Reprint receipt.
7. **Cash drawer actions:** open drawer (logged), pay-out and pay-in need manager PIN.
8. **Close shift:** blind count (cashier types counted cash by denomination or total), system shows variance, prints Z-report.

---

## 4. Order lifecycle

```
DRAFT (client only) -> PLACED (paid, saved) -> PREPARING -> READY -> COLLECTED
                                  |
                                  +-> VOIDED (before collection, manager PIN)
                                  +-> REFUNDED (after collection, manager PIN)
```

Rules:
- An order exists on the server only when it is paid (PLACED). Drafts live in the client store and are persisted locally so a crash or reload does not lose the cart.
- Optional "pay later" mode for dine-in: order saved as OPEN, paid at the end.
- Status changes are append-only events in `order_events`.
- Token numbers reset every business day, are issued by the server, and never duplicate.

---

## 5. Calculation rules (single source of truth)

All money is stored as **integers in minor units** (paisa). Never use floats for money.

Order of operations:
1. `line_total = (unit_price + sum(modifier price deltas)) * qty`
2. `subtotal = sum(line_total)`
3. `discount` (percent or fixed), capped at subtotal, applied before tax.
4. `taxable = subtotal - discount`
5. Tax exclusive: `tax = round(taxable * rate_bps / 10000)`, `total = taxable + tax`
   Tax inclusive: `tax = round(taxable * rate_bps / (10000 + rate_bps))`, `total = taxable`
6. Discount is spread across lines proportionally (largest remainder method) so item-level profit stays correct.
7. `cost_total = sum((unit_cost + sum(modifier cost deltas)) * qty)`
8. **Profit = (taxable excluding tax) - cost_total.** Tax is never profit. Discounts reduce profit.
9. `margin_percent = profit / net_revenue * 100`
10. Cost and price are **snapshotted into `order_items`** at sale time so later price edits never change history.
11. Refund: reverse the same snapshot values, never recompute from current prices.

### Reference implementation

```ts
// src/shared/money.ts  (used by server; client may import it only for display preview)
export type Line = {
  unitPrice: number;       // minor units
  unitCost: number;
  qty: number;
  modPrice: number;        // sum of modifier price deltas
  modCost: number;
};

export type Totals = {
  subtotal: number; discount: number; tax: number; total: number;
  costTotal: number; netRevenue: number; profit: number; marginBp: number;
  lineDiscounts: number[];
};

export function computeTotals(
  lines: Line[],
  opts: { discountPct?: number; discountFixed?: number; taxBp: number; taxInclusive: boolean }
): Totals {
  const lineTotals = lines.map(l => (l.unitPrice + l.modPrice) * l.qty);
  const subtotal = lineTotals.reduce((a, b) => a + b, 0);

  let discount = opts.discountFixed ?? 0;
  if (opts.discountPct) discount = Math.round(subtotal * opts.discountPct / 100);
  discount = Math.min(Math.max(discount, 0), subtotal);

  const lineDiscounts = allocate(discount, lineTotals);
  const taxable = subtotal - discount;

  const tax = opts.taxInclusive
    ? Math.round(taxable * opts.taxBp / (10000 + opts.taxBp))
    : Math.round(taxable * opts.taxBp / 10000);
  const total = opts.taxInclusive ? taxable : taxable + tax;
  const netRevenue = opts.taxInclusive ? taxable - tax : taxable;

  const costTotal = lines.reduce((a, l) => a + (l.unitCost + l.modCost) * l.qty, 0);
  const profit = netRevenue - costTotal;
  const marginBp = netRevenue > 0 ? Math.round(profit * 10000 / netRevenue) : 0;

  return { subtotal, discount, tax, total, costTotal, netRevenue, profit, marginBp, lineDiscounts };
}

// Largest remainder allocation so parts always sum to the whole
function allocate(amount: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum === 0 || amount === 0) return weights.map(() => 0);
  const raw = weights.map(w => amount * w / sum);
  const base = raw.map(Math.floor);
  let left = amount - base.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, f: r - base[i] })).sort((a, b) => b.f - a.f);
  for (let k = 0; left > 0; k++, left--) base[order[k % order.length].i]++;
  return base;
}
```

Write unit tests for this file first. It is the heart of the system. Cases: zero discount, 100 percent discount, inclusive and exclusive tax, odd rounding (3 items at 333), refund reversal.

---

## 6. Database schema (SQLite, better-sqlite3)

Startup pragmas (mandatory):

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
PRAGMA temp_store = MEMORY;
```

```sql
CREATE TABLE branches (
  id TEXT PRIMARY KEY, name TEXT NOT NULL
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('admin','manager','cashier','kitchen')),
  pin_hash TEXT NOT NULL,            -- argon2 or scrypt, never plain text
  password_hash TEXT,                -- admin/manager only
  active INTEGER NOT NULL DEFAULT 1,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_by TEXT, updated_at TEXT
);
-- keys: store_name, tagline, phone, whatsapp, address, receipt_footer,
-- tax_bp, tax_inclusive, currency, paper_width, auto_print_receipt,
-- auto_print_kot, day_cutoff_hour, greeting, quick_cash_buttons

CREATE TABLE categories (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, icon TEXT,
  sort INTEGER NOT NULL DEFAULT 0, hidden INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE products (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES categories(id),
  name TEXT NOT NULL,
  price INTEGER NOT NULL CHECK (price >= 0),
  cost INTEGER NOT NULL DEFAULT 0 CHECK (cost >= 0),
  image TEXT,                         -- relative path to a 96px webp, not base64
  is_available INTEGER NOT NULL DEFAULT 1,
  is_combo INTEGER NOT NULL DEFAULT 0,
  track_stock INTEGER NOT NULL DEFAULT 0,
  stock_qty INTEGER NOT NULL DEFAULT 0,
  min_stock INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,                    -- soft delete
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_products_cat ON products(category_id, deleted_at);

CREATE TABLE modifier_groups (
  id TEXT PRIMARY KEY, name TEXT NOT NULL,
  required INTEGER NOT NULL DEFAULT 0,
  min_select INTEGER NOT NULL DEFAULT 0,
  max_select INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE modifiers (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES modifier_groups(id),
  name TEXT NOT NULL,
  price_delta INTEGER NOT NULL DEFAULT 0,
  cost_delta INTEGER NOT NULL DEFAULT 0,
  is_available INTEGER NOT NULL DEFAULT 1, sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE product_modifier_groups (
  product_id TEXT REFERENCES products(id),
  group_id TEXT REFERENCES modifier_groups(id),
  PRIMARY KEY (product_id, group_id)
);
CREATE TABLE combo_items (
  combo_id TEXT REFERENCES products(id),
  slot_name TEXT NOT NULL,            -- 'Main', 'Side', 'Drink'
  product_id TEXT REFERENCES products(id),
  qty INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE shifts (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL, terminal_id TEXT NOT NULL,
  cashier_id TEXT NOT NULL REFERENCES users(id),
  business_date TEXT NOT NULL,
  opened_at TEXT NOT NULL, closed_at TEXT,
  opening_float INTEGER NOT NULL,
  expected_cash INTEGER, counted_cash INTEGER, variance INTEGER,
  status TEXT NOT NULL CHECK (status IN ('open','closed'))
);
-- one open shift per terminal
CREATE UNIQUE INDEX idx_one_open_shift ON shifts(terminal_id) WHERE status = 'open';

CREATE TABLE cash_movements (
  id TEXT PRIMARY KEY,
  shift_id TEXT NOT NULL REFERENCES shifts(id),
  type TEXT NOT NULL CHECK (type IN ('pay_in','pay_out','drop')),
  amount INTEGER NOT NULL CHECK (amount > 0),
  reason TEXT NOT NULL, user_id TEXT NOT NULL, approved_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE counters (            -- per business day sequences
  business_date TEXT, name TEXT, value INTEGER NOT NULL,
  PRIMARY KEY (business_date, name)
);

CREATE TABLE orders (
  id TEXT PRIMARY KEY,                    -- uuid
  idempotency_key TEXT NOT NULL UNIQUE,   -- prevents double submit
  branch_id TEXT NOT NULL, terminal_id TEXT NOT NULL,
  shift_id TEXT NOT NULL REFERENCES shifts(id),
  business_date TEXT NOT NULL,
  order_no INTEGER NOT NULL,              -- per day
  token_no INTEGER NOT NULL,              -- per day
  order_type TEXT NOT NULL CHECK (order_type IN ('takeaway','dine_in','delivery')),
  status TEXT NOT NULL CHECK (status IN ('open','placed','preparing','ready','collected','voided','refunded')),
  customer_name TEXT, customer_phone TEXT, delivery_address TEXT,
  subtotal INTEGER NOT NULL, discount INTEGER NOT NULL DEFAULT 0, discount_reason TEXT,
  tax INTEGER NOT NULL, total INTEGER NOT NULL,
  cost_total INTEGER NOT NULL, profit INTEGER NOT NULL,
  paid_total INTEGER NOT NULL DEFAULT 0, change_due INTEGER NOT NULL DEFAULT 0,
  cashier_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (business_date, order_no), UNIQUE (business_date, token_no)
);
CREATE INDEX idx_orders_date ON orders(business_date, status);
CREATE INDEX idx_orders_shift ON orders(shift_id);

CREATE TABLE order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  name_snapshot TEXT NOT NULL, category_snapshot TEXT,
  unit_price INTEGER NOT NULL, unit_cost INTEGER NOT NULL,
  qty INTEGER NOT NULL CHECK (qty > 0),
  modifiers_json TEXT NOT NULL DEFAULT '[]',   -- snapshot with price and cost deltas
  line_total INTEGER NOT NULL, line_discount INTEGER NOT NULL DEFAULT 0, line_cost INTEGER NOT NULL,
  note TEXT,
  parent_item_id TEXT                          -- combo component rows
);
CREATE INDEX idx_items_order ON order_items(order_id);

CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  shift_id TEXT NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('cash','card','wallet')),
  amount INTEGER NOT NULL,           -- amount applied to the bill
  tendered INTEGER,                  -- cash handed over
  reference TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE order_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL, event TEXT NOT NULL, user_id TEXT, meta_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE stock_movements (
  id TEXT PRIMARY KEY, product_id TEXT NOT NULL,
  delta INTEGER NOT NULL, type TEXT NOT NULL CHECK (type IN ('sale','refund','purchase','adjust','waste')),
  ref TEXT, user_id TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE print_jobs (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK (kind IN ('receipt','kot','zreport')),
  order_id TEXT, payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','printed','failed')),
  attempts INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT, action TEXT NOT NULL, entity TEXT, entity_id TEXT,
  before_json TEXT, after_json TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sync_outbox (            -- phase 2: cloud sync
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity TEXT NOT NULL, entity_id TEXT NOT NULL, op TEXT NOT NULL,
  payload TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), synced_at TEXT
);
```

---

## 7. API contract

Conventions: JSON, `Authorization: Bearer <token>`, money in minor units, errors as `{ "error": { "code": "...", "message": "..." } }`. The role column shows the minimum role.

### Auth
| Method | Path | Role | Notes |
|---|---|---|---|
| POST | /api/auth/login | public | body `{ username, pin }`. Returns `{ token, user }` with no secrets. Rate limited and lockout. |
| POST | /api/auth/logout | any | |
| POST | /api/auth/approve | any | manager PIN check for overrides, returns short-lived approval token |

### Bootstrap and menu (read)
| Method | Path | Role | Notes |
|---|---|---|---|
| GET | /api/bootstrap | any | categories, products (no cost for cashier), modifiers, combos, public settings. Small payload. |
| GET | /api/menu/version | any | integer; client refetches menu only when it changes |

### Orders
| Method | Path | Role | Notes |
|---|---|---|---|
| POST | /api/orders | cashier | Create and pay in one transaction. Requires `Idempotency-Key`. Body: items (productId, qty, modifierIds, note), orderType, customer, discount, payments. Server recomputes everything. |
| GET | /api/orders?date=&status=&limit=&cursor= | cashier | today by default, paginated, no items |
| GET | /api/orders/:id | cashier | with items and payments |
| PATCH | /api/orders/:id/status | cashier | PREPARING, READY, COLLECTED |
| POST | /api/orders/:id/void | manager approval | reason required, restores stock |
| POST | /api/orders/:id/refund | manager approval | full or partial, uses snapshot values |
| POST | /api/orders/:id/reprint | cashier | creates print job |
| POST | /api/orders/hold | cashier | save draft server side (optional) |

### Shifts and cash
| Method | Path | Role | Notes |
|---|---|---|---|
| POST | /api/shifts/open | cashier | `{ terminalId, openingFloat }` |
| GET | /api/shifts/current | cashier | live totals for the open shift |
| POST | /api/shifts/close | cashier | `{ countedCash }` returns Z-report and queues print |
| POST | /api/cash-movements | manager | pay_in, pay_out, drop with reason |
| GET | /api/reports/z/:shiftId | manager | reprint |

### Admin: users
| Method | Path | Role |
|---|---|---|
| GET | /api/users | admin |
| POST | /api/users | admin |
| PUT | /api/users/:id | admin (role, name, active) |
| POST | /api/users/:id/reset-pin | admin |

### Admin: menu
| Method | Path | Role |
|---|---|---|
| POST / PUT / DELETE(soft) | /api/products, /api/products/:id | admin |
| PATCH | /api/products/:id/availability | manager |
| POST / PUT / DELETE | /api/categories | admin |
| CRUD | /api/modifier-groups, /api/modifiers, /api/combos | admin |

### Admin: settings
| Method | Path | Role | Notes |
|---|---|---|---|
| GET | /api/settings | any (public subset), admin (all) | |
| PUT | /api/settings | admin | whitelist of keys including phone, whatsapp, address, receipt_footer, tax |

### Reports (manager and admin)
`GET /api/reports/sales?from=&to=&groupBy=day|hour|cashier|category|item`
`GET /api/reports/profit?from=&to=` (manager and admin only)
`GET /api/reports/payments`, `GET /api/reports/voids`, `GET /api/reports/export.csv`

### System
`GET /api/health`, `POST /api/system/backup`, `POST /api/system/restore` (admin), `GET /api/audit` (manager read).

---

## 8. Order creation: reference transaction

```ts
// POST /api/orders
const createOrder = db.transaction((input: CreateOrderInput, user: AuthUser) => {
  // 1. Idempotency: return the existing order if this key was already processed
  const existing = db.prepare('SELECT id FROM orders WHERE idempotency_key = ?').get(input.key);
  if (existing) return loadOrder(existing.id);

  // 2. Require an open shift on this terminal
  const shift = db.prepare("SELECT * FROM shifts WHERE terminal_id = ? AND status = 'open'").get(input.terminalId);
  if (!shift) throw new AppError('NO_OPEN_SHIFT');

  // 3. Re-read prices and costs from the DB. Ignore any price sent by the client.
  const lines = input.items.map(it => {
    const p = getProduct.get(it.productId);                 // has price, cost, is_available
    if (!p || p.deleted_at || !p.is_available) throw new AppError('ITEM_UNAVAILABLE', p?.name);
    const mods = resolveModifiers(it.modifierIds, p.id);    // validates group rules
    return { p, mods, qty: it.qty, note: it.note,
      unitPrice: p.price, unitCost: p.cost,
      modPrice: sum(mods, 'price_delta'), modCost: sum(mods, 'cost_delta') };
  });

  // 4. Discount permission check against role cap (manager approval token if above cap)
  assertDiscountAllowed(input.discount, user, input.approvalToken);

  // 5. Totals from the shared function
  const s = getSettings();
  const t = computeTotals(lines, { ...input.discount, taxBp: s.tax_bp, taxInclusive: s.tax_inclusive });

  // 6. Payments must cover the total
  const paid = input.payments.reduce((a, p) => a + p.amount, 0);
  if (paid < t.total) throw new AppError('UNDERPAID');
  const cash = input.payments.filter(p => p.method === 'cash').reduce((a, p) => a + (p.tendered ?? p.amount), 0);
  const change = Math.max(0, cash - (t.total - input.payments.filter(p => p.method !== 'cash').reduce((a, p) => a + p.amount, 0)));

  // 7. Sequence numbers, allocated inside the same transaction
  const bd = businessDate(new Date(), s.day_cutoff_hour);
  const orderNo = nextCounter(bd, 'order');
  const tokenNo = nextCounter(bd, 'token');

  // 8. Insert order, items (with snapshots), payments, stock movements, events, print jobs
  // 9. Stock: decrement only when track_stock = 1; for combos decrement each component.
  //    Reject if it would go negative unless the setting allow_negative_stock is on.
  // 10. Queue print jobs (receipt + KOT) in print_jobs. Never print inside the transaction.
  return loadOrder(orderId);
});
```

```ts
// Counter helper, safe because it runs inside the same write transaction
function nextCounter(bd: string, name: string): number {
  db.prepare('INSERT OR IGNORE INTO counters (business_date, name, value) VALUES (?, ?, 0)').run(bd, name);
  db.prepare('UPDATE counters SET value = value + 1 WHERE business_date = ? AND name = ?').run(bd, name);
  return db.prepare('SELECT value FROM counters WHERE business_date = ? AND name = ?').get(bd, name).value;
}
```

---

## 9. Z-report contents

Printed and stored at shift close:
- Store name, terminal, cashier, business date, opened and closed time
- Order count, voids count and value, refunds count and value
- Gross sales, discounts, net sales, tax, total
- Payments split: cash, card, wallet
- Cash reconciliation: opening float + cash sales - cash refunds + pay-ins - pay-outs - drops = **expected cash**; counted cash; **variance**
- Top 5 items, sales by category
- (Manager copy only) cost, profit, margin percent
- Z number (running sequence). Closed shifts are immutable.

---

## 10. Printing

- ESC/POS over USB or network, 80 mm paper, 42 characters per line at font A.
- Print through a **queue** (`print_jobs`). A worker loops: take queued job, send to printer, mark printed or failed, retry 3 times. A printer failure must never block or fail the sale. Show a "reprint" action instead.
- Receipt: store name, tagline, address, **phone**, order no, **token (large)**, date, cashier, items with modifiers, discount, tax, total, payment, change, footer.
- KOT: token (very large), order type, time, items and modifiers in large text, notes. No prices.
- Cash drawer opens through the printer's RJ11 port using the ESC/POS kick command on cash payments.

---

## 11. 720p touch UI strategy (1280x720)

Layout, zero page scroll:

```
+--------------------------------------------------------------------------+
| Top bar 48px: logo | order type [Takeaway][Dine-in][Delivery] | cashier | clock |
+----------+-----------------------------------------+---------------------+
| Category | Item grid: 5 columns x 4 rows            | Ticket 340px        |
| rail     | tiles 120x96, name + price, big text     | lines (scroll only  |
| 128px    | pagination arrows, not scrolling         | inside this panel)  |
| vertical | (favourites page first)                  | Subtotal/Disc/Tax   |
| big      |                                          | TOTAL (32px bold)   |
| buttons  |                                          | [Hold][Discount]    |
+----------+-----------------------------------------+---------------------+
| Bottom action bar 72px: [Exact] [500] [1000] [Card] [PAY]  [Queue] [Menu]   |
+--------------------------------------------------------------------------+
```

Rules:
- Minimum touch target 56 px, spacing 8 px. Font sizes: item 16 px, price 14 px, total 32 px.
- Category switch must be one tap and render in under 100 ms (all products already in memory, filtered by category id).
- Modifiers open in a bottom sheet with large toggle buttons and a single "Add to order" button.
- No keyboard in the cashier flow: PIN pad, numeric pad for quantity and cash, preset notes ("No onion", "Extra spicy").
- Item images optional; if used, 96 px webp thumbnails (under 8 KB each). No base64 images in the database or in API payloads.
- High contrast, no animations longer than 150 ms, no blur or large shadows (cheap GPU on old machines).
- Admin screens may use a denser layout with keyboard, since they run on the same screen but are used rarely.

---

## 12. Performance and stability rules for an i5 3rd gen

1. **Deployment shape:** a local Node process (as a Windows service) + the browser in kiosk mode on the same PC. Do not host the production POS on Vercel: serverless has no persistent disk, so SQLite data would vanish and offline use would be impossible. Vercel is fine only for a demo or a future cloud dashboard.
2. Use Chrome or Edge in `--kiosk --app=http://localhost:3000`. Avoid heavy desktop wrappers unless needed. If a desktop wrapper is required, test Electron memory first (budget 400 MB total for the app).
3. Never load all orders. Load today's orders only, paginated. History belongs to reports.
4. Do not send products as one blob with images. Menu payload target under 100 KB. Use `menu/version` to refetch only when it changed.
5. Client state: one store (Zustand or useReducer) for the cart. Memoize the product tile component, key by product id, so adding an item re-renders the ticket only, not the 20 tiles.
6. Persist the draft cart to localStorage on every change (debounced 300 ms) and restore on reload.
7. Totals math is microseconds. A web worker is not needed for it. The UI blocks because of large payloads, full list re-renders, images, and synchronous work on the main thread. Fix those first.
8. SQLite: WAL mode, indexes from section 6, prepared statements created once at startup, short transactions, no `SELECT *` on big tables.
9. Daily automatic backup: copy the DB file using `VACUUM INTO 'backup-YYYYMMDD.db'` to a second folder (and optionally a USB drive). Keep 30 days.
10. Never commit `*.db`, `*.db-wal`, `*.db-shm`, `server-db.json`, `.env`. Add them to `.gitignore` and remove them from git history.
11. Add an error boundary and a global error logger writing to a rotating file. Add a watchdog that restarts the Node service on crash.
12. Run the app on Windows 10 64-bit (Windows 11 does not support 3rd gen Intel). Set power plan to "High performance", disable sleep, disable automatic restarts for updates during opening hours. Use a UPS or at least a surge protector: sudden power loss is the top cause of corrupted databases, and WAL mode plus `synchronous=NORMAL` is the safe middle ground.

---

## 13. Offline-first and future sync

- A single-store setup is already offline-first: the local server and local SQLite are the source of truth. No internet is needed to sell.
- Multi-terminal in one store: all terminals talk to the one local server over the LAN. Server issues order and token numbers, so there are no collisions.
- Cloud reporting (phase 2): write every change to `sync_outbox` inside the same transaction. A background worker pushes batches when internet exists and marks `synced_at`. The cloud only ever receives data, so there are no merge conflicts. Use order UUIDs and idempotency keys so retries are safe.
- Multi-branch menu and price changes pushed from the cloud (phase 3): versioned, applied at shift-closed time.

---

## 14. Security checklist

- Hash PINs and passwords (argon2id or scrypt). Never return them in any response.
- Session token (short-lived, signed). Every route checks role. Server derives the user from the token, never from the request body (do not trust `cashierId` or `cashierRole` sent by the client).
- Lockout after 5 failed attempts. Rate limit login.
- Bind the server to localhost for a single-PC setup. If other terminals need access, bind to the LAN only and require the token.
- Audit log on price edits, discounts, voids, refunds, staff changes, settings changes, cash movements.
- Validate every request body (zod). Reject unknown fields.

---

## 15. Build plan (order of work)

**Phase 0 (1 to 2 days): stop the bleeding**
1. Fix the known bugs in the current repo (see audit). Remove DB files from git. Add `.gitignore`.
2. Convert money to integers. Add `computeTotals` with unit tests.

**Phase 1 (week 1): correct core**
3. Auth with hashed PINs, tokens, role middleware.
4. Server-side order creation (section 8) with idempotency, counters, snapshots.
5. Shifts, cash reconciliation, Z-report.
6. Settings API with the full key list so the admin can edit phone, address, WhatsApp and tax.

**Phase 2 (week 2): cashier experience**
7. 720p layout (section 11), modifier sheet, quick-pay, split payment, hold and recall.
8. Print queue: receipt, KOT, Z-report, drawer kick.
9. Order queue screen with status flow.

**Phase 3 (week 3): admin and reports**
10. Staff management, menu and modifier management, combos.
11. Sales and profit reports, CSV export, audit viewer.
12. Backups, installer script, Windows service, kiosk launch.

**Phase 4: later**
13. Stock and recipes, customer display screen, cloud sync, multi-branch.

### Acceptance tests before go-live
- 200 orders entered in 30 minutes with no UI lag on the actual client machine.
- Pull the power cable mid-sale: after reboot, no corrupted data and no duplicate token.
- Double-tap "Pay": exactly one order exists.
- Change item cost price after a sale: yesterday's profit report is unchanged.
- Unplug the printer: sale still completes, job shows as failed, reprint works.
- Cashier account cannot read cost, profit, users list, or call admin routes (test with direct API calls).
- Z-report cash variance is zero when counted cash equals expected cash.

---

## 16. Addendum: decisions from the implementation review

These decisions override anything earlier in this document that conflicts with them.

### 16.1 Payments
- `payments.amount` is the amount applied to the bill. The applied amounts of all payment lines must sum exactly to `orders.total`.
- Only cash lines may be tendered above the remaining balance. A cash line stores `tendered`; change is `tendered - amount` and is stored once on the order as `change_due`.
- Card and wallet lines can never exceed the remaining balance.
- Reject an order if the applied sum differs from the total.

### 16.2 Statuses
- Replace the single `status` column with two columns.
  - `fulfilment_status`: placed, preparing, ready, collected, cancelled
  - `payment_status`: unpaid, paid, partially_refunded, refunded, voided
- Add `refunds (id, order_id, amount, reason, approved_by, created_at)` and `refund_lines (refund_id, order_item_id, qty, amount, stock_action)` where `stock_action` is `restock` or `waste`.
- Refund amounts use the original order item snapshots, never current prices.

### 16.3 Refund and stock
- Each refunded line carries an explicit choice: restock or waste.
- Default is waste for prepared food. Restock is offered only for items flagged `restockable` (sealed drinks, packaged goods) and needs manager confirmation.
- Waste writes a `stock_movements` row of type `waste`, and its cost is reported as a loss in P&L.
- Void before preparation restores stock. Void after preparation records waste.

### 16.4 Time and shifts
- `settings.timezone` (default `Asia/Karachi`) and `settings.day_cutoff_hour`.
- Store timestamps as UTC ISO strings. The server computes `business_date`; the client never does.
- A shift belongs to one cashier on one terminal.
- Interrupted shift recovery: if the same cashier logs in on a terminal with an open shift, resume it. If a different cashier logs in, a manager must either take over (with an audit entry) or force-close the shift with a counted cash amount. Shifts never auto-close.

### 16.5 Sale persistence and recovery
- The client shows **Saved** only after a 201 response from the server.
- If the server is unreachable (network error or timeout only), store the order in a durable pending outbox (IndexedDB) with its idempotency key. Show it as **PENDING** on screen and on the printed receipt. Replay automatically when the server returns.
- 4xx and 5xx responses are rejections, not offline conditions. Keep the cart, show the reason, require a decision.
- Replays are safe because `orders.idempotency_key` is unique.
- Bootstrap merges server history with the pending outbox and never replaces it.
- Wipe, restore and logout never delete pending orders.
- Add `GET /api/orders/pending-status` so the UI can show a persistent "N orders waiting to sync" badge.

### 16.6 Implementation order (one commit per phase, each with lifecycle tests)
1. Sale persistence and recovery (fix the stock log query, transaction, pending outbox, merge bootstrap).
2. Authoritative money, payments and permissions (computeTotals in integer paisa, server-derived prices and identity, hashed credentials, sessions, route guards, no secrets in bootstrap).
3. Shifts and cash reconciliation, Z-report.
4. Kitchen to pickup flow, void and refund with manager approval.
5. Printing queue and durable settings (phone, address, footer, tax).
6. Reports from snapshots only, SQLite backup and restore.

### 16.7 Required lifecycle tests (must pass before a phase is accepted)
- A valid sale returns 201, creates order, items, payments and stock movements, and a failed step leaves zero rows.
- The same idempotency key sent twice creates one order.
- A tampered price or total in the request is ignored and the stored values come from the database.
- A Rs.333 subtotal at 10 percent tax produces the same total in the cart, the server and the receipt.
- Profit never includes tax.
- Order and token numbers never repeat across 1000 sequential and 50 concurrent requests.
- A cashier token gets 403 on every admin and cost or profit route.
- Server stopped mid-session: the order lands in the pending outbox and syncs once, with no duplicate, after restart.
