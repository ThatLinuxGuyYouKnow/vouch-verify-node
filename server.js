// vouch-verify — Interswitch payments server
//
//   POST /payments              take a payment  -> returns an Interswitch payment link
//   POST /verify-transaction    verify a payment (server-side, never trust the browser)
//   POST /payment-response      customer redirect target (web redirect)
//   POST /webhooks/interswitch  Interswitch webhook receiver (HMAC-SHA512 signed)
//
const express = require('express');
const config = require('./src/config');
const interswitch = require('./src/interswitch');
const payments = require('./src/payments');

const app = express();

// Keep the raw body around so webhook signatures can be verified against the exact bytes.
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf.toString('utf8');
    },
  })
);
app.use(express.urlencoded({ extended: true }));

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------
app.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'vouch-verify',
    mode: config.mode,
    endpoints: {
      'POST /payments': 'create an Interswitch payment link',
      'POST /verify-transaction': 'verify a payment server-side',
      'GET /payments/:transactionReference': 'look up a payment we initiated',
      'POST /payment-response': 'web redirect target',
      'POST /webhooks/interswitch': 'webhook receiver',
    },
  });
});

// ---------------------------------------------------------------------------
// 1. Take a payment — creates a Pay Bill link the customer can pay on
// ---------------------------------------------------------------------------
app.post('/payments', async (req, res) => {
  const { amount, email, customerId, name, reference, redirectUrl, currencyCode } = req.body;

  if (!Number.isInteger(amount) || amount <= 0) {
    return res.status(400).json({
      success: false,
      message: 'amount must be a positive integer in kobo (minor units) — ₦100.00 = 10000',
    });
  }
  if (!email && !customerId) {
    return res.status(400).json({ success: false, message: 'email (or customerId) is required' });
  }

  const transactionReference = reference || `tx_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  try {
    const bill = await interswitch.createPaymentLink({
      amount,
      email,
      customerId,
      reference: transactionReference,
      redirectUrl,
      currencyCode,
    });

    const payment = payments.create({
      transactionReference,
      interswitchReference: bill.reference,
      billId: bill.id,
      amount,
      currency: String(currencyCode || config.currencyCode),
      email: email || customerId,
      name: name || null,
      paymentUrl: bill.paymentUrl,
      redirectUrl: bill.redirectUrl,
    });

    res.status(201).json({
      success: true,
      message: 'Payment link created',
      paymentUrl: bill.paymentUrl,
      transactionReference,
      reference: bill.reference,
      amount,
      currency: payment.currency,
    });
  } catch (error) {
    console.error('create payment failed:', error.message, error.body || '');
    res.status(502).json({
      success: false,
      message: 'Could not create payment link with Interswitch',
      error: error.message,
    });
  }
});

// ---------------------------------------------------------------------------
// 2. Verify a payment — call Interswitch from your server before giving value
// ---------------------------------------------------------------------------
async function handleVerify(req, res) {
  const body = req.body || {};
  const query = req.query || {};

  // Accepts both the new names and the old Flutterwave-era names.
  const transactionReference =
    body.transactionReference || body.txnRef || body.transactionId || query.transactionReference || query.txnRef;
  const expectedAmount = Number(body.amount ?? body.expectedAmount ?? query.amount);
  const version = String(body.version || query.version || '1');
  const currency = (body.expectedCurrency || body.currency || query.currency || '').toUpperCase();

  if (!transactionReference) {
    return res.status(400).json({ success: false, message: 'transactionReference is required' });
  }

  const record = payments.get(transactionReference);
  const amountToCheck = Number.isFinite(expectedAmount) && expectedAmount > 0 ? expectedAmount : record?.amount;

  if (!Number.isFinite(amountToCheck) || amountToCheck <= 0) {
    return res.status(400).json({
      success: false,
      message: 'amount is required (in kobo) when the payment was not created by this server',
    });
  }

  // Optional currency guard: old callers sent expectedCurrency: "NGN".
  const CURRENCY_CODES = { NGN: '566' };
  if (currency && record) {
    const code = CURRENCY_CODES[currency] || currency;
    if (code !== record.currency) {
      return res.status(400).json({ success: false, message: `currency mismatch: expected ${currency}` });
    }
  }

  try {
    const txn =
      version === '2'
        ? await interswitch.verifyTransactionV2({ reference: transactionReference, amount: amountToCheck })
        : await interswitch.verifyTransaction({ reference: transactionReference, amount: amountToCheck });

    const verified = interswitch.isSuccessful(txn, amountToCheck);

    if (record) {
      payments.update(transactionReference, {
        status: verified ? 'paid' : 'failed',
        verifiedAt: new Date().toISOString(),
        transaction: txn,
      });
    }

    if (verified) {
      return res.status(200).json({
        success: true,
        verified: true,
        message: 'Payment verified successfully',
        transaction: txn,
      });
    }

    return res.status(400).json({
      success: false,
      verified: false,
      message:
        String(txn?.ResponseCode) === '00'
          ? 'Payment verification failed: amount mismatch'
          : 'Payment verification failed',
      responseCode: txn?.ResponseCode ?? null,
      responseDescription: txn?.ResponseDescription ?? null,
      expectedAmount: amountToCheck,
      paidAmount: txn?.Amount ?? null,
      transaction: txn,
    });
  } catch (error) {
    console.error('verify failed:', error.message, error.body || '');
    return res.status(502).json({
      success: false,
      message: 'An error occurred during verification',
      error: error.message,
    });
  }
}

app.post('/verify-transaction', handleVerify);
app.get('/verify-transaction', handleVerify);

// ---------------------------------------------------------------------------
// Look up a payment this server created
// ---------------------------------------------------------------------------
app.get('/payments/:transactionReference', (req, res) => {
  const payment = payments.get(req.params.transactionReference);
  if (!payment) {
    return res.status(404).json({ success: false, message: 'Unknown transaction reference' });
  }
  res.json({ success: true, payment });
});

// ---------------------------------------------------------------------------
// Web redirect target — Interswitch POSTs the result here after checkout.
// The body is NEVER trusted: we re-verify with Interswitch before responding.
// ---------------------------------------------------------------------------
app.post('/payment-response', async (req, res) => {
  const txnRef = req.body.txnref || req.body.transactionreference || req.body.transactionReference;

  if (!txnRef) {
    return res.status(400).json({ success: false, message: 'missing txnref' });
  }

  const record = payments.get(txnRef);
  const expectedAmount = record?.amount;

  if (!expectedAmount) {
    return res.status(404).json({
      success: false,
      message: 'Redirect received but no matching payment was created by this server — verify manually',
      received: req.body,
    });
  }

  try {
    const txn = await interswitch.verifyTransaction({ reference: txnRef, amount: expectedAmount });
    const verified = interswitch.isSuccessful(txn, expectedAmount);

    payments.update(txnRef, {
      status: verified ? 'paid' : 'failed',
      verifiedAt: new Date().toISOString(),
      transaction: txn,
    });

    res.status(verified ? 200 : 400).json({
      success: verified,
      message: verified ? 'Payment verified successfully' : 'Payment verification failed',
      transaction: txn,
    });
  } catch (error) {
    console.error('payment-response verification failed:', error.message);
    res.status(502).json({ success: false, message: 'Could not verify payment', error: error.message });
  }
});

// ---------------------------------------------------------------------------
// Webhooks — respond 200 with no body immediately, then verify asynchronously.
// ---------------------------------------------------------------------------
app.post('/webhooks/interswitch', (req, res) => {
  const signature = req.headers['x-interswitch-signature'];
  const rawBody = req.rawBody || '';

  if (!interswitch.verifyWebhookSignature(rawBody, signature)) {
    console.warn('Webhook rejected: bad signature');
    return res.status(401).end();
  }

  // 200 immediately, no body (per Interswitch docs) — then process.
  res.status(200).end();

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return console.warn('Webhook with non-JSON body ignored');
  }

  const ref = event.data?.merchantReference || event.uuid;
  const record = ref ? payments.get(ref) : null;
  if (!record) {
    return console.log(`Webhook ${event.event} for unknown reference ${ref} — logged only`);
  }

  // Don't trust the payload: re-verify with Interswitch before marking as paid.
  interswitch
    .verifyTransaction({ reference: ref, amount: record.amount })
    .then((txn) => {
      const verified = interswitch.isSuccessful(txn, record.amount);
      payments.update(ref, {
        status: verified ? 'paid' : 'failed',
        verifiedAt: new Date().toISOString(),
        transaction: txn,
      });
      console.log(`Webhook ${event.event}: ref ${ref} -> ${verified ? 'PAID' : 'NOT PAID'}`);
    })
    .catch((error) => console.error(`Webhook re-verification failed for ${ref}:`, error.message));
});

// ---------------------------------------------------------------------------
app.listen(config.port, () => {
  console.log(`vouch-verify listening on :${config.port} [${config.mode}]`);
  console.log(`  merchant: ${config.merchantCode}  payable: ${config.payableCode}`);
  console.log(`  api base: ${config.apiBaseUrl}`);
  if (!config.webhookSecret) {
    console.warn('  INTERSWITCH_WEBHOOK_SECRET not set — webhook signatures are not being checked');
  }
});
