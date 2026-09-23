# Implementation status — 2026-09-23

## Delivered in this iteration

- Inventory: per-unit product catalog; SKU, supplier, category, cost, price, minimum quantity, active state and product commission rate.
- Audited stock entry, exit, loss and counted-balance adjustment. Negative quantities and unauthorized tenant access are rejected. Requests use idempotency keys.
- Atomic product sale with stock deduction and existing quick-sales financial records. Cancellation restores stock exactly once. Original cost, price and commission percentage are retained.
- Financial accounts: manual income/expense entries, due dates, categories, counterparty, payment settlement, cancellation with reason and immutable history of original payment.
- Financial summary combines existing appointment/product/quick-sale receipts and manual entries without creating duplicate sale entries. Filters by unit and receipt/payment period. Outstanding totals include all due dates.
- Financial account list uses due dates and exports the displayed results as CSV (up to 200 records).
- Inventory and finance access is restricted to owners or authorized managers/reception. Permissions are available when creating staff accounts.

## Validation

All fixtures run inside a transaction and roll back. No real customer bookings or financial transactions are created by these tests.

- `tests/database-regression.sql`: 27 assertions.
- `tests/inventory-regression.sql`: 24 assertions.
- `tests/finance-regression.sql`: 19 assertions.
- Next.js production build succeeds after merging current upstream WhatsApp and agenda changes.
- Authenticated UI workflows and real mobile-device verification remain outstanding; database tests and a successful build are not substitutes for those checks.

## Still outstanding

- Complete multi-item order tabs (services and products, split payments).
- Commission rules per professional/service and commission settlement. Product rate snapshots alone are not a complete commission module.
- Cash register opening/closing and reconciliation; recurring bills and installments.
- Comprehensive unit/report filters, client history access and reports beyond the delivered summaries.
- End-to-end authentication/recovery, role and mobile tests; accessibility review of modal focus handling.
- PWA installation/offline strategy, backup recovery exercises, monitoring and load/concurrency tests.
- Payment gateway and recurring billing integration require an actual provider configuration. Current recorded payments are manual confirmations.
- Instagram and WhatsApp integrations need their own live-provider validation; sending customer messages is outside these regression tests.

Do not treat this list as a claim that the full commercial SaaS scope is complete.
