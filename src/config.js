// Central configuration — everything is read from environment variables (.env).
require('dotenv').config();

const MODE = (process.env.INTERSWITCH_MODE || 'TEST').toUpperCase();

// Base URLs per mode (docs: https://docs.interswitchgroup.com/docs/quickstart-accept-your-first-payment-in-5-minutes)
const HOSTS = {
  TEST: {
    api: 'https://sandbox.interswitchng.com',
    passport: 'https://passport-sandbox.interswitchng.com',
    webpay: 'https://newwebpay-sandbox.interswitchng.com',
  },
  LIVE: {
    api: 'https://webpay.interswitchng.com',
    passport: 'https://passport.interswitchng.com',
    webpay: 'https://webpay.interswitchng.com',
  },
};

const hosts = HOSTS[MODE] || HOSTS.TEST;

const config = {
  mode: MODE,
  port: Number(process.env.PORT || 3000),

  // Interswitch merchant credentials
  merchantCode: process.env.INTERSWITCH_MERCHANT_CODE || 'MX6072',
  payableCode: process.env.INTERSWITCH_PAYABLE_CODE || '9405967', // Pay Item ID
  clientId: process.env.INTERSWITCH_CLIENT_ID || '',
  clientSecret: process.env.INTERSWITCH_CLIENT_SECRET || '',
  webhookSecret: process.env.INTERSWITCH_WEBHOOK_SECRET || '',

  // Overrides (optional) — mainly for testing against a different host
  apiBaseUrl: process.env.INTERSWITCH_API_BASE_URL || hosts.api,
  passportBaseUrl: process.env.INTERSWITCH_PASSPORT_BASE_URL || hosts.passport,
  webpayBaseUrl: process.env.INTERSWITCH_WEBPAY_BASE_URL || hosts.webpay,

  // Where Interswitch sends the customer after payment
  appBaseUrl: (process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, ''),

  // ISO 4217 numeric code — 566 = NGN
  currencyCode: process.env.INTERSWITCH_CURRENCY_CODE || '566',
};

module.exports = config;
