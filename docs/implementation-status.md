# Implementation status — 2026-09-23

## Delivered in this iteration

- Self-service onboarding: authenticated owners can create a trial tenant, choose a commercial plan and slug, create the initial unit, owner professional, service and weekly schedule without master-panel intervention. Provisioning is atomic, idempotent and tenant-scoped.
- Validation pipeline: ESLint and JavaScript/TypeScript compiler scripts are now explicit; production builds no longer suppress lint or type errors through Next.js configuration.
- Billing safety: removed the hard-coded fallback PIX recipient. When Asaas is unavailable, the UI now reports that online billing is not configured instead of generating an untracked payment.
- WhatsApp: fixed the year rollover mutation used when interpreting customer dates and aligned interactive-message branding with RupControl.

- Inventory: per-unit product catalog; SKU, supplier, category, cost, price, minimum quantity, active state and product commission rate.
- Audited stock entry, exit, loss and counted-balance adjustment. Negative quantities and unauthorized tenant access are rejected. Requests use idempotency keys.
- Atomic product sale with stock deduction and existing quick-sales financial records. Cancellation restores stock exactly once. Original cost, price and commission percentage are retained.
- Financial accounts: manual income/expense entries, due dates, categories, counterparty, payment settlement, cancellation with reason and immutable history of original payment.
- Financial summary combines existing appointment/product/quick-sale receipts and manual entries without creating duplicate sale entries. Filters by unit and receipt/payment period. Outstanding totals include all due dates.
- Financial account list uses due dates and exports the displayed results as CSV (up to 200 records).
- Inventory and finance access is restricted to owners or authorized managers/reception. Permissions are available when creating staff accounts.

- Order tabs: appointment-linked or walk-in, service/product items, original price and commission snapshots, split payments, client pending balance, atomic stock deduction, audited cancellation and stock return. Duplicate checkout through the old appointment flow is blocked.
- Reports label individual payment records as receipts; split payments are not presented as separate sale counts.

## Validation

All fixtures run inside a transaction and roll back. No real customer bookings or financial transactions are created by these tests.

- `tests/database-regression.sql`: 27 assertions.
- `tests/inventory-regression.sql`: 24 assertions.
- `tests/finance-regression.sql`: 19 assertions.
- `tests/orders-regression.sql`: 30 assertions.
- `tests/app-flows-regression.sql`: 40 assertions — public multi-service booking, service editing/deactivation, quick-sale cart, client account settlement, appointment status flow, weekly schedule and owner sale corrections (140 total across five suites).
- `tests/onboarding-regression.sql`: 10 assertions — atomic provisioning, idempotency, slug collision and cross-tenant isolation.
- 2026-09-30: all 140 assertions pass against a schema-only copy of production (no customer data). The four original suites were updated for the `auto_link_new_service_to_barbers` trigger, which now creates barber/service links automatically.
- Next.js production build succeeds after merging current upstream WhatsApp and agenda changes.
- Authenticated UI workflows and real mobile-device verification remain outstanding; database tests and a successful build are not substitutes for those checks.

## Still outstanding

- Commission rules per professional/service and commission settlement. Product rate snapshots alone are not a complete commission module.
- Cash register opening/closing and reconciliation; recurring bills and installments.
- Comprehensive unit/report filters, client history access and reports beyond the delivered summaries.
- End-to-end authentication/recovery, role and mobile tests; accessibility review of modal focus handling.
- PWA installation/offline strategy, backup recovery exercises, monitoring and load/concurrency tests.
- Payment gateway and recurring billing integration require an actual provider configuration. Current recorded payments are manual confirmations.
- Instagram and WhatsApp integrations need their own live-provider validation; sending customer messages is outside these regression tests.

Do not treat this list as a claim that the full commercial SaaS scope is complete.

## Delivered 2026-10-02

- Commission report (`/dashboard/comissoes`) per professional and period: appointments, order items and quick sales; CSV/print. Public bookings now store the service commission (previously 0); quick-sale cart stores `commission_cents`.
- Cash register (`/dashboard/caixa`): open with starting change, withdrawals/deposits with reason, live totals by payment method, expected cash, close with counted amount and difference, history. One open register per unit; writes only through RPCs.
- Security step 1: username login via `staff_login_email()`; workspace queries no longer load owner/manager documents; master admin reads them via `admin_tenant_documents()`.
- Pending: apply `20261002140000_private_tenant_documents_step2.sql` once the step-1 frontend is live (removes anonymous read of `staff_logins` and member access to owner/manager documents).
- Validation: 180 assertions across eight SQL suites pass on a schema-only copy of production.
