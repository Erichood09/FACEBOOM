# FACEBOOM Live gifts and payments — implementation plan

## Scope

This work belongs on `feature/faceboom-live` and must not be merged into `main` or deployed to Firebase Hosting without the owner's explicit approval.

The feature supports:
- Free animated gifts during an active Live broadcast.
- Paid virtual gifts purchased by viewers.
- A creator earnings ledger and withdrawal requests.
- Country/currency-aware checkout methods exposed by the approved payment provider.

## Payment provider

Flutterwave is the initial provider candidate because the account owner is registering a Nigerian Starter Business account. Provider approval and country/payment-method availability must be confirmed before live transactions are enabled.

Do not promise every method in every country. At checkout, show only methods and currencies that Flutterwave confirms are enabled for the merchant and payer's country.

## Required architecture

1. The React/Vite client requests a checkout session from the authenticated FACEBOOM backend.
2. The backend validates the Firebase ID token, active account status, recipient eligibility, gift SKU, currency and server-owned price.
3. The backend creates a unique payment reference and pending order, then requests a hosted Flutterwave checkout URL using a server-side secret.
4. The client redirects to the hosted checkout. The browser return page is informational only; it never marks an order as paid.
5. A verified Flutterwave webhook is signature-checked and the transaction is independently verified with Flutterwave's server API. Amount, currency, reference, status and merchant account must match the pending order.
6. The backend processes each provider transaction idempotently and writes the payment, gift delivery and creator earnings ledger exactly once.
7. Creator withdrawals are separate requests, allowed only after required identity/KYC checks, available-balance checks, fraud/chargeback controls and explicit payout approval.

## Security requirements

- Never put Flutterwave secret keys in Vite variables, browser code, Firestore documents, or Git.
- Store provider secrets only as Cloudflare Worker secrets.
- Do not accept prices, creator shares, currency conversions, or payout destinations from client-supplied values.
- Never credit a creator from a browser redirect or an unverified webhook.
- Use immutable transaction records, idempotency keys, reconciliation, refunds/chargeback handling and audit events.
- Do not enable peer-to-peer cash transfers. This system is for virtual gifts and eligible creator withdrawals only.
- Keep live charging and payouts disabled until the Flutterwave account is approved, webhook verification is tested, and the owner explicitly authorizes live mode.

## Storage and balance model

Use a transactional server-side ledger (Cloudflare D1 or an equivalently transactional trusted store) as the financial source of truth. Firestore may mirror non-sensitive display state, but client writes must never create or modify money balances.

A creator's available balance is derived from verified gift earnings minus completed withdrawals, refunds, reversals, fees and applicable holds. A pending withdrawal is not a completed payout.

## Staged delivery

- Stage 1: Free gifts and Live gift presentation, with no payment dependency.
- Stage 2: Test-mode checkout, pending orders, webhook verification and idempotent ledger.
- Stage 3: Creator eligibility, payout requests and sandbox payout verification.
- Stage 4: Production readiness review; enable live collections/payouts only after provider approval and explicit owner approval.

## Current prerequisites

- Flutterwave Starter Business onboarding is pending support clarification for the Trading Name field.
- No Flutterwave secret key is configured in the Worker.
- No payment ledger database is provisioned.
- Therefore no real payment or payout endpoint is active, and no payment is being collected.


## Implementation status — 26 November 2026

- Stage 1 is implemented: free animated Live gifts are available without money or creator earnings.
- A test-only Flutterwave wallet foundation is under review in PR #7. It includes server-owned package pricing, hosted checkout, signed webhooks, server-side transaction verification, and an idempotent D1 coin ledger.
- The Wallet screen is present in the feature branch. It remains unavailable for purchases until the separate Worker, D1 database, Flutterwave test secrets, and an approved coin package are configured.
- No active package prices or coin quantities have been selected. Do not activate package rows until the owner confirms them.
- Paid gift delivery during Live, creator earnings, KYC, withdrawals, refunds, and chargeback handling are not yet implemented.
- Merchant onboarding is still pending Flutterwave support clarification for the locked Trading Name field. The support request reference recorded in the prior setup is FLW-617615. Do not submit the personal name as the FACEBOOM trading name or invent business registration details.
- Real-money collection and payouts remain disabled. This implementation is test-only and does not contain a live-payment switch.
