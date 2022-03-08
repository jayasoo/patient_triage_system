const express = require('express');
require('dotenv').config();
const mysql = require('mysql2');

const patientRoute = require('./routes/patients');
const hospitalRoute = require('./routes/hospital');

port = process.env.PORT || 3000;

const app = express();
app.use(express.json());

app.use('/patients/', patientRoute);
app.use('/hospitals/', hospitalRoute);

app.listen(port, () => {console.log("listening on port " + port)})