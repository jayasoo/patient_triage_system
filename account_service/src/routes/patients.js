const express = require('express');
const router = express.Router();
const dbParams = require('../database');
const mysql = require('mysql2/promise');

require('dotenv').config();

router.post('/', async(req, res) => {
  const db_connection = await mysql.createConnection(dbParams);
  try {
    const [results, fields] = await db_connection.execute('INSERT INTO PATIENT (id, person_name, address, severity) VALUES (?, ?, ?, ?)',
      [req.body.id, req.body.name, req.body.address, req.body.severity]);
    return res.sendStatus(200);
  } catch (err) {
    console.log(err);
    return res.sendStatus(500);
  } finally {
    await db_connection.end();
  }

});

router.get('/', async(req, res) => {
  const db_connection = await mysql.createConnection(dbParams);
  try {
    const [results, fields] = await db_connection.execute(
      'SELECT id, person_name, address, severity FROM PATIENT WHERE id = ?',
      [req.query.id]
    );
    if (results.length > 0)
      return res.json(results[0]);
    else
      return res.json({})
  } catch (err) {
    console.log(err);
    res.sendStatus(500);
  } finally {
    await db_connection.end();
  }
});

router.delete('/', async(req, res) => {
  const db_connection = await mysql.createConnection(dbParams);
  try {
    const [results, fields] = await db_connection.execute(
      'DELETE FROM PATIENT WHERE id = ?',
      [req.query.id]
    );
    return res.sendStatus(200);
  } catch(err) {
    console.log(err);
    return res.sendStatus(500);
  } finally {
    await db_connection.end();
  }
});

router.put('/', async(req, res) => {
  const db_connection = await mysql.createConnection(dbParams);
  try {
    const [results, fields] = await db_connection.db.execute(
      'UPDATE PATIENT SET id = ?, person_name = ?, address = ?, severity = ? where id = ?',
      [req.body.id, req.body.name, req.body.address, req.body.severity, req.body.id],
    );
    return res.sendStatus(200);
  } catch (err) {
    console.log(err);
    return res.sendStatus(500);
  } finally {
    await db_connection.end();
  }
});

module.exports = router;