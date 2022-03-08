const express = require('express');
const router = express.Router();
const db = require('../database');
const redis = require('redis');
const { v4: uuidv4 } = require('uuid');

require('dotenv').config();

router.post('/create-booking', async(req, res) => {
  try {
    const redisClient = redis.createClient({url: process.env.REDIS_URL});
    await redisClient.connect();
    // Get hospitals from Redis with number of beds satisfying hospital category and severity
    const hospital_list = await redisClient.ZRANGEBYSCORE(`${req.body.category}:${req.body.capacity}`, 1, '+inf');

    // Loop through the hospitals until one booking goes through
    for (let i=0; i<10; i++) {
      hospital_id = hospital_list[Math.floor(Math.random() * hospital_list.length)];
      console.log(hospital_id);
      try {
        db_connection = await db.promise().getConnection();
        await db_connection.execute('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
        await db_connection.query('START TRANSACTION');
        // Check availability of the beds
        const [rows, fields] = await db_connection.execute('SELECT * FROM AVAILABILITY where hospital_id = ? FOR UPDATE', [hospital_id])
        console.log('got availability');
        if ((rows.length == 0) || (rows.length > 0 && rows[0][`${req.body.capacity}_capacity`] < 1)) {
          console.log(`${req.body.capacity} bed not available at ${hospital_id}`);
          await db_connection.query('ROLLBACK');
          db_connection.release();
          continue;
        }

        // Create an entry in the booking table
        const booking_id = uuidv4();
        await db_connection.execute('INSERT INTO BOOKING (id, patient_id, hospital_id, hospital_category, severity, allocated_on) VALUES (?, ?, ?, ?, ?, ?)',
          [booking_id, req.body.patient_id, hospital_id, req.body.category, req.body.capacity, Math.floor((new Date()).getTime() / 1000)]
        );

        // Update availability of the beds in the hospital in the DB
        await db_connection.execute(`UPDATE AVAILABILITY SET ${req.body.capacity}_capacity = ${req.body.capacity}_capacity - 1 WHERE hospital_id = ?`,
          [hospital_id]
        );
        await db_connection.query('COMMIT');
        db_connection.release();

        // Update the availability of the beds in the Redis
        await redisClient.ZINCRBY(`${req.body.category}:${req.body.capacity}`, -1, hospital_id);
        return res.json({booking_id: booking_id, message: "booking successful"});
      } catch (err) {
        console.log(err);
        await db_connection.query('ROLLBACK');
        db_connection.release();
      }
    }
    return res.json({message: "booking failed. No beds available"});
  } catch (err) {
    console.log(err);
    return res.sendStatus(500);
  }
});

router.post('/cancel-booking', async(req, res) => {
  try {
    const redisClient = redis.createClient({url: process.env.REDIS_URL});
    await redisClient.connect();
    db_connection = await db.promise().getConnection();
    await db_connection.query('START TRANSACTION');

    // Get the booking information
    var [bookings, _] = await db_connection.execute('SELECT * FROM BOOKING where id = ?', [req.body.booking_id])
    if (bookings.length == 0) {
      console.log(`booking id ${req.body.booking_id} not found`);
      await db_connection.query('ROLLBACK');
      db_connection.release();
      return res.sendStatus(400);
    }
    booking = bookings[0];
    // Check whether booking is already cancelled or discharged
    if (booking.cancelled || booking.discharged_on) {
      console.log(`booking id ${req.body.booking_id} can't be cancelled`)
      await db_connection.query('ROLLBACK');
      db_connection.release();
      return res.sendStatus(400);
    }
    // Get the hospital information
    var [hospitals, _] = await db_connection.execute('SELECT * FROM HOSPITAL where id = ?', [booking.hospital_id]);
    hospital = hospitals[0];

    // Mark the booking as cancelled
    await db_connection.execute('UPDATE BOOKING SET cancelled_on = ? where id = ?',
      [Math.floor((new Date()).getTime() / 1000), req.body.booking_id]
    );
    // Update bed availability in the DB
    await db_connection.execute(`UPDATE AVAILABILITY SET ${booking.severity}_capacity = ${booking.severity}_capacity + 1 WHERE hospital_id = ?`,
      [booking.hospital_id]
    );
    await db_connection.query('COMMIT');
    db_connection.release();

    // Update bed availability in Redis
    await redisClient.ZINCRBY(`${hospital.category}:${booking.severity}`, 1, booking.hospital_id);
    return res.json({message: `booking ${req.body.booking_id} cancelled`});
  } catch (err) {
    console.log(err);
    return res.sendStatus(500);
  }
});

router.post('/admit', async(req, res) => {
  try {
    db_connection = await db.promise().getConnection();
    await db_connection.query('START TRANSACTION');
    var [bookings, _] = await db_connection.execute('SELECT * FROM BOOKING where id = ?', [req.body.booking_id])
    if (bookings.length == 0) {
      console.log(`booking id ${req.body.booking_id} not found`);
      await db_connection.query('ROLLBACK');
      db_connection.release();
      return res.sendStatus(400);
    }
    booking = bookings[0];
    // Check whether the booking is already admitted/cancelled/discharged
    if (booking.cancelled || booking.registered_on || booking.discharged_on) {
      console.log(`booking id ${req.body.booking_id} can't be admitted`)
      await db_connection.query('ROLLBACK');
      db_connection.release();
      return res.sendStatus(400);
    }
    // Update the booking info to indicate admission
    await db_connection.execute('UPDATE BOOKING SET registered_on = ? where id = ?',
      [Math.floor((new Date()).getTime() / 1000), req.body.booking_id]
    );
    await db_connection.query('COMMIT');
    db_connection.release();
    return res.json({message: `booking ${req.body.booking_id} admitted`});
  } catch (err) {
    console.log(err);
    return res.sendStatus(500);
  }
});


router.post('/discharge', async(req, res) => {
  try {
    const redisClient = redis.createClient({url: process.env.REDIS_URL});
    await redisClient.connect();
    db_connection = await db.promise().getConnection();
    await db_connection.query('START TRANSACTION');
    // Get the booking information
    var [bookings, _] = await db_connection.execute('SELECT * FROM BOOKING where id = ?', [req.body.booking_id])
    if (bookings.length == 0) {
      console.log(`booking id ${req.body.booking_id} not found`);
      await db_connection.query('ROLLBACK');
      db_connection.release();
      return res.sendStatus(400);
    }
    booking = bookings[0];
    // Check whether booking is already cancelled or discharged
    if (booking.cancelled || booking.discharged_on) {
      console.log(`booking id ${req.body.booking_id} can't be discharged`)
      await db_connection.query('ROLLBACK');
      db_connection.release();
      return res.sendStatus(400);
    }

    // Get the hospital information
    var [hospitals, _] = await db_connection.execute('SELECT * FROM HOSPITAL where id = ?', [booking.hospital_id]);
    hospital = hospitals[0];

    // Update booking to indicate that patient is discharged
    await db_connection.execute('UPDATE BOOKING SET discharged_on = ? where id = ?',
      [Math.floor((new Date()).getTime() / 1000), req.body.booking_id]
    );
    // Update bed availability in the DB
    await db_connection.execute(`UPDATE AVAILABILITY SET ${booking.severity}_capacity = ${booking.severity}_capacity + 1 WHERE hospital_id = ?`,
      [booking.hospital_id]
    );
    await db_connection.query('COMMIT');
    db_connection.release();

    // Update bed availability in Redis
    await redisClient.ZINCRBY(`${hospital.category}:${booking.severity}`, 1, booking.hospital_id);
    return res.json({message: `booking id ${req.body.booking_id} discharged`});
  } catch (err) {
    console.log(err);
    return res.sendStatus(500);
  }
});

router.get('/get-bookings', async(req, res) => {
  try {
    const [bookings, _] = await db.promise().execute('SELECT * FROM BOOKING where patient_id = ? order by allocated_on DESC',
        [req.body.patient_id]
    );
    return res.json(bookings);
  } catch (err) {
    console.log(err);
    return res.sendStatus(500);
  }
});

router.get('/availability-stat', async(req, res) => {
  try {
    const [availability_stats, _] = await db.promise().execute('SELECT h.category, sum(a.basic_capacity) as basic, sum(a.moderate_capacity) as moderate, sum(a.emergency_capacity) as emergency FROM AVAILABILITY a INNER JOIN HOSPITAL h WHERE h.id = a.hospital_id GROUP BY h.category',
    );
    return res.json(availability_stats);
  } catch (err) {
    console.log(err);
    return res.sendStatus(500);
  }
});

module.exports = router;