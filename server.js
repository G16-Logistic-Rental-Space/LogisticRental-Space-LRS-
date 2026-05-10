const express = require("express");
const mysql = require("mysql");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");

const PROJECT_ROOT = path.join(__dirname, "Sinor project");
console.log("Serving from:", PROJECT_ROOT);

console.log("THIS SERVER FILE IS RUNNING");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(express.static(PROJECT_ROOT));

app.get("/", (req, res) => {
  res.sendFile(path.join(PROJECT_ROOT, "HTML", "HomePage.html"));
});

/* =========================================================
   DATABASE CONNECTION
   ========================================================= */
let dbInstance = null;
function getDBConnection() {
  if (!dbInstance) {
    dbInstance = mysql.createConnection({
      host: "localhost",
      user: "root",
      password: "root",
      database: "logistical_rental_space",
      port: 8889,
      charset: "utf8mb4",
    });

    dbInstance.connect((err) => {
      if (err) {
        console.error("Database connection failed:", err);
        return;
      }
      console.log("MySQL connected");
    });
  }
  return dbInstance;
}

const db = getDBConnection();
console.log("Connected DB:", db.config.database);
console.log("Port:", db.config.port);

function validateSignup(fullname, username, password, mobile, user_type) {
  if (!fullname || fullname.trim().length < 3) {
    return "Full name must be at least 3 characters.";
  }
  const usernamePattern = /^[A-Za-z][A-Za-z0-9_]{2,19}$/;
  if (!usernamePattern.test(username)) {
    return "Username must start with a letter and be 3–20 characters.";
  }
  const passwordPattern =
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!\"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]).{8,}$/;
  if (!passwordPattern.test(password)) {
    return "Password must include uppercase, lowercase, number, special symbol, and be at least 8 characters.";
  }
  const mobilePattern = /^(05\d{8}|9665\d{8})$/;
  if (!mobilePattern.test(mobile)) {
    return "Enter a valid Saudi mobile number (05xxxxxxxx or 9665xxxxxxxx).";
  }
  const allowedTypes = ["Truck owner", "Customer"];
  if (!allowedTypes.includes(user_type)) {
    return "User type must be either 'Truck owner' or 'Customer'.";
  }
  return null;
}

/* =========================================================
   NOTIFICATION HELPER
   ========================================================= */

function createNotification(data) {
  const {
    user_id,
    sender_id,
    type,
    body,
    room_code,
    booking_id,
    truck_ad_id,
    offer_id,
  } = data;

  const safeBody = body || "New notification";

  const insertNotification = () => {
    const sql = `
      INSERT INTO notifications
      (user_id, sender_id, type, body, room_code, booking_id, truck_ad_id, offer_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.query(
      sql,
      [
        user_id,
        sender_id,
        type,
        safeBody,
        room_code || null,
        booking_id || null,
        truck_ad_id || null,
        offer_id || null,
      ],
      (err, result) => {
        if (err) {
          console.error("Notification insert error:", err);
          return;
        }

        const fetchSql = `
          SELECT
            n.id,
            n.user_id,
            n.sender_id,
            n.type,
            n.body,
            n.room_code,
            n.booking_id,
            n.truck_ad_id,
            n.offer_id,
            n.is_read,
            n.created_at,
            u.fullname AS sender_name,
            COALESCE(tr.pickup_location, ta.pickup_location) AS pickup_location,
            COALESCE(tr.dropoff_location, ta.dropoff_location) AS dropoff_location,
            COALESCE(tr.good_type, NULL) AS good_type,
            cr.current_offer,
            b.price AS booking_price,
            b.weight_requested AS booked_capacity,
            ta.max_volume,
            ta.max_weight,
            o.truck_type,
            o.truck_departure_date
          FROM notifications n
          LEFT JOIN offers o ON n.offer_id = o.id
          LEFT JOIN users u ON n.sender_id = u.id
          LEFT JOIN truck_ads ta ON n.truck_ad_id = ta.id
          LEFT JOIN truck_req tr ON n.truck_ad_id = tr.id
          LEFT JOIN chat_rooms cr ON n.room_code = cr.room_code
          LEFT JOIN bookings b ON n.booking_id = b.id
          WHERE n.id = ?
          LIMIT 1
        `;

        db.query(fetchSql, [result.insertId], (fetchErr, rows) => {
          if (fetchErr) {
            console.error("Notification fetch after insert error:", fetchErr);
            return;
          }

          if (rows.length) {
            io.to(`user_${user_id}`).emit("new_notification", rows[0]);
          }
        });
      },
    );
  };

  const finalTypes = ["approved", "rejected"];

  if (
    finalTypes.includes(String(type || "").toLowerCase()) &&
    user_id &&
    room_code
  ) {
    const dedupeSql = `
      SELECT id
      FROM notifications
      WHERE user_id = ?
        AND room_code = ?
        AND type = ?
      LIMIT 1
    `;

    db.query(dedupeSql, [user_id, room_code, type], (dedupeErr, dedupeRows) => {
      if (dedupeErr) {
        console.error("Notification dedupe error:", dedupeErr);
        insertNotification();
        return;
      }

      if (dedupeRows.length) {
        return;
      }

      insertNotification();
    });

    return;
  }

  insertNotification();
}

function reduceCapacityOnApprovedBooking(bookingId, callback) {
  if (!bookingId) {
    return callback({
      success: false,
      message: "Invalid booking id",
    });
  }

  db.beginTransaction((txErr) => {
    if (txErr) {
      console.error("Transaction start error:", txErr);
      return callback({
        success: false,
        message: "Failed to start transaction",
      });
    }

    const bookingSql = `
      SELECT
        b.id,
        b.truck_ad_id,
        b.weight_requested,
        b.capacity_unit,
        b.status,
        ta.id AS ad_id,
        ta.max_volume,
        ta.max_weight,
        ta.current_used_volume,
        ta.current_used_weight
      FROM bookings b
      INNER JOIN truck_ads ta ON b.truck_ad_id = ta.id
      WHERE b.id = ?
      LIMIT 1
      FOR UPDATE
    `;

    db.query(bookingSql, [bookingId], (bookingErr, rows) => {
      if (bookingErr) {
        console.error("Capacity booking fetch error:", bookingErr);
        return db.rollback(() =>
          callback({
            success: false,
            message: "Database error while fetching booking",
          }),
        );
      }

      if (!rows.length) {
        return db.rollback(() =>
          callback({
            success: false,
            message: "Booking not found",
          }),
        );
      }

      const row = rows[0];
      const normalizedStatus = String(row.status || "").trim().toLowerCase();

      if (["approved", "in transit", "delivered"].includes(normalizedStatus)) {
        return db.commit((commitErr) => {
          if (commitErr) {
            console.error("Capacity commit skip error:", commitErr);
            return db.rollback(() =>
              callback({
                success: false,
                message: "Failed to finalize transaction",
              }),
            );
          }

          return callback({
            success: true,
            alreadyApplied: true,
            booking: {
              id: row.id,
              truck_ad_id: row.truck_ad_id,
              capacity_unit: row.capacity_unit || null,
              weight_requested: Number(row.weight_requested) || 0,
            },
          });
        });
      }

      const requestedAmount = Number(row.weight_requested) || 0;

      if (requestedAmount <= 0) {
        return db.rollback(() =>
          callback({
            success: false,
            message: "Requested capacity must be greater than zero",
          }),
        );
      }

      let capacityUnit = String(row.capacity_unit || "").trim().toLowerCase();

      if (!capacityUnit) {
        const remainingVolume =
          Number(row.max_volume || 0) - Number(row.current_used_volume || 0);
        const remainingWeight =
          Number(row.max_weight || 0) - Number(row.current_used_weight || 0);

        if (requestedAmount <= remainingVolume) {
          capacityUnit = "volume";
        } else if (requestedAmount <= remainingWeight) {
          capacityUnit = "weight";
        } else {
          return db.rollback(() =>
            callback({
              success: false,
              message: "Not enough remaining capacity for this booking",
            }),
          );
        }
      }

      const currentUsedVolume = Number(row.current_used_volume) || 0;
      const currentUsedWeight = Number(row.current_used_weight) || 0;
      const maxVolume = Number(row.max_volume) || 0;
      const maxWeight = Number(row.max_weight) || 0;
      let nextUsedVolume = currentUsedVolume;
      let nextUsedWeight = currentUsedWeight;

      if (["volume", "m3", "vol", "cube"].includes(capacityUnit)) {
        const remainingVolume = maxVolume - currentUsedVolume;

        if (requestedAmount > remainingVolume) {
          return db.rollback(() =>
            callback({
              success: false,
              message: "This booking exceeds the remaining volume capacity",
            }),
          );
        }

        nextUsedVolume = currentUsedVolume + requestedAmount;
        capacityUnit = "volume";
      } else {
        const remainingWeight = maxWeight - currentUsedWeight;

        if (requestedAmount > remainingWeight) {
          return db.rollback(() =>
            callback({
              success: false,
              message: "This booking exceeds the remaining weight capacity",
            }),
          );
        }

        nextUsedWeight = currentUsedWeight + requestedAmount;
        capacityUnit = "weight";
      }

      const nextCapacity = Math.max(
        0,
        Math.min(maxVolume - nextUsedVolume, maxWeight - nextUsedWeight),
      );

      const updateAdSql = `
        UPDATE truck_ads
        SET
          current_used_volume = ?,
          current_used_weight = ?,
          capacity = ?
        WHERE id = ?
      `;

      db.query(
        updateAdSql,
        [nextUsedVolume, nextUsedWeight, nextCapacity, row.truck_ad_id],
        (adUpdateErr) => {
          if (adUpdateErr) {
            console.error("Truck ad capacity update error:", adUpdateErr);
            return db.rollback(() =>
              callback({
                success: false,
                message: "Failed to update truck capacity",
              }),
            );
          }

          const normalizedUnit =
            capacityUnit === "volume" ? "volume" : "weight";

          const updateBookingSql = `
            UPDATE bookings
            SET status = 'Approved',
                capacity_unit = COALESCE(capacity_unit, ?)
            WHERE id = ?
          `;

          db.query(
            updateBookingSql,
            [normalizedUnit, bookingId],
            (bookingUpdateErr) => {
              if (bookingUpdateErr) {
                console.error("Booking approval update error:", bookingUpdateErr);
                return db.rollback(() =>
                  callback({
                    success: false,
                    message: "Failed to update booking status",
                  }),
                );
              }

              db.commit((commitErr) => {
                if (commitErr) {
                  console.error("Capacity commit error:", commitErr);
                  return db.rollback(() =>
                    callback({
                      success: false,
                      message: "Failed to commit capacity update",
                    }),
                  );
                }

                return callback({
                  success: true,
                  alreadyApplied: false,
                  booking: {
                    id: row.id,
                    truck_ad_id: row.truck_ad_id,
                    weight_requested: requestedAmount,
                    capacity_unit: normalizedUnit,
                  },
                  truck_ad: {
                    id: row.truck_ad_id,
                    current_used_volume: nextUsedVolume,
                    current_used_weight: nextUsedWeight,
                    capacity: nextCapacity,
                  },
                });
              });
            },
          );
        },
      );
    });
  });
}

app.post("/signup", (req, res) => {
  const { fullname, username, password, mobile, user_type } = req.body;

  const validationError = validateSignup(
    fullname,
    username,
    password,
    mobile,
    user_type,
  );
  if (validationError) {
    return res.json({ success: false, message: validationError });
  }

  const checkUser = "SELECT * FROM users WHERE username = ?";
  db.query(checkUser, [username], (err, result) => {
    if (err) return res.json({ success: false, message: "Database error" });
    if (result.length > 0) {
      return res.json({ success: false, message: "Username already exists" });
    }

    const sql = `
      INSERT INTO users (fullname, username, password, mobile, user_type)
      VALUES (?, ?, ?, ?, ?)
    `;
    db.query(sql, [fullname, username, password, mobile, user_type], (err2) => {
      if (err2)
        return res.json({
          success: false,
          message: "Database insert error",
        });
      res.json({ success: true, message: "Signup successful" });
    });
  });
});

app.post("/login", (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.json({
      success: false,
      message: "Username and password are required",
    });
  }

  const sql =
    "SELECT id, username, password, user_type FROM users WHERE BINARY username = ?";
  db.query(sql, [username], (err, result) => {
    if (err) return res.json({ success: false, message: "Database error" });
    if (result.length === 0) {
      return res.json({ success: false, message: "Username not found" });
    }

    const user = result[0];
    if (user.password !== password) {
      return res.json({ success: false, message: "Wrong password" });
    }

    res.json({
      success: true,
      message: "Login successful",
      username: user.username,
      user_id: user.id,
      user_type: user.user_type,
    });
  });
});

app.post("/postAd", (req, res) => {
  const {
    user_id,
    truck_type,
    truck_id,
    length,
    width,
    height,
    max_volume,
    max_weight,
    current_used_volume,
    current_used_weight,
    accepted_goods,
    restrictions,
    price,
    pickup_location,
    dropoff_location,
    district,
    final_request_date,
    note,
  } = req.body;

  if (!user_id || !truck_type || !pickup_location || !dropoff_location) {
    return res.json({ success: false, message: "Required fields missing." });
  }

  let goodsArray = [];

  try {
    goodsArray = Array.isArray(accepted_goods)
      ? accepted_goods
      : JSON.parse(accepted_goods || "[]");
  } catch {
    return res.json({
      success: false,
      message: "Invalid accepted goods format.",
    });
  }

  const insertAdSql = `
    INSERT INTO truck_ads (
      user_id, truck_type, truck_id, length, width, height,
      max_volume, max_weight, current_used_volume, current_used_weight,
      accepted_goods, restrictions, price,
      pickup_location, dropoff_location, district,
      final_request_date, note
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.query(
    insertAdSql,
    [
      user_id,
      truck_type,
      truck_id,
      length,
      width,
      height,
      max_volume,
      max_weight,
      current_used_volume,
      current_used_weight,
      JSON.stringify(goodsArray),
      restrictions,
      price,
      pickup_location,
      dropoff_location,
      district,
      final_request_date,
      note,
    ],
    (err, result) => {
      if (err) {
        console.error("Insert error:", err);
        return res.json({
          success: false,
          message: "Database error while inserting ad.",
        });
      }

      const newAdId = result.insertId;
      const owner_id = user_id;

      const ratingSql = `
        SELECT 
          AVG(
            (COALESCE(service,0) +
             COALESCE(behavior,0) +
             COALESCE(trust,0) +
             COALESCE(speed,0) +
             COALESCE(attitude,0)
            ) / 5
          ) AS rating
        FROM ratings
        WHERE truck_owner_id = ?
      `;

      db.query(ratingSql, [user_id], (err2, ratingResult) => {
        if (err2) {
          console.error("Rating error:", err2);
          return res.json({
            success: true,
            message: "The ad is posted successfully",
          });
        }

        const owner_rating = ratingResult?.[0]?.rating || 0;

        console.log("⭐ OWNER RATING =", owner_rating);

        if (owner_rating >= 3) {
          const rentersSql = `SELECT id FROM users WHERE LOWER(user_type) = 'customer'`;

          db.query(rentersSql, (err3, renters) => {
            if (err3) {
              console.error("Renters error:", err3);
              return res.json({
                success: true,
                message: "The ad is posted successfully",
              });
            }

            if (!renters.length) {
              return res.json({
                success: true,
                message: "The ad is posted successfully",
              });
            }

            let done = 0;

            renters.forEach((u) => {
              db.query(
                `INSERT INTO notifications (user_id, sender_id, type, body, truck_ad_id)
                 VALUES (?, ?, 'recommendation', ?, ?)`,
                [
                  u.id,
                  owner_id,
                  "New recommended ad from a highly rated truck owner",
                  newAdId,
                ],
                (err4) => {
                  if (err4) {
                    console.error("❌ Notification insert error:", err4);
                  } else {
                    console.log("✅ notification sent to:", u.id);
                  }

                  done++;

                  if (done === renters.length) {
                    console.log("🎉 ALL NOTIFICATIONS DONE");

                    return res.json({
                      success: true,
                      message: "The ad is posted successfully",
                    });
                  }
                }
              );
            });
          });
        } else {
          return res.json({
            success: true,
            message: "The ad is posted successfully",
          });
        }
      });
    }
  );
});
app.get("/dashboard-stats", (req, res) => {
  const user_id = req.query.user_id;

  if (!user_id) {
    return res.json({ success: false, message: "user_id is required." });
  }

  const sql = `
    SELECT
      (SELECT COUNT(*) FROM truck_ads WHERE user_id = ?) AS total_listings,
      (SELECT COUNT(*) FROM bookings 
         WHERE truck_ad_id IN (SELECT id FROM truck_ads WHERE user_id = ?) 
      ) AS total_bookings
  `;

  db.query(sql, [user_id, user_id], (err, result) => {
    if (err) {
      console.error("Error fetching dashboard stats:", err);
      return res.json({
        success: false,
        message: "Database error while fetching dashboard stats.",
      });
    }

    const stats = result[0] || {};

    res.json({
      success: true,
      total_listings: stats.total_listings || 0,
      total_bookings: stats.total_bookings || 0,
    });
  });
});

app.get("/api/dashboard/summary/:userId", (req, res) => {
  const userId = Number(req.params.userId);

  if (!userId) {
    return res.json({ success: false, message: "Invalid user id" });
  }

  const statsSql = `
    SELECT
      (SELECT COUNT(*) FROM truck_ads WHERE user_id = ?) AS total_listings,
      (SELECT COUNT(*)
       FROM bookings b
       INNER JOIN truck_ads ta ON b.truck_ad_id = ta.id
       WHERE ta.user_id = ?) AS total_bookings,
      (SELECT COUNT(*)
       FROM notifications
       WHERE user_id = ?
         AND is_read = 0
         AND (room_code IS NULL OR room_code NOT LIKE 'inquiry_%')
      ) AS unread_notifications
  `;

  const upcomingSql = `
    SELECT
      b.id,
      b.status,
      b.trip_date,
      b.booking_date,
      b.pickup_location,
      b.dropoff_location,
      b.price,
      b.weight_requested,
      ta.truck_type,
      ta.truck_id,
      u.fullname AS customer_name
    FROM bookings b
    INNER JOIN truck_ads ta ON b.truck_ad_id = ta.id
    INNER JOIN users u ON b.customer_id = u.id
    WHERE ta.user_id = ?
      AND LOWER(COALESCE(b.status, 'pending')) IN ('pending', 'approved', 'in transit')
    ORDER BY
      CASE
        WHEN LOWER(COALESCE(b.status, 'pending')) = 'approved' THEN 1
        WHEN LOWER(COALESCE(b.status, 'pending')) = 'in transit' THEN 2
        WHEN LOWER(COALESCE(b.status, 'pending')) = 'pending' THEN 3
        ELSE 4
      END,
      b.trip_date ASC,
      b.id DESC
    LIMIT 6
  `;

  const recentAlertsSql = `
    SELECT
      n.id,
      n.type,
      n.body,
      n.is_read,
      n.created_at,
      u.fullname AS sender_name
    FROM notifications n
    LEFT JOIN users u ON n.sender_id = u.id
    WHERE n.user_id = ?
      AND (n.room_code IS NULL OR n.room_code NOT LIKE 'inquiry_%')
    ORDER BY n.created_at DESC, n.id DESC
    LIMIT 5
  `;

  db.query(statsSql, [userId, userId, userId], (statsErr, statsRows) => {
    if (statsErr) {
      console.error("Dashboard stats summary error:", statsErr);
      return res.json({ success: false, message: "Database error" });
    }

    db.query(upcomingSql, [userId], (upcomingErr, upcomingRows) => {
      if (upcomingErr) {
        console.error("Dashboard upcoming error:", upcomingErr);
        return res.json({ success: false, message: "Database error" });
      }

      db.query(recentAlertsSql, [userId], (alertsErr, alertRows) => {
        if (alertsErr) {
          console.error("Dashboard alerts error:", alertsErr);
          return res.json({ success: false, message: "Database error" });
        }

        return res.json({
          success: true,
          stats: {
            total_listings: statsRows[0]?.total_listings || 0,
            total_bookings: statsRows[0]?.total_bookings || 0,
            unread_notifications: statsRows[0]?.unread_notifications || 0,
          },
          upcoming: upcomingRows || [],
          recent_alerts: alertRows || [],
        });
      });
    });
  });
});

app.get("/getAds", (req, res) => {
  const sql = `
    SELECT 
      ta.*,
      u.fullname,
      COALESCE(r.owner_rating, 0) AS owner_rating,
      COALESCE(r.rating_count, 0) AS rating_count
    FROM truck_ads ta
    LEFT JOIN users u ON ta.user_id = u.id
    LEFT JOIN (
      SELECT 
        truck_owner_id,
        ROUND(
          AVG(
            (
              COALESCE(service,0) +
              COALESCE(behavior,0) +
              COALESCE(trust,0) +
              COALESCE(speed,0) +
              COALESCE(attitude,0)
            ) / 5
          ), 2
        ) AS owner_rating,
        COUNT(*) AS rating_count
      FROM ratings
      GROUP BY truck_owner_id
    ) r ON r.truck_owner_id = ta.user_id
    WHERE
      GREATEST(
        COALESCE(ta.max_volume, 0) - COALESCE(ta.current_used_volume, 0),
        COALESCE(ta.max_weight, 0) - COALESCE(ta.current_used_weight, 0)
      ) > 0
    ORDER BY ta.id DESC;
  `;

  db.query(sql, (err, result) => {
    if (err) {
      console.error("Error fetching ads:", err);
      return res.json({ success: false, message: "Database error" });
    }

    console.log("GET ADS RESULT:", result);
    res.json({ success: true, ads: result });
  });
});

app.get("/getAd/:id", (req, res) => {
  const adId = req.params.id;

  const sql = `
    SELECT 
      truck_ads.*, 
      users.fullname
    FROM truck_ads
    JOIN users ON truck_ads.user_id = users.id
    WHERE truck_ads.id = ?
      AND GREATEST(
        COALESCE(truck_ads.max_volume, 0) - COALESCE(truck_ads.current_used_volume, 0),
        COALESCE(truck_ads.max_weight, 0) - COALESCE(truck_ads.current_used_weight, 0)
      ) > 0
    LIMIT 1
  `;

  db.query(sql, [adId], (err, result) => {
    if (err) {
      console.error("Error fetching ad details:", err);
      return res.json({ success: false, message: "Database error" });
    }

    if (result.length === 0) {
      return res.json({
        success: false,
        message: "Ad not found or no longer available",
      });
    }

    res.json({ success: true, ad: result[0] });
  });
});

app.post("/book", (req, res) => {
  const {
    customer_id,
    truck_ad_id,
    weight_requested,
    price,
    pickup_location,
    dropoff_location,
    route_distance,
    trip_date,
    capacityUnit,
  } = req.body;

  if (!customer_id || !truck_ad_id || !price || !trip_date) {
    return res.json({ success: false, message: "Missing fields" });
  }

  const normalizedUnit = String(capacityUnit || "").trim().toLowerCase();

  const storedUnit =
    ["volume", "m3", "vol", "cube"].includes(normalizedUnit)
      ? "volume"
      : "weight";

  const insertSql = `
    INSERT INTO bookings (
      customer_id,
      truck_ad_id,
      weight_requested,
      capacity_unit,
      price,
      pickup_location,
      dropoff_location,
      route_distance,
      trip_date
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.query(
    insertSql,
    [
      customer_id,
      truck_ad_id,
      weight_requested || null,
      storedUnit,
      price,
      pickup_location || null,
      dropoff_location || null,
      route_distance || null,
      trip_date,
    ],
    (err, result) => {
      if (err) {
        console.error(err);
        return res.json({ success: false });
      }

      const newBookingId = result.insertId;

      const ownerSql = `
        SELECT user_id FROM truck_ads WHERE id = ? LIMIT 1
      `;

      db.query(ownerSql, [truck_ad_id], (err2, rows) => {
        if (err2 || !rows.length) {
          return res.json({ success: false });
        }

        const ownerId = rows[0].user_id;
        const roomCode = `booking_${newBookingId}`;

        const createRoomSql = `
          INSERT INTO chat_rooms (
            room_code,
            owner_id,
            customer_id,
            truck_ad_id,
            booking_id,
            current_offer,
            deal_status,
            customer_accepted,
            owner_accepted
          )
          VALUES (?, ?, ?, ?, ?, ?, 'Pending', 0, 0)
        `;

        db.query(
          createRoomSql,
          [
            roomCode,
            ownerId,
            customer_id,
            truck_ad_id,
            newBookingId,
            Number(price),
          ],
          (err3) => {
            if (err3) {
              return res.json({ success: false });
            }

            createNotification({
              user_id: ownerId,
              sender_id: customer_id,
              type: "rental_request",
              body: `New booking request`,
              room_code: roomCode,
              booking_id: newBookingId,
              truck_ad_id,
            });

            return res.json({
              success: true,
              room_code: roomCode,
              booking_id: newBookingId,
            });
          }
        );
      });
    }
  );
});

app.get("/getRequests", (req, res) => {
  const sql = `
    SELECT truck_req.*, users.fullname
    FROM truck_req
    LEFT JOIN users ON truck_req.user_id = users.id
    ORDER BY truck_req.id DESC
  `;

  db.query(sql, (err, result) => {
    if (err) {
      console.error("Error fetching requests:", err);
      return res.json({ success: false, message: "Database error" });
    }

    res.json({ success: true, req: result });
  });
});

app.post("/addRequest", (req, res) => {
  const {
    user_id,
    truck_type,
    good_type,
    restrictions,
    good_weight,
    good_volume,
    quantity,
    packaging_method,
    pickup_location,
    dropoff_location,
    final_request_date,
    note,
  } = req.body;
  if (
    !user_id ||
    !pickup_location ||
    !dropoff_location ||
    !truck_type ||
    !restrictions
  ) {
    return res.json({
      success: false,
      message: "Missing required fields",
    });
  }

  const query = `
    INSERT INTO truck_req (
      user_id,truck_type,good_type,restrictions,good_weight,good_volume,quantity,packaging_method,
      pickup_location, dropoff_location, final_request_date, note
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  db.query(
    query,
    [
      user_id,
      truck_type,
      good_type,
      restrictions,
      good_weight,
      good_volume,
      quantity,
      packaging_method,
      pickup_location,
      dropoff_location,
      final_request_date,
      note,
    ],
    (err) => {
      if (err) {
        console.error("Insert request error:", err);
        return res.json({
          success: false,
          message: "Database error",
        });
      }
      res.json({
        success: true,
        message: "Request added successfully",
      });
    },
  );
});

app.post("/api/chat/create-inquiry-room", (req, res) => {
  return res.status(410).json({
    success: false,
    message: "Inquiry rooms are disabled. Use the booking room flow instead.",
  });
});

/* =========================================================
   CUSTOMER SHIPMENT TRACKING
   ========================================================= */

app.get("/api/my-shipments", (req, res) => {
  const customer_id = req.query.customer_id;

  if (!customer_id) {
    return res.json({ success: false, message: "customer_id is required" });
  }

  console.log("API /api/my-shipments HIT");
  console.log("customer_id =", customer_id);
  console.log("SQL uses approved + in transit");

  const sql = `
    SELECT
      b.id AS shipment_id,
      b.status,
      b.pickup_location,
      b.dropoff_location,
      b.pickup_lat,
      b.pickup_lng,
      b.dropoff_lat,
      b.dropoff_lng,
      b.route_distance,
      b.trip_date,
      b.booking_date,
      ta.truck_type,
      ta.truck_id,
      u.fullname AS truck_owner_name
    FROM bookings b
    JOIN truck_ads ta ON b.truck_ad_id = ta.id
    JOIN users u ON ta.user_id = u.id
    WHERE b.customer_id = ?
      AND LOWER(b.status) IN ('approved', 'in transit')
    ORDER BY b.booking_date DESC, b.id DESC
  `;

  db.query(sql, [customer_id], (err, rows) => {
    if (err) {
      console.error("Error fetching shipments:", err);
      return res.status(500).json({ success: false });
    }

    console.log("MY SHIPMENTS rows =", rows);

    return res.json({ success: true, shipments: rows || [] });
  });
});

app.get("/api/shipments/:shipmentId/location", (req, res) => {
  const { shipmentId } = req.params;

  if (!shipmentId) {
    return res.json({ success: false, message: "shipmentId is required" });
  }

  const sql = `
    SELECT shipment_id, lat, lng, updated_at
    FROM shipment_tracking
    WHERE shipment_id = ?
    LIMIT 1
  `;

  db.query(sql, [shipmentId], (err, rows) => {
    if (err) {
      console.error("Fetch shipment location error:", err);
      return res.status(500).json({ success: false, message: "Database error" });
    }

    if (!rows.length) {
      return res.json({
        success: false,
        message: "No tracking location found for this shipment",
      });
    }

    return res.json({
      success: true,
      shipment_id: rows[0].shipment_id,
      lat: rows[0].lat,
      lng: rows[0].lng,
      updatedAt: rows[0].updated_at,
    });
  });
});

const simTimers = {};
const DEFAULT_START = { lat: 24.7136, lng: 46.6753 };

function startShipmentSimulation(shipmentId) {
  if (!shipmentId) return;
  if (simTimers[shipmentId]) return;

  simTimers[shipmentId] = setInterval(() => {
    const driftLat = 0.0015;
    const driftLng = 0.001;
    const jitterLat = (Math.random() - 0.5) * 0.0006;
    const jitterLng = (Math.random() - 0.5) * 0.0006;

    db.query(
      `
      UPDATE shipment_tracking
      SET lat = lat + ?, lng = lng + ?
      WHERE shipment_id = ?
      `,
      [driftLat + jitterLat, driftLng + jitterLng, shipmentId],
      (err) => {
        if (err) {
          console.error(`Simulation update error for shipment ${shipmentId}:`, err);
        }
      },
    );
  }, 3001);

  console.log(`Simulation started for shipment ${shipmentId}`);
}

function stopShipmentSimulation(shipmentId) {
  if (simTimers[shipmentId]) {
    clearInterval(simTimers[shipmentId]);
    delete simTimers[shipmentId];
    console.log(`Simulation stopped for shipment ${shipmentId}`);
  }
}

function resumeActiveShipmentSimulations() {
  const sql = `
    SELECT
      b.id AS shipment_id,
      st.lat,
      st.lng
    FROM bookings b
    LEFT JOIN shipment_tracking st ON st.shipment_id = b.id
    WHERE LOWER(b.status) = 'in transit'
  `;

  db.query(sql, (err, rows) => {
    if (err) {
      console.error("Resume shipment simulations error:", err);
      return;
    }

    (rows || []).forEach((row) => {
      const shipmentId = row.shipment_id;

      const lat =
        row.lat != null ? Number(row.lat) : DEFAULT_START.lat;

      const lng =
        row.lng != null ? Number(row.lng) : DEFAULT_START.lng;

      const upsertSql = `
        INSERT INTO shipment_tracking (shipment_id, lat, lng)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE lat = VALUES(lat), lng = VALUES(lng)
      `;

      db.query(upsertSql, [shipmentId, lat, lng], (upsertErr) => {
        if (upsertErr) {
          console.error(`Tracking seed error for shipment ${shipmentId}:`, upsertErr);
          return;
        }

        startShipmentSimulation(shipmentId);
      });
    });

    console.log(`Resumed ${(rows || []).length} active shipment simulation(s).`);
  });
}

app.post("/api/sim/start/:shipmentId", (req, res) => {
  const { shipmentId } = req.params;

  const startLat =
    req.body && req.body.lat !== undefined
      ? Number(req.body.lat)
      : DEFAULT_START.lat;

  const startLng =
    req.body && req.body.lng !== undefined
      ? Number(req.body.lng)
      : DEFAULT_START.lng;

  if (Number.isNaN(startLat) || Number.isNaN(startLng)) {
    return res.json({ success: false });
  }

  const bookingSql = `
    SELECT id, customer_id, status, truck_ad_id
    FROM bookings
    WHERE id = ?
    LIMIT 1
  `;

  db.query(bookingSql, [shipmentId], (bookingErr, bookingRows) => {
    if (bookingErr) {
      console.error("Booking lookup error:", bookingErr);
      return res.status(500).json({ success: false });
    }

    if (!bookingRows.length) {
      return res.status(404).json({
        success: false,
        message: "Shipment not found",
      });
    }

    const booking = bookingRows[0];

    const upsertSql = `
      INSERT INTO shipment_tracking (shipment_id, lat, lng)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE lat = VALUES(lat), lng = VALUES(lng)
    `;

    db.query(upsertSql, [shipmentId, startLat, startLng], (err) => {
      if (err) return res.status(500).json({ success: false });

      startShipmentSimulation(shipmentId);

      if (String(booking.status).trim().toLowerCase() === "approved") {
        db.query(
          `
          UPDATE bookings
          SET status = 'in transit'
          WHERE id = ?
          `,
          [shipmentId],
          (updateErr) => {
            if (updateErr) {
              console.error("Booking status update error:", updateErr);
              return res.json({ success: true });
            }

            createNotification({
              user_id: booking.customer_id,
              sender_id: null,
              type: "shipment_started",
              body: "Your shipment has started moving and is now in transit.",
              booking_id: booking.id,
              truck_ad_id: booking.truck_ad_id,
            });

            return res.json({ success: true });
          },
        );
      } else {
        return res.json({ success: true });
      }
    });
  });
});

app.post("/api/sim/stop/:shipmentId", (req, res) => {
  const { shipmentId } = req.params;

  stopShipmentSimulation(shipmentId);

  return res.json({ success: true });
});

app.post("/api/shipment/:id/delivered", (req, res) => {
  const { id } = req.params;

  db.query(
    "UPDATE bookings SET status = 'delivered' WHERE id = ?",
    [id],
    (err) => {
      if (err) {
        console.error("Delivered update error:", err);
        return res.json({ success: false });
      }

      stopShipmentSimulation(id);

      res.json({ success: true });
    },
  );
});

app.post("/api/sim/update/:shipmentId", (req, res) => {
  const { shipmentId } = req.params;
  const { lat, lng } = req.body;

  if (lat == null || lng == null) {
    return res.json({ success: false, message: "lat/lng required" });
  }

  const sql = `
    INSERT INTO shipment_tracking (shipment_id, lat, lng)
    VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE lat = VALUES(lat), lng = VALUES(lng)
  `;

  db.query(sql, [shipmentId, lat, lng], (err) => {
    if (err) {
      console.error("Sim update error:", err);
      return res.status(500).json({ success: false });
    }

    res.json({ success: true });
  });
});

app.post("/addOffer", (req, res) => {
  const {
    owner_id,
    truck_req_id,
    fullname,
    truck_id,
    truck_type,
    truck_departure_date,
  } = req.body;

  console.log("ADD OFFER BODY:", req.body);

  if (
    !owner_id ||
    !truck_req_id ||
    !fullname ||
    !truck_id ||
    !truck_type ||
    !truck_departure_date
  ) {
    console.log("ADD OFFER: missing required fields");
    return res.json({
      success: false,
      message: "Missing required fields",
    });
  }

  const sql = `
    INSERT INTO offers (
      owner_id,
      truck_req_id,
      fullname,
      truck_id,
      truck_type,
      truck_departure_date
    )
    VALUES (?, ?, ?, ?, ?, ?)
  `;

  db.query(
    sql,
    [
      owner_id,
      truck_req_id,
      fullname,
      truck_id,
      truck_type,
      truck_departure_date,
    ],
    (err, result) => {
      if (err) {
        console.error("Add offer error:", err);
        return res.json({
          success: false,
          message: "Database error",
        });
      }

      const offerId = result.insertId;
      console.log("ADD OFFER SUCCESS, offerId =", offerId);

      const getRequestSql = `
        SELECT id, user_id
        FROM truck_req
        WHERE id = ?
        LIMIT 1
      `;

      db.query(getRequestSql, [truck_req_id], (reqErr, rows) => {
        if (reqErr) {
          console.error("Fetch request owner error:", reqErr);
          return res.json({
            success: false,
            message: "Failed to fetch request owner",
          });
        }

        console.log("REQUEST OWNER ROWS:", rows);

        if (!rows.length) {
          console.error("No truck request found for id:", truck_req_id);
          return res.json({
            success: false,
            message: "Request not found",
          });
        }

        const customerId = rows[0].user_id;
        console.log("CUSTOMER ID FOR NOTIFICATION:", customerId);

        createNotification({
          user_id: customerId,
          sender_id: owner_id,
          type: "offer",
          body: `Offer from ${fullname} | Truck: ${truck_type} | Departure: ${truck_departure_date}`,
          offer_id: offerId,
          truck_ad_id: truck_req_id,
        });

        console.log("createNotification CALLED");

        return res.json({
          success: true,
          message: "Offer sent successfully",
          offer_id: offerId,
        });
      });
    },
  );
});

app.patch("/api/offers/:id/status", (req, res) => {
  const { id } = req.params;
  const { status, sender_id } = req.body;

  if (!id || !status) {
    return res.json({ success: false, message: "Missing data" });
  }

  const allowed = ["Accepted", "Rejected"];
  if (!allowed.includes(status)) {
    return res.json({ success: false, message: "Invalid status" });
  }

  const sql = "UPDATE offers SET status = ? WHERE id = ?";

  db.query(sql, [status, id], (err) => {
    if (err) {
      console.error("Update offer error:", err);
      return res.json({ success: false, message: "Database error" });
    }

    const getOfferSql = `
      SELECT o.owner_id, tr.user_id AS customer_id
      FROM offers o
      JOIN truck_req tr ON o.truck_req_id = tr.id
      WHERE o.id = ?
      LIMIT 1
    `;

    db.query(getOfferSql, [id], (err2, rows) => {
      if (err2 || !rows.length) {
        console.error("Fetch offer error:", err2);
        return res.json({ success: true });
      }

      const offer = rows[0];

      const targetUserId =
        Number(sender_id) === Number(offer.owner_id)
          ? offer.customer_id
          : offer.owner_id;

      createNotification({
        user_id: targetUserId,
        sender_id: sender_id,
        type: status === "Accepted" ? "approved" : "rejected",
        body: `Offer has been ${status}`,
        offer_id: id,
      });

      res.json({ success: true, message: "Offer updated" });
    });
  });
});

/* =========================================================
   REAL TIME CHAT ROOM
   ========================================================= */

app.get("/api/chat/room/:roomCode", (req, res) => {
  const { roomCode } = req.params;

  const sql = `
  SELECT
    cr.room_code,
    cr.booking_id,
    cr.truck_ad_id,
    cr.customer_id,
    cr.owner_id,
    cr.current_offer,
    cr.deal_status,
    cr.customer_accepted,
    cr.owner_accepted,
    b.price AS booking_price
  FROM chat_rooms cr
  LEFT JOIN bookings b ON cr.booking_id = b.id
  WHERE cr.room_code = ?
  LIMIT 1
  `;

  db.query(sql, [roomCode], (err, rows) => {
    if (err) {
      console.error("Chat room fetch error:", err);
      return res.json({ success: false, message: "Database error" });
    }

    if (!rows.length) {
      return res.json({
        success: true,
        room: {
          room_code: roomCode,
          current_offer: null,
          deal_status: "Pending",
        },
      });
    }

    res.json({ success: true, room: rows[0] });
  });
});

app.get("/api/chat/messages/:roomCode", (req, res) => {
  const { roomCode } = req.params;

  const sql = `
  SELECT
    cm.id,
    cm.room_code,
    cm.sender_id,
    cm.message_text,
    cm.message_type,
    cm.created_at,
    cm.client_msg_id,
    cm.delivered_to_receiver,
    cm.is_seen,
    cm.seen_at,
    u.fullname AS sender_name
  FROM chat_messages cm
  LEFT JOIN users u ON cm.sender_id = u.id
  WHERE cm.room_code = ?
  ORDER BY cm.created_at ASC, cm.id ASC
  `;

  db.query(sql, [roomCode], (err, rows) => {
    if (err) {
      console.error("Chat messages fetch error:", err);
      return res.json({ success: false, message: "Database error" });
    }

    res.json({ success: true, messages: rows || [] });
  });
});

io.on("connection", (socket) => {
  console.log("User connected to socket:", socket.id);

  socket.on("typing_start", ({ roomCode, senderId }) => {
    if (!roomCode || !senderId) return;

    socket.to(roomCode).emit("typing_start", {
      roomCode,
      senderId,
    });
  });

  socket.on("typing_stop", ({ roomCode, senderId }) => {
    if (!roomCode || !senderId) return;

    socket.to(roomCode).emit("typing_stop", {
      roomCode,
      senderId,
    });
  });

  socket.on("join_user_room", (userId) => {
    if (!userId) return;
    socket.join(`user_${userId}`);
    console.log(`Socket ${socket.id} joined user room: user_${userId}`);
  });

  socket.on("join_room", (payload) => {
    const roomCode =
      typeof payload === "string" ? payload : payload?.roomCode || null;

    const userId =
      typeof payload === "object" && payload?.userId
        ? Number(payload.userId)
        : null;

    if (!roomCode) return;

    socket.join(roomCode);

    if (userId) {
      socket.userId = userId;
    }

    socket.currentRoomCode = roomCode;

    console.log(`Socket ${socket.id} joined chat room: ${roomCode}`);
  });

  socket.on("send_message", (data) => {
    const roomCode = data.roomCode;
    const senderId = data.senderId;
    const text = data.text;
    const messageType = data.messageType || "text";
    const offerValue = data.offerValue ?? null;

    if (!roomCode || !senderId || !text) return;

    const roomInfoSql = `
      SELECT room_code, customer_id, owner_id, booking_id, truck_ad_id, current_offer, deal_status
      FROM chat_rooms
      WHERE room_code = ?
      LIMIT 1
    `;

    db.query(roomInfoSql, [roomCode], (roomInfoErr, roomInfoRows) => {
      if (roomInfoErr) {
        console.error("Room info lookup error:", roomInfoErr);
        return;
      }

      if (!roomInfoRows.length) {
        console.error("Chat room not found:", roomCode);
        return;
      }

      const room = roomInfoRows[0];

      if (
        (room.deal_status === "Accepted" || room.deal_status === "Rejected") &&
        messageType !== "text"
      ) {
        socket.emit("message_blocked", {
          reason: "This booking is already finalized.",
        });
        return;
      }

      if (
        messageType === "offer" &&
        (room.deal_status === "Accepted" || room.deal_status === "Rejected")
      ) {
        socket.emit("message_blocked", {
          reason: "Negotiation is closed. No more offers can be sent.",
        });
        return;
      }

      const insertMsgSql = `
        INSERT INTO chat_messages (room_code, sender_id, message_type, message_text)
        VALUES (?, ?, ?, ?)
      `;

      db.query(
        insertMsgSql,
        [roomCode, senderId, messageType, text],
        (msgErr, msgResult) => {
          if (msgErr) {
            console.error("Insert message error:", msgErr);
            return;
          }

          const afterInsert = () => {
            const getSenderSql = `
              SELECT fullname
              FROM users
              WHERE id = ?
              LIMIT 1
            `;

            db.query(getSenderSql, [senderId], (userErr, userRows) => {
              const senderName =
                !userErr && userRows.length ? userRows[0].fullname : "User";

              const payload = {
                id: msgResult.insertId,
                room_code: roomCode,
                sender_id: senderId,
                sender_name: senderName,
                message_text: text,
                message_type: messageType,
                created_at: new Date().toISOString(),
              };

              io.to(roomCode).emit("receive_message", payload);

              const targetUserId =
                Number(senderId) === Number(room.owner_id)
                  ? room.customer_id
                  : room.owner_id;

              createNotification({
                user_id: targetUserId,
                sender_id: senderId,
                type: "message",
                body: text,
                room_code: room.room_code,
                booking_id: room.booking_id,
                truck_ad_id: room.truck_ad_id,
              });
            });
          };

          if (messageType === "offer" && offerValue != null) {
            const updateOfferSql = `
              UPDATE chat_rooms
              SET current_offer = ?
              WHERE room_code = ?
            `;

            db.query(updateOfferSql, [offerValue, roomCode], (offerErr) => {
              if (offerErr) {
                console.error("Update current offer error:", offerErr);
                return;
              }

              afterInsert();
            });
          } else {
            afterInsert();
          }
        },
      );
    });
  });

  socket.on("update_status", (data) => {
    const { roomCode, senderId, status } = data || {};

    if (!roomCode || !senderId || !status) return;

    const allowed = ["Accepted", "Rejected"];
    if (!allowed.includes(status)) return;

    const getRoomSql = `
      SELECT room_code, customer_id, owner_id, booking_id, truck_ad_id,
             customer_accepted, owner_accepted, current_offer, deal_status
      FROM chat_rooms
      WHERE room_code = ?
      LIMIT 1
    `;

    db.query(getRoomSql, [roomCode], (roomErr, roomRows) => {
      if (roomErr) {
        console.error("Fetch room before status update error:", roomErr);
        return;
      }

      if (!roomRows.length) {
        console.error("Chat room not found for status update:", roomCode);
        return;
      }

      const room = roomRows[0];
      const currentStatus = String(room.deal_status || "").trim();

      if (!room.booking_id) {
        socket.emit("message_blocked", {
          reason:
            "This room has no real booking and cannot be approved or rejected.",
        });
        return;
      }

      if (currentStatus === "Accepted" || currentStatus === "Rejected") {
        socket.emit("message_blocked", {
          reason: `This booking is already ${currentStatus.toLowerCase()}.`,
        });

        io.to(roomCode).emit("status_updated", {
          roomCode,
          status: currentStatus,
          acceptedBy: null,
        });

        return;
      }

      if (status === "Rejected") {
        const rejectSql = `
          UPDATE chat_rooms
          SET deal_status = 'Rejected',
              customer_accepted = 0,
              owner_accepted = 0
          WHERE room_code = ?
            AND deal_status NOT IN ('Accepted', 'Rejected')
        `;

        db.query(rejectSql, [roomCode], (err, result) => {
          if (err) {
            console.error("Reject status update error:", err);
            return;
          }

          if (!result.affectedRows) {
            socket.emit("message_blocked", {
              reason: "This booking is already finalized.",
            });
            return;
          }

          io.to(roomCode).emit("status_updated", {
            roomCode,
            status: "Rejected",
            acceptedBy: null,
          });

          const targetUserId =
            Number(senderId) === Number(room.owner_id)
              ? room.customer_id
              : room.owner_id;

          createNotification({
            user_id: targetUserId,
            sender_id: senderId,
            type: "rejected",
            body: "The negotiation has been rejected.",
            room_code: room.room_code,
            booking_id: room.booking_id,
            truck_ad_id: room.truck_ad_id,
          });
        });

        return;
      }

      let customerAccepted = Number(room.customer_accepted) || 0;
      let ownerAccepted = Number(room.owner_accepted) || 0;

      if (Number(senderId) === Number(room.customer_id)) {
        customerAccepted = 1;
      } else if (Number(senderId) === Number(room.owner_id)) {
        ownerAccepted = 1;
      } else {
        console.error("Sender is neither customer nor owner:", senderId);
        return;
      }

      const updateFlagsSql = `
        UPDATE chat_rooms
        SET customer_accepted = ?, owner_accepted = ?
        WHERE room_code = ?
          AND deal_status NOT IN ('Accepted', 'Rejected')
      `;

      db.query(
        updateFlagsSql,
        [customerAccepted, ownerAccepted, roomCode],
        (flagsErr, flagsResult) => {
          if (flagsErr) {
            console.error("Update acceptance flags error:", flagsErr);
            return;
          }

          if (!flagsResult.affectedRows) {
            socket.emit("message_blocked", {
              reason: "This booking is already finalized.",
            });
            return;
          }

          if (customerAccepted && ownerAccepted) {
            const finalPrice = Number(room.current_offer) || 0;

            const acceptSql = `
              UPDATE chat_rooms
              SET deal_status = 'Accepted'
              WHERE room_code = ?
                AND deal_status NOT IN ('Accepted', 'Rejected')
            `;

            db.query(acceptSql, [roomCode], (acceptErr, acceptResult) => {
              if (acceptErr) {
                console.error("Final accept update error:", acceptErr);
                return;
              }

              if (!acceptResult.affectedRows) {
                socket.emit("message_blocked", {
                  reason: "This booking is already finalized.",
                });
                return;
              }

              reduceCapacityOnApprovedBooking(
                room.booking_id,
                (approvalResult) => {
                  if (!approvalResult?.success) {
                    console.error(
                      "Capacity reduction on socket approval failed:",
                      approvalResult?.message,
                    );

                    socket.emit("message_blocked", {
                      reason:
                        approvalResult?.message ||
                        "Booking approval failed because there is no remaining capacity.",
                    });

                    return;
                  }

                  db.query(
                    "UPDATE bookings SET price = ? WHERE id = ?",
                    [finalPrice, room.booking_id],
                    (bookingErr) => {
                      if (bookingErr) {
                        console.error(
                          "Update booking price error:",
                          bookingErr,
                        );
                        return;
                      }

                      io.to(roomCode).emit("status_updated", {
                        roomCode,
                        status: "Accepted",
                        acceptedBy: senderId,
                        bookingId: room.booking_id,
                        agreedPrice: finalPrice,
                        capacityUpdated: true,
                        truckAd: approvalResult.truck_ad || null,
                      });

                      const targetUserId =
                        Number(senderId) === Number(room.owner_id)
                          ? room.customer_id
                          : room.owner_id;

                      createNotification({
                        user_id: targetUserId,
                        sender_id: senderId,
                        type: "approved",
                        body: `Both parties approved the deal at ${finalPrice} SAR.`,
                        room_code: room.room_code,
                        booking_id: room.booking_id,
                        truck_ad_id: room.truck_ad_id,
                      });
                    },
                  );
                },
              );
            });
          } else {
            io.to(roomCode).emit("status_updated", {
              roomCode,
              status: "Waiting",
              acceptedBy: senderId,
              bookingId: room.booking_id,
            });
          }
        },
      );
    });
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

/* =========================================================
   NOTIFICATIONS API
   ========================================================= */

app.get("/api/notifications/:userId", (req, res) => {
  const userId = Number(req.params.userId);

  if (!userId) {
    return res.json({ success: false, message: "Invalid user id" });
  }

  const sql = `
  SELECT
    n.id,
    n.user_id,
    n.sender_id,
    n.type,
    n.body,
    n.room_code,
    n.booking_id,
    n.truck_ad_id,
    n.offer_id,
    n.is_read,
    n.created_at,
    u.fullname AS sender_name,
    COALESCE(tr.pickup_location, ta.pickup_location) AS pickup_location,
    COALESCE(tr.dropoff_location, ta.dropoff_location) AS dropoff_location,
    COALESCE(tr.good_type, NULL) AS good_type,
    cr.current_offer,
    b.price AS booking_price,
    b.weight_requested AS booked_capacity,
    ta.max_volume,
    ta.max_weight,
    o.truck_type,
    o.truck_departure_date
  FROM notifications n
  LEFT JOIN offers o ON n.offer_id = o.id
  LEFT JOIN users u ON n.sender_id = u.id
  LEFT JOIN truck_ads ta ON n.truck_ad_id = ta.id
  LEFT JOIN truck_req tr ON n.truck_ad_id = tr.id
  LEFT JOIN chat_rooms cr ON n.room_code = cr.room_code
  LEFT JOIN bookings b ON n.booking_id = b.id
  WHERE n.user_id = ?
    AND (
      n.room_code IS NULL
      OR ? IN (cr.owner_id, cr.customer_id)
    )
    AND (
      n.room_code IS NULL
      OR n.room_code NOT LIKE 'inquiry_%'
    )
  ORDER BY n.created_at DESC, n.id DESC
  `;

  db.query(sql, [userId, userId], (err, rows) => {
    if (err) {
      console.error("Fetch notifications error:", err);
      return res.json({ success: false, message: "Database error" });
    }

    return res.json({ success: true, notifications: rows || [] });
  });
});

app.delete("/api/notifications/:id", (req, res) => {
  const { id } = req.params;

  const sql = "DELETE FROM notifications WHERE id = ?";

  db.query(sql, [id], (err) => {
    if (err) {
      console.error("Delete notification error:", err);
      return res.json({ success: false });
    }

    res.json({ success: true });
  });
});

app.patch("/api/notifications/:id/read", (req, res) => {
  const id = Number(req.params.id);

  if (!id) {
    return res.json({ success: false, message: "Invalid notification id" });
  }

  db.query(
    "UPDATE notifications SET is_read = 1 WHERE id = ?",
    [id],
    (err, result) => {
      if (err) {
        console.error("Mark read error:", err);
        return res.json({ success: false, message: "Database error" });
      }

      return res.json({
        success: true,
        message: "Notification marked as read",
        affectedRows: result.affectedRows,
      });
    },
  );
});

app.patch("/api/notifications/room/:roomCode/read", (req, res) => {
  const { roomCode } = req.params;
  const { userId } = req.body || {};

  if (!roomCode || !userId) {
    return res.json({
      success: false,
      message: "roomCode and userId are required",
    });
  }

  const sql = `
    UPDATE notifications
    SET is_read = 1
    WHERE room_code = ?
      AND user_id = ?
      AND is_read = 0
  `;

  db.query(sql, [roomCode, userId], (err, result) => {
    if (err) {
      console.error("Mark room notifications read error:", err);
      return res.json({ success: false, message: "Database error" });
    }

    return res.json({
      success: true,
      affectedRows: result.affectedRows,
    });
  });
});

app.patch("/api/notifications/mark-all/:userId", (req, res) => {
  const userId = Number(req.params.userId);

  if (!userId) {
    return res.json({ success: false, message: "Invalid user id" });
  }

  db.query(
    "UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0",
    [userId],
    (err, result) => {
      if (err) {
        console.error("Mark all read error:", err);
        return res.json({ success: false, message: "Database error" });
      }

      return res.json({
        success: true,
        message: "All notifications marked as read",
        affectedRows: result.affectedRows,
      });
    },
  );
});

app.patch("/api/chat/messages/:roomCode/seen", (req, res) => {
  const { roomCode } = req.params;
  const { viewerId } = req.body || {};

  if (!roomCode || !viewerId) {
    return res.json({
      success: false,
      message: "roomCode and viewerId are required",
    });
  }

  const sql = `
    UPDATE chat_messages
    SET is_seen = 1,
        seen_at = NOW()
    WHERE room_code = ?
      AND sender_id <> ?
      AND is_seen = 0
  `;

  db.query(sql, [roomCode, viewerId], (err, result) => {
    if (err) {
      console.error("Mark seen error:", err);
      return res.json({ success: false, message: "Database error" });
    }

    io.to(roomCode).emit("messages_seen", {
      roomCode,
      seenBy: viewerId,
    });

    res.json({
      success: true,
      affectedRows: result.affectedRows,
    });
  });
});

app.delete("/api/chat/messages/:roomCode", (req, res) => {
  const { roomCode } = req.params;
  const { requesterId } = req.body || {};

  if (!roomCode || !requesterId) {
    return res.json({
      success: false,
      message: "roomCode and requesterId are required",
    });
  }

  const roomSql = `
    SELECT owner_id, customer_id
    FROM chat_rooms
    WHERE room_code = ?
    LIMIT 1
  `;

  db.query(roomSql, [roomCode], (roomErr, roomRows) => {
    if (roomErr || !roomRows.length) {
      return res.json({ success: false, message: "Chat room not found" });
    }

    const room = roomRows[0];

    if (
      ![Number(room.owner_id), Number(room.customer_id)].includes(
        Number(requesterId),
      )
    ) {
      return res.json({ success: false, message: "Unauthorized" });
    }

    db.query(
      `DELETE FROM chat_messages WHERE room_code = ?`,
      [roomCode],
      (delErr) => {
        if (delErr) {
          console.error("Clear chat error:", delErr);
          return res.json({ success: false, message: "Database error" });
        }

        io.to(roomCode).emit("chat_cleared", { roomCode });

        return res.json({ success: true, message: "Chat cleared" });
      },
    );
  });
});

app.patch("/api/chat/room/:roomCode/status", (req, res) => {
  const { roomCode } = req.params;
  const { status, senderId } = req.body || {};

  if (!roomCode || !status) {
    return res.json({
      success: false,
      message: "roomCode and status are required",
    });
  }

  const allowed = ["Pending", "Accepted", "Rejected"];
  if (!allowed.includes(status)) {
    return res.json({ success: false, message: "Invalid status value" });
  }

  const getRoomSql = `
    SELECT room_code, customer_id, owner_id, booking_id, truck_ad_id,
           customer_accepted, owner_accepted, current_offer, deal_status
    FROM chat_rooms
    WHERE room_code = ?
    LIMIT 1
  `;

  db.query(getRoomSql, [roomCode], (err, rows) => {
    if (err) {
      console.error("Fetch chat room error:", err);
      return res.json({ success: false, message: "Database error" });
    }

    if (!rows.length) {
      return res.json({ success: false, message: "Chat room not found" });
    }

    const room = rows[0];
    const currentStatus = String(room.deal_status || "").trim();

    if (!room.booking_id) {
      return res.json({
        success: false,
        message:
          "This room has no real booking and cannot be approved or rejected.",
      });
    }

    if (currentStatus === "Accepted" || currentStatus === "Rejected") {
      return res.json({
        success: false,
        message: `This booking is already ${currentStatus.toLowerCase()}.`,
      });
    }

    if (status === "Accepted") {
      db.query(
        `
        UPDATE chat_rooms
        SET deal_status = 'Accepted',
            owner_accepted = 1,
            customer_accepted = 1
        WHERE room_code = ?
          AND deal_status NOT IN ('Accepted', 'Rejected')
        `,
        [roomCode],
        (updateErr, updateResult) => {
          if (updateErr) {
            console.error("Update chat room status error:", updateErr);
            return res.json({ success: false, message: "Database error" });
          }

          if (!updateResult.affectedRows) {
            return res.json({
              success: false,
              message: "This booking is already finalized.",
            });
          }

          const finalPrice = Number(room.current_offer) || 0;

          reduceCapacityOnApprovedBooking(room.booking_id, (approvalResult) => {
            if (!approvalResult?.success) {
              return res.json({
                success: false,
                message:
                  approvalResult?.message ||
                  "Booking approval failed because there is no remaining capacity",
              });
            }

            db.query(
              "UPDATE bookings SET price = ? WHERE id = ?",
              [finalPrice, room.booking_id],
              (bookingErr) => {
                if (bookingErr) {
                  console.error("Update booking price error:", bookingErr);
                  return res.json({
                    success: false,
                    message: "Database error",
                  });
                }

                const targetUserId =
                  Number(senderId) === Number(room.owner_id)
                    ? room.customer_id
                    : room.owner_id;

                createNotification({
                  user_id: targetUserId,
                  sender_id: senderId || null,
                  type: "approved",
                  body: `Both parties approved the deal at ${finalPrice} SAR.`,
                  room_code: room.room_code,
                  booking_id: room.booking_id,
                  truck_ad_id: room.truck_ad_id,
                });

                io.to(roomCode).emit("status_updated", {
                  roomCode,
                  status: "Accepted",
                  acceptedBy: senderId,
                  capacityUpdated: true,
                  truckAd: approvalResult.truck_ad || null,
                });

                return res.json({
                  success: true,
                  message: "Booking approved successfully",
                  truck_ad: approvalResult.truck_ad || null,
                });
              },
            );
          });
        },
      );

      return;
    }

    db.query(
      `
      UPDATE chat_rooms
      SET deal_status = 'Rejected',
          customer_accepted = 0,
          owner_accepted = 0
      WHERE room_code = ?
        AND deal_status NOT IN ('Accepted', 'Rejected')
      `,
      [roomCode],
      (updateErr, updateResult) => {
        if (updateErr) {
          console.error("Update chat room status error:", updateErr);
          return res.json({ success: false, message: "Database error" });
        }

        if (!updateResult.affectedRows) {
          return res.json({
            success: false,
            message: "This booking is already finalized.",
          });
        }

        const targetUserId =
          Number(senderId) === Number(room.owner_id)
            ? room.customer_id
            : room.owner_id;

        createNotification({
          user_id: targetUserId,
          sender_id: senderId || null,
          type: "rejected",
          body: "The negotiation has been rejected.",
          room_code: room.room_code,
          booking_id: room.booking_id,
          truck_ad_id: room.truck_ad_id,
        });

        io.to(roomCode).emit("status_updated", {
          roomCode,
          status: "Rejected",
          acceptedBy: senderId || null,
        });

        return res.json({
          success: true,
          message: "Chat room status updated",
        });
      },
    );
  });
});

/* =========================================================
   RATINGS
   ========================================================= */

app.get("/api/delivered-bookings", (req, res) => {
  const customerId = req.query.customer_id;

  if (!customerId) {
    return res.status(400).json({
      success: false,
      message: "customer_id is required",
    });
  }

  const sql = `
    SELECT 
      b.*,
      b.is_rated,
      u.id AS truck_owner_id,
      u.username AS truck_owner_name
    FROM bookings b
    JOIN truck_ads t ON b.truck_ad_id = t.id
    JOIN users u ON t.user_id = u.id
    WHERE b.customer_id = ?
      AND LOWER(TRIM(b.status)) = 'delivered'
    ORDER BY b.booking_date DESC
  `;

  db.query(sql, [customerId], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({
        success: false,
        message: "Database error",
      });
    }

    res.json({
      success: true,
      bookings: results,
    });
  });
});

app.post("/ratings", (req, res) => {
  const {
    booking_id,
    customer_id,
    service,
    behavior,
    trust,
    speed,
    attitude,
  } = req.body;

  if (!booking_id || !customer_id) {
    return res.status(400).json({
      success: false,
      message: "booking_id and customer_id are required",
    });
  }

  const scores = [service, behavior, trust, speed, attitude].map(Number);

  const invalidScore = scores.some(
    (score) => !Number.isInteger(score) || score < 1 || score > 5
  );

  if (invalidScore) {
    return res.status(400).json({
      success: false,
      message: "All rating values must be integers between 1 and 5",
    });
  }

  const bookingCheckSql = `
    SELECT
      b.id,
      b.customer_id,
      b.status,
      b.is_rated,
      ta.user_id AS truck_owner_id
    FROM bookings b
    JOIN truck_ads ta ON b.truck_ad_id = ta.id
    WHERE b.id = ?
    LIMIT 1
  `;

  db.query(bookingCheckSql, [booking_id], (err, rows) => {
    if (err) {
      console.error("Booking check error:", err);
      return res.status(500).json({
        success: false,
        message: "Database error",
      });
    }

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    const booking = rows[0];

    if (Number(booking.customer_id) !== Number(customer_id)) {
      return res.status(403).json({
        success: false,
        message: "You can only rate your own delivered shipment",
      });
    }

    if (String(booking.status).trim().toLowerCase() !== "delivered") {
      return res.status(400).json({
        success: false,
        message: "Only delivered shipments can be rated",
      });
    }

    if (Number(booking.is_rated) === 1) {
      return res.status(400).json({
        success: false,
        message: "This shipment has already been rated",
      });
    }

    const insertSql = `
      INSERT INTO ratings (
        booking_id,
        customer_id,
        truck_owner_id,
        service,
        behavior,
        trust,
        speed,
        attitude
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.query(
      insertSql,
      [
        booking_id,
        customer_id,
        booking.truck_owner_id,
        scores[0],
        scores[1],
        scores[2],
        scores[3],
        scores[4],
      ],
      (insertErr) => {
        if (insertErr) {
          console.error("Insert rating error:", insertErr);
          return res.status(500).json({
            success: false,
            message: "Failed to save rating",
          });
        }

        db.query(
          `UPDATE bookings SET is_rated = 1 WHERE id = ?`,
          [booking_id],
          (updateErr) => {
            if (updateErr) {
              console.error("Update booking is_rated error:", updateErr);
              return res.status(500).json({
                success: false,
                message: "Rating saved but booking flag update failed",
              });
            }

            return res.json({ success: true });
          }
        );
      }
    );
  });
});

app.get("/api/ratings/:ownerId", (req, res) => {
  const ownerId = req.params.ownerId;

  const sql = `
    SELECT 
      ROUND(AVG(
        (service + behavior + trust + speed + attitude) / 5
      ), 2) AS overall_rating,
      COUNT(*) AS total_ratings
    FROM ratings
    WHERE truck_owner_id = ?
  `;

  db.query(sql, [ownerId], (err, rows) => {
    if (err) {
      console.error("DB ERROR:", err);
      return res.status(500).json({ message: err.message });
    }

    const result = rows[0];

    res.json({
      success: true,
      rating: {
        overall_rating: result?.overall_rating || 0,
        total_ratings: result?.total_ratings || 0,
      },
    });
  });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  resumeActiveShipmentSimulations();
});