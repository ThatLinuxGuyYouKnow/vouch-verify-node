// Import required modules
const express = require('express');
const bodyParser = require('body-parser');
const Flutterwave = require('flutterwave-node-v3');
const dotenv = require('dotenv');
 
const app = express();
// Load environment variables from .env file
dotenv.config();

// Create an instance of the Flutterwave client
const flw = new Flutterwave(process.env.FLW_PUBLIC_KEY, process.env.FLW_SECRET_KEY);
 
const createVirtualAccount = require('./create-virtual-accoun.js');
app.use('/flutterwave', createVirtualAccount);
 


// Route to handle transaction verification
app.post('/verify-transaction', async (req, res) => {
  try {
    transactionID=req.body.transactionId;
    const response = await flw.Transaction.verify({ id: transactionId });

    if (
      response.data.status === "successful"
      && response.data.amount === req.body.expectedAmount
      && response.data.currency === req.body.expectedCurrency
    ) {
      // Success! Confirm the customer's payment
      res.status(200).json({ success: true, message: 'Payment verified successfully' });
    } else {
      // Inform the customer their payment was unsuccessful
      res.status(400).json({ success: false, message: 'Payment verification failed' });
    }
  } catch (error) {
    errorInJson = JSON.stringify(error)
 
 res.statusMessage = 'error' + errorInJson;
 
    res.status(500).json({ success: false, message: 'An error occurred during verification', errorInJson });
  }
});
 
// Route to handle account funding from bank
app.post('/fund-account-bank', async (req, res) => {
 

  try {
    const payload = {
      "account_bank": req.body.account_bank,
      "account_number": req.body.account_number,
      "amount": req.body.amount,
      "narration": req.body.narration,
      "currency": req.body.currency,
      "debit_currency": req.body.debit_currency
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
app.get('/', (req, res) => {
  const serverStatusGraphic = '<img src="https://keepcalms.com/p/keep-calm-the-server-is-up/" target="_blank" alt="Server is up!" style="display:block; margin:auto;">';
 
  res.send(`<html><body style="text-align:center;"><h1>Server is running!</h1>${serverStatusGraphic}</body></html>`);
});

// Start the server
 
 
 
 const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
 console.log(`Server listening on port ${PORT}`)});
// server.js file ends here 