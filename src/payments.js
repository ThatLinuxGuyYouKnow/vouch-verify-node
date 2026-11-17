// In-memory store of payments we have initiated.
// For a proof of concept this lives in memory — swap for a real database later.
const store = new Map();

function create(record) {
  const payment = {
    status: 'pending', // pending -> paid | failed
    createdAt: new Date().toISOString(),
    verifiedAt: null,
    transaction: null,
    ...record,
  };
  store.set(payment.transactionReference, payment);
  return payment;
}

function get(transactionReference) {
  return store.get(transactionReference) || null;
}

function update(transactionReference, patch) {
  const payment = store.get(transactionReference);
  if (!payment) return null;
  Object.assign(payment, patch);
  return payment;
}

function list() {
  return Array.from(store.values());
}

module.exports = { create, get, update, list };
