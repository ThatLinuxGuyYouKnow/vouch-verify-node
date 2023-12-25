// Import required modules
const express = require('express');
const bodyParser = require('body-parser');
const Flutterwave = require('flutterwave-node-v3');
const dotenv = require('dotenv');

// Load environment variables from .env file
dotenv.config();

// Create an instance of the Flutterwave client
const flw = new Flutterwave(process.env.FLW_PUBLIC_KEY, process.env.FLW_SECRET_KEY);

// Initialize the Express app
// ... other imports
const flutterwaveRoutes = require('./create-virtual-accoun.js');
app.use('/flutterwave', flutterwaveRoutes);
// ... rest of your code


// Route to handle transaction verification
app.post('/verify-transaction', async (req, res) => {
  const { transactionId, expectedAmount, expectedCurrency } = req.body;

  try {
    const response = await flw.Transaction.verify({ id: transactionId });

    if (
      response.data.status === "successful"
      && response.data.amount === expectedAmount
      && response.data.currency === expectedCurrency
    ) {
      // Success! Confirm the customer's payment
      res.status(200).json({ success: true, message: 'Payment verified successfully' });
    } else {
      // Inform the customer their payment was unsuccessful
      res.status(400).json({ success: false, message: 'Payment verification failed' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: 'An error occurred during verification', error });
  }
});
 
// Route to handle account funding from bank
app.post('/fund-account-bank', async (req, res) => {
  const { account_bank, account_number, amount, narration, currency, debit_currency } = req.body;

  try {
    const payload = {
      "account_bank": account_bank,
      "account_number": account_number,
      "amount": amount,
      "narration": narration,
      "currency": currency,
      "debit_currency": debit_currency
    }
    const response = await flw.Transfer.initiate(payload)
    res.status(200).json(response);
  } catch (error) {
    res.status(500).json({ success: false, message: 'An error occurred during funding', error });
  }
});

// Route to handle account funding from card
app.post('/fund-account-card', async (req, res) => {
  const { card_number, cvv, expiry_month, expiry_year, currency, amount, email, fullname } = req.body;

  try {
    const payload = {
      "card_number": card_number,
      "cvv": cvv,
      "expiry_month": expiry_month,
      "expiry_year": expiry_year,
      "currency": currency,
      "amount": amount,
      "email": email,
      "fullname": fullname
    }
    const response = await flw.Charge.card(payload)
    res.status(200).json(response);
  } catch (error) {
    res.status(500).json({ success: false, message: 'An error occurred during funding', error });
  }
});

// Route to handle root requests (index page with the graphic)
 

// Route to handle root requests (index page with the graphic)
app.get('/', (req, res) => {
  const serverStatusGraphic = '<img src="https://keepcalms.com/p/keep-calm-the-server-is-up/" target="_blank" alt="Server is up!" style="display:block; margin:auto;">';
 
  res.send(`<html><body style="text-align:center;"><h1>Server is running!</h1>${serverStatusGraphic}</body></html>`);
});

// Start the server
 
 
const PORT = process.env.PORT || 3000;
 
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
