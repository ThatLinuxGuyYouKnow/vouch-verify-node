const express = require('express');
const admin = require("firebase-admin");
require("dotenv").config();

admin.initializeApp({
 credential: admin.credential.applicationDefault(),
});

var serviceAccount = require("./firestore.json");

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
    await saveOrderRef(orderId, accountData.data.account_number);
    res.status(200).send({ message: "Virtual account created successfully" });
  } catch (error) {
    console.error(`Error handling order: ${error}`);
    res.status(500).send({
      message: "An error occurred while creating the virtual account",
    });
  }
});

const router = express.Router();

router.post("/create-virtual-account", async (req, res) => {
 // ... rest of your code
});

module.exports = router;