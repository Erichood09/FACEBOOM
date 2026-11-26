# FACEBOOM Flutterwave payments (test mode)

This is a separate Worker. It does not modify the existing LiveKit token Worker.

## What it implements

- Firebase ID-token verification and active-account checks.
- Server-owned coin-package pricing from Cloudflare D1.
- Hosted Flutterwave Standard checkout links.
- A D1 payment-order table and an idempotent wallet coin ledger.
- Webhook signature checks using Flutterwave's `verif-hash` header.
- Server-side transaction verification before coins are credited.
- A return-page verification endpoint as a backup to webhook delivery.

The browser never supplies a price, currency, coin amount, or creator balance. Firestore is not used as the financial source of truth.

## Safety state

This Worker is deliberately test-only. It accepts only a Flutterwave secret key beginning with `FLWSECK_TEST-` and `FLW_MODE = "test"`. It has no live-payment mode. Real payments and creator payouts are not enabled by this implementation.

No package is active by default. Do not activate a package until FACEBOOM has chosen and approved its coin quantity, amount, and currency. Do not promise that a payment method is available in every country; Flutterwave controls available methods by merchant approval, payer country, and currency.

## Provisioning

1. Create a Cloudflare D1 database named `faceboom-payments`.
2. Copy `wrangler.toml.example` to `wrangler.toml` and replace the D1 database ID with the ID from Cloudflare.
3. Apply the schema with `npx wrangler d1 migrations apply faceboom-payments --remote`.
4. Add the Flutterwave **test** secret key as a Cloudflare Worker secret named `FLW_SECRET_KEY`.
5. Set a strong random webhook secret as a Cloudflare Worker secret named `FLW_WEBHOOK_SECRET`. Set the exact same value as the webhook secret hash in Flutterwave's test dashboard.
6. Deploy with `npm install && npm run deploy`.
7. Set the Worker URL as `VITE_FLUTTERWAVE_API_URL` in the Firebase Hosting build environment, then rebuild and deploy the web app.
8. Add the Worker URL ending in `/webhooks/flutterwave` as the Flutterwave test webhook URL.

Never put either secret in GitHub source, a Vite variable, Firestore, or a browser.

## Coin package configuration

Add package rows directly to D1 only after deciding the product and pricing. Example shape (values below are placeholders; do not run this example):

```sql
INSERT INTO wallet_packages (package_id, label, coins, amount, currency, active, display_order)
VALUES ('sample-package', 'Sample package', 100, 100.00, 'NGN', 0, 1);
```

Keep `active = 0` until the package has been reviewed. Set it to 1 only after confirming the displayed coin amount, price, and currency.

## Endpoints

- `GET /v1/health` — reports whether test configuration is complete.
- `GET /v1/catalog` — authenticated list of active packages.
- `GET /v1/wallet` — authenticated coin balance.
- `POST /v1/checkout` — authenticated; accepts only `packageId`.
- `POST /v1/verify-return` — authenticated transaction verification after checkout redirect.
- `POST /webhooks/flutterwave` — verifies webhook signature and independently verifies the transaction.

Creator gifts, creator earnings, identity checks, and withdrawals are separate later stages and are not activated by this wallet top-up integration.
