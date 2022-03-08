const express = require('express');
const router = express.Router();
const db = require('../database')

require('dotenv').config();

router.post('/', async(req, res) => {
  db.execute(
    'INSERT INTO PATIENT (id, person_name, address, severity) VALUES (?, ?, ?, ?)',
    [req.body.id, req.body.name, req.body.address, req.body.severity],
    function(err, results, fields) {
      if (err) {
        console.log(err);
        return res.sendStatus(500);
      } else {
        return res.sendStatus(200);
      }
    }
  )
});

router.get('/', async(req, res) => {
  db.execute(
    'SELECT id, person_name, address, severity FROM PATIENT WHERE id = ?',
    [req.query.id],
    function(err, results, fields) {
      if (err) {
        console.log(err);
        res.sendStatus(500);
      } else {
        if (results.length > 0)
          return res.json(results[0]);
        else
          return res.json({})
      }
    }
  )
});

router.delete('/', async(req, res) => {
  db.execute(
    'DELETE FROM PATIENT WHERE id = ?',
    [req.query.id],
    function(err, results, fields) {
      if (err) {
        console.log(err);
        return res.sendStatus(500);
      } else {
        return res.sendStatus(200);
      }
    }
  )
});

router.put('/', async(req, res) => {
  db.execute(
    'UPDATE PATIENT SET id = ?, person_name = ?, address = ?, severity = ? where id = ?',
    [req.body.id, req.body.name, req.body.address, req.body.severity, req.body.id],
    function(err, results, fields) {
      if (err) {
        console.log(err);
        return res.sendStatus(500);
      } else {
        return res.sendStatus(200);
      }
    }
  )
});

module.exports = router;