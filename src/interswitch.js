// Interswitch API client.
// Docs: https://docs.interswitchgroup.com/docs/quickstart-accept-your-first-payment-in-5-minutes
//
//  1. Take payment  -> Pay Bill  (POST /paymentgateway/api/v1/paybill)
//  2. Verify payment -> Get Transaction (GET /collections/api/v1/gettransaction.json)
//                       or Get Transaction V2 (GET /collections/api/v2/gettransaction.json, OAuth2)
const crypto = require('crypto');
const config = require('./config');

class InterswitchError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.name = 'InterswitchError';
    this.status = status;
    this.body = body;
  }
}

async function request(url, { method = 'GET', headers = {}, body } = {}) {
  let response;
  try {
    response = await fetch(url, { method, headers, body });
  } catch (cause) {
    throw new InterswitchError(`Could not reach Interswitch at ${new URL(url).host}: ${cause.message}`, { cause });
  }

  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // non-JSON response — keep the raw text
  }

  if (!response.ok) {
    throw new InterswitchError(`Interswitch responded ${response.status} for ${method} ${new URL(url).pathname}`, {
      status: response.status,
      body: json || text,
    });
  }
  return json;
}

/**
 * Create a one-time payment link (Pay Bill) for a customer to pay.
 * `amount` is in minor currency units (kobo): ₦100.00 = 10000.
 */
async function createPaymentLink({
  amount,
  email,
  customerId,
  reference, // our transaction reference (optional — generated if not given)
  redirectUrl,
  currencyCode,
}) {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new InterswitchError('amount must be a positive integer in kobo (minor units)');
  }

  const body = {
    merchantCode: config.merchantCode,
    payableCode: config.payableCode,
    amount: String(amount),
    redirectUrl: redirectUrl || `${config.appBaseUrl}/payment-response`,
    customerId: customerId || email,
    currencyCode: String(currencyCode || config.currencyCode),
    customerEmail: email,
  };
  if (reference) body.transactionReference = reference;

  const data = await request(`${config.apiBaseUrl}/paymentgateway/api/v1/paybill`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (String(data.code) !== '200') {
    throw new InterswitchError(`Pay Bill failed: ${data.message || data.code}`, { body: data });
  }
  return data; // { paymentUrl, reference, amount, ... }
}

/**
 * Verify a transaction server-side using the v1 Get Transaction API (no auth needed).
 * Checks ResponseCode === "00" and that the amount matches what we expected.
 */
async function verifyTransaction({ reference, amount }) {
  const params = new URLSearchParams({
    merchantcode: config.merchantCode,
    transactionreference: reference,
    amount: String(amount),
  });

  // Docs use both `gettransaction.json` and `gettransaction` — try both.
  const paths = ['/collections/api/v1/gettransaction.json', '/collections/api/v1/gettransaction'];
  let lastError = null;
  for (const path of paths) {
    try {
      return await request(`${config.apiBaseUrl}${path}?${params}`);
    } catch (error) {
      if (error.status === 404 || error.status === 405) {
        lastError = error;
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

// --- OAuth2 (needed only for the v2 verification API) ----------------------

let tokenCache = null; // { accessToken, expiresAt }

async function getAccessToken() {
  if (tokenCache && tokenCache.expiresAt > Date.now()) return tokenCache.accessToken;

  const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
  const data = await request(
    `${config.passportBaseUrl}/passport/oauth/token?grant_type=client_credentials`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    }
  );

  if (!data || !data.access_token) {
    throw new InterswitchError('Passport did not return an access_token', { body: data });
  }

  const ttl = Math.max(0, Number(data.expires_in || 3600) - 60);
  tokenCache = { accessToken: data.access_token, expiresAt: Date.now() + ttl * 1000 };
  return tokenCache.accessToken;
}

/** Verify a transaction with the v2 API (OAuth2 bearer token). */
async function verifyTransactionV2({ reference, amount }) {
  const token = await getAccessToken();
  const data = await request(
    `${config.apiBaseUrl}/collections/api/v2/gettransaction.json?transactionReference=${encodeURIComponent(reference)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }
  );

  // v2 returns 200 with ResponseCode Z25 when the transaction does not exist
  return data;
}

/** Decide whether an Interswitch transaction response means "paid, in full". */
function isSuccessful(txn, expectedAmount) {
  if (!txn) return false;
  const approved = String(txn.ResponseCode) === '00';
  const amountMatches = Number(txn.Amount) === Number(expectedAmount);
  return approved && amountMatches;
}

/** Verify a webhook payload: HMAC-SHA512 of the raw body vs X-Interswitch-Signature. */
function verifyWebhookSignature(rawBody, signature) {
  if (!config.webhookSecret) return true; // no secret configured — cannot verify (warned at startup)
  const expected = crypto.createHmac('sha512', config.webhookSecret).update(rawBody).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(String(signature || ''), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = {
  InterswitchError,
  createPaymentLink,
  verifyTransaction,
  verifyTransactionV2,
  getAccessToken,
  isSuccessful,
  verifyWebhookSignature,
};
