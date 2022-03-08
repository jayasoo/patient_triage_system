const express = require('express');
require('dotenv').config();
const mysql = require('mysql2');

const bookingRoute = require('./routes/booking');

port = process.env.PORT || 4000;

const app = express();
app.use(express.json());

app.use('/booking/', bookingRoute);

app.listen(port, () => {console.log("listening on port " + port)})