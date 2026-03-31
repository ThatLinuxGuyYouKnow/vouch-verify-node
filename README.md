# vouch-verify

Take payments and verify them server-side with the **Interswitch** developer API (Node.js + Express).

Replaces the previous Flutterwave integration.

## Endpoints

| Method | Path                        | Purpose                                                        |
| ------ | --------------------------- | -------------------------------------------------------------- |
| POST   | `/payments`                 | **Take a payment** — creates an Interswitch Pay Bill link      |
| POST   | `/verify-transaction`       | **Verify a payment** server-side (v1, or `version: 2` for OAuth) |
| GET    | `/verify-transaction`       | Same, via query params                                         |
| GET    | `/payments/:transactionReference` | Look up a payment this server created                    |
| POST   | `/payment-response`         | Redirect target after checkout (re-verifies before responding) |
| POST   | `/webhooks/interswitch`     | Webhook receiver — HMAC-SHA512 signature checked, 200 ack      |
| GET    | `/`                         | Health/status                                                  |

## Quick start

```bash
npm install
npm start          # or: npm run dev (auto-restart on change)
```

Configuration lives in `.env` (see `.env.example`). It ships with Interswitch's shared **sandbox** credentials so you can test immediately:

| Variable | Default | Meaning |
| --- | --- | --- |
| `INTERSWITCH_MODE` | `TEST` | `TEST` (sandbox) or `LIVE` |
| `INTERSWITCH_MERCHANT_CODE` | `MX6072` | Your merchant code |
| `INTERSWITCH_PAYABLE_CODE` | `9405967` | Your Pay Item ID |
| `INTERSWITCH_CLIENT_ID` | sandbox value | Passport OAuth2 client id (v2 verify) |
| `INTERSWITCH_CLIENT_SECRET` | `secret` | Passport OAuth2 secret |
| `INTERSWITCH_WEBHOOK_SECRET` | *(empty)* | HMAC secret for `X-Interswitch-Signature` |
| `APP_BASE_URL` | `http://localhost:3000` | Public URL of this server (redirect target) |
| `PORT` | `3000` | Server port |

Amounts are always in **minor units (kobo)**: ₦100.00 → `10000`. Currency code `566` = NGN.

## 1. Take a payment

```bash
curl -X POST http://localhost:3000/payments \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 10000,
    "email": "customer@example.com",
    "customerId": "cust_42",
    "name": "Ada Obi"
  }'
```

Response:

```json
{
  "success": true,
  "message": "Payment link created",
  "paymentUrl": "https://.../paymentgateway/paybill/3WuIKFZFvGWra4e",
  "transactionReference": "tx_1763370000_ab12cd34",
  "reference": "3WuIKFZFvGWra4e",
  "amount": 10000,
  "currency": "566"
}
```

Send the customer to `paymentUrl`. This uses the **Pay Bill** API (`POST /paymentgateway/api/v1/paybill`).

## 2. Verify a payment

Never trust the browser redirect or the client callback — always re-check with Interswitch:

```bash
curl -X POST http://localhost:3000/verify-transaction \
  -H "Content-Type: application/json" \
  -d '{ "transactionReference": "tx_1763370000_ab12cd34", "amount": 10000 }'
```

Response (approved + amount matches):

```json
{
  "success": true,
  "verified": true,
  "message": "Payment verified successfully",
  "transaction": { "ResponseCode": "00", "Amount": 10000, "...": "..." }
}
```

Rules enforced:

1. `ResponseCode` must be `"00"` (approved by the financial institution).
2. The returned `Amount` must equal the amount you originally charged.

Otherwise the response is `400` with `success: false`.

The verification uses `GET /collections/api/v1/gettransaction.json?merchantcode=…&transactionreference=…&amount=…`. To use the OAuth2-protected v2 API instead, send `"version": 2` in the body (needs `INTERSWITCH_CLIENT_ID` / `INTERSWITCH_CLIENT_SECRET`).

## 3. Redirect & webhook

- **`POST /payment-response`** — where Interswitch sends the customer after checkout (`payment_response_type: POST`). It ignores the posted body and re-verifies the transaction server-side.
- **`POST /webhooks/interswitch`** — optional but recommended (configure in the Quickteller Business dashboard → Developer Tools). The payload is signed with `HmacSHA512` in the `X-Interswitch-Signature` header; set `INTERSWITCH_WEBHOOK_SECRET` to have it checked. The handler acks with an empty `200` immediately, then re-verifies with Interswitch before marking the payment paid.

## Testing in the sandbox

Test card (success): Verve `5061050254756707864`, expiry `06/26`, CVV `111`, PIN `1111`.
More cards (success/failure scenarios): https://docs.interswitchgroup.com/docs/test-cards

> Note: the sandbox host `sandbox.interswitchng.com` was not reachable from every network when this was built — if your network blocks it, the API calls will fail with a connection error rather than a bad response.

## Going live

1. Generate your own credentials: https://docs.interswitchgroup.com/docs/getting-integration-credentials
2. Set `INTERSWITCH_MODE=LIVE` (base URLs switch to `webpay.interswitchng.com` / `passport.interswitchng.com`).
3. Set your real `INTERSWITCH_MERCHANT_CODE`, `INTERSWITCH_PAYABLE_CODE`, client id/secret, and webhook secret.
4. Set `APP_BASE_URL` to your public HTTPS domain.

## Notes on the pivot

- `flutterwave-node-v3` and `***REMOVED***-admin` were removed from `package.json`; `create-virtual-accoun.js` (Flutterwave/***REMOVED***) was deleted.
- Payment records are held in an in-memory store (`src/payments.js`) — enough for a proof of concept; swap it for ***REMOVED***/Postgres for production.
- The old Flutterwave-only routes (`/fund-account-bank`, `/fund-account-card`) are gone; equivalent Interswitch transfer APIs live under a different product (Send Money) if you need them.

## Layout

```
server.js           Express app + routes
src/config.js       env config + per-mode base URLs
src/interswitch.js  Interswitch client: pay bill, verify v1/v2, OAuth token, webhook HMAC
src/payments.js     in-memory payment store
```
