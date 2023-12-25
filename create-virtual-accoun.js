// ... other imports
const express = require("express");
const app = express();
app.use(express.json()); // for parsing application/json
// ... rest of your code

module.exports = app; // for parsing application/json
const admin = require("firebase-admin");
require("dotenv").config();

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});

 var serviceAccount = fetch("/firestore.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

var db = admin.firestore();
const axios = require("axios");

async function createVirtualAccountNumber(details) {
  const url = "https://api.flutterwave.com/v3/virtual-account-numbers";
  const headers = {
    Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`,
  };

  try {
    const response = await axios.post(url, details, { headers });
    return response.data;
  } catch (error) {
    console.error(`Error creating virtual account number: ${error}`);
    throw error;
  }
}

async function saveOrderRef(userId, orderRef) {
  const docRef = db.collection("users").doc(userId);

  try {
    await docRef.set(
      {
        orderRef: orderRef,
      },
      { merge: true }
    );
    console.log(`Successfully saved order ref for user ${userId}`);
  } catch (error) {
    console.error(`Error saving order ref: ${error}`);
    throw error;
  }
}

async function saveVirtualAccountNumber(orderId, accountNumber) {
  const docRef = db.collection("orders").doc(orderId);

  try {
    await docRef.set(
      {
        accountNumber: accountNumber,
      },
      { merge: true }
    );
    console.log(
      `Successfully saved virtual account number for order ${orderId}`
    );
  } catch (error) {
    console.error(`Error saving virtual account number: ${error}`);
    throw error;
  }
}

app.post("/create-virtual-account", async (req, res) => {
  const orderId = req.body.orderId;

  // Extract necessary details from the request body
  const details = {
    email: req.body.email,
    is_permanent: true,
    bvn: req.body.bvn,
    tx_ref: req.body.tx_ref,
    phonenumber: req.body.phonenumber,
    firstname: req.body.firstname,
    lastname: req.body.lastname,
    narration: req.body.narration,
  };

  try {
    const accountData = await createVirtualAccountNumber(details);
    await saveVirtualAccountNumber(orderId, accountData.data.account_number);
    res.status(200).send({ message: "Virtual account created successfully" });
  } catch (error) {
    console.error(`Error handling order: ${error}`);
    res.status(500).send({
      message: "An error occurred while creating the virtual account",
    });
  }
});

app.listen(3000, () => {
  console.log("Server is running on port 3000");
});
