const express = require('express');
const router = express.Router();
const db = require('../database');
const redis = require('redis');
const { v4: uuidv4 } = require('uuid');

require('dotenv').config();

router.post('/', async(req, res) => {
  const hospital_id = uuidv4();
  try {
    db_connection = await db.promise().getConnection();
    await db_connection.query('START TRANSACTION');
    // Insert Hospital to DB
    await db_connection.execute(
      'INSERT INTO HOSPITAL (id, hospital_name, address, category, basic_capacity, moderate_capacity, emergency_capacity) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [hospital_id, req.body.name, req.body.address, req.body.category, req.body.basic, req.body.moderate, req.body.emergency]
    )

    // Explicitly maintain bed availability in a table
    await db_connection.execute(
      'INSERT INTO AVAILABILITY (hospital_id, basic_capacity, moderate_capacity, emergency_capacity) VALUES (?, ?, ?, ?)',
      [hospital_id, req.body.basic, req.body.moderate, req.body.emergency]
    )
    await db_connection.query('COMMIT');
    db_connection.release();

    // Store bed availability in Redis
    const redisClient = redis.createClient({url: process.env.REDIS_URL});
    await redisClient.connect();
    await redisClient.ZADD(`${req.body.category}:basic`, [{score: req.body.basic, value: hospital_id}]);
    await redisClient.ZADD(`${req.body.category}:moderate`, [{score: req.body.moderate, value: hospital_id}]);
    await redisClient.ZADD(`${req.body.category}:emergency`, [{score: req.body.emergency, value: hospital_id}]);
    return res.json({hospital_id: hospital_id});
  } catch (err) {
    console.log(err);
    await db_connection.query('ROLLBACK');
    db_connection.release();
    return res.sendStatus(500);
  }
});

router.get('/', async(req, res) => {
  try {
    const [results, fields] = await db.promise().execute('SELECT * FROM HOSPITAL WHERE id = ?', [req.query.id]);
    if (results.length > 0)
      return res.json(results[0]);
    else
      return res.json({})
  } catch (err) {
    console.log(err);
    return res.sendStatus(500);
  }
});

router.delete('/', async(req, res) => {
  try {
    db_connection = await db.promise().getConnection();
    await db_connection.query('START TRANSACTION');
    // Remove hospital from hospital table as well as availability table
    const hospital_id = req.query.id;
    await db_connection.execute('DELETE FROM HOSPITAL WHERE id = ?', [hospital_id]);
    await db_connection.execute('DELETE FROM AVAILABILITY WHERE id = ?', [hospital_id]);
    await db_connection.query('COMMIT');
    db_connection.release();

    // Remove hospital from Redis
    const redisClient = redis.createClient({url: process.env.REDIS_URL});
    await redisClient.connect();
    await redisClient.ZREM(`${req.body.category}:basic`, hospital_id);
    await redisClient.ZREM(`${req.body.category}:moderate`, hospital_id);
    await redisClient.ZREM(`${req.body.category}:emergency`, hospital_id);
    return res.sendStatus(200);
  } catch (err) {
    console.log(err);
    await db_connection.query('ROLLBACK');
    db_connection.release();
    return res.sendStatus(500);
  }
});

router.put('/', async(req, res) => {
  try {
    const hospital_id = req.body.id;
    db_connection = await db.promise().getConnection();
    await db_connection.query('START TRANSACTION');

    // Calculate current booking and updated availability
    const [current_bookings, _] = await db_connection.execute(
      'SELECT * FROM BOOKING where hospital_id = ? and discharged_on IS NULL and cancelled_on is NULL',
      [req.body.id]
    )
    current_booking_count = {
      basic: 0,
      moderate: 0,
      emergency: 0
    }

    for (const booking of current_bookings) {
      if (booking.severity === 'basic')
      current_booking_count.basic += 1
      else if (booking.severity === 'moderate')
      current_booking_count.moderate += 1
      else if (booking.severity === 'emergency')
      current_booking_count.emergency += 1
    }

    // If new capacity numbers are lessaer than already booked beds, raise error
    if (req.body.basic < current_booking_count.basic || req.body.moderate < current_booking_count.moderate || req.body.emergency < current_booking_count.emergency) {
      console.log('Bed capacity less than current booking')
      await db_connection.query('ROLLBACK');
      db_connection.release();
      return res.status(400).json({message: 'Bed capacity less than current booking'});
    }

    // Update hospital information in the DB
    const [rows, fields] = await db_connection.execute(
      'UPDATE HOSPITAL SET hospital_name = ?, address = ?, category = ?, basic_capacity = ?, moderate_capacity = ?, emergency_capacity = ? where id = ?',
      [req.body.name, req.body.address, req.body.category, req.body.basic, req.body.moderate, req.body.emergency, req.body.id]
    )

    // Update bed availability in the DB
    await db_connection.execute(
      'UPDATE AVAILABILITY SET basic_capacity = ?, moderate_capacity = ?, emergency_capacity = ? WHERE hospital_id = ?',
      [req.body.basic - current_booking_count.basic, req.body.moderate - current_booking_count.moderate, req.body.emergency - current_booking_count.emergency, hospital_id]
    )
    await db_connection.query('COMMIT');
    db_connection.release();

    // Update bed availability in Redis
    const redisClient = redis.createClient({url: process.env.REDIS_URL});
    await redisClient.connect();
    await redisClient.ZADD(`${req.body.category}:basic`, [{score: req.body.basic - current_booking_count.basic, value: hospital_id}]);
    await redisClient.ZADD(`${req.body.category}:moderate`, [{score: req.body.moderate - current_booking_count.moderate, value: hospital_id}]);
    await redisClient.ZADD(`${req.body.category}:emergency`, [{score: req.body.emergency - current_booking_count.emergency, value: hospital_id}]);
    return res.sendStatus(200);
  } catch (err) {
    console.log(err);
    await db_connection.query('ROLLBACK');
    db_connection.release();
    return res.sendStatus(500);
  }
});

module.exports = router;