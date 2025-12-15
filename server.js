const express = require("express");
const mysql = require("mysql");
const bodyParser = require("body-parser");
const cors = require("cors");
const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/HTML/HomePage.html");
});


//singlton part
let dbInstance = null;
function getDBConnection() {
  if (!dbInstance) {
    dbInstance = mysql.createConnection({
      host: "localhost",
      user: "root",
      password: "root",
      database: "logistical_rental_space",
      port: 8889,
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
//end singleton part



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

app.post("/signup", (req, res) => {
  const { fullname, username, password, mobile, user_type } = req.body;

  const validationError = validateSignup(
    fullname,
    username,
    password,
    mobile,
    user_type
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
    price_per_m3,
    price_per_kg,
    price_per_km,
    pickup_location,
    dropoff_location,
    district,
    final_request_date,
    note,
  } = req.body;

  if (!user_id || !truck_type || !pickup_location || !dropoff_location) {
    return res.json({ success: false, message: "Required fields missing." });
  }

  const numericFields = {
    price_per_m3,
    price_per_kg,
    price_per_km,
    length,
    width,
    height,
    max_volume,
    max_weight,
    current_used_volume,
    current_used_weight,
  };
  for (const [key, value] of Object.entries(numericFields)) {
    if (value && (isNaN(value) || value < 0)) {
      return res.json({
        success: false,
        message: `${key.replace(/_/g, " ")} must be a valid positive number.`,
      });
    }
  }

  if (restrictions && restrictions.length > 300) {
    return res.json({
      success: false,
      message: "Restrictions too long (max 300 chars).",
    });
  }
  if (note && note.length > 500) {
    return res.json({
      success: false,
      message: "Note too long (max 500 chars).",
    });
  }

  if (final_request_date && new Date(final_request_date) < new Date()) {
    return res.json({
      success: false,
      message: "Final request date cannot be in the past.",
    });
  }

  let goodsArray;
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

  const numMaxVolume = Number(max_volume) || 0;
  const numMaxWeight = Number(max_weight) || 0;
  const numUsedVolume = Number(current_used_volume) || 0;
  const numUsedWeight = Number(current_used_weight) || 0;

  if (numUsedVolume > numMaxVolume) {
    return res.json({
      success: false,
      message: "Current used volume cannot be greater than maximum volume.",
    });
  }

  if (numUsedWeight > numMaxWeight) {
    return res.json({
      success: false,
      message: "Current used weight cannot be greater than maximum weight.",
    });
  }

  const capacity = Math.min(numMaxVolume, numMaxWeight) || 1;

  const query = `
    INSERT INTO truck_ads (
      user_id, truck_type, truck_id, length, width, height,
      max_volume, max_weight, current_used_volume, current_used_weight,
      accepted_goods, restrictions, price_per_m3, price_per_kg, price_per_km,
      pickup_location, dropoff_location, district, final_request_date, note, capacity
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.query(
    query,
    [
      user_id,
      truck_type,
      truck_id,
      length,
      width,
      height,
      numMaxVolume,
      numMaxWeight,
      current_used_volume,
      current_used_weight,
      JSON.stringify(goodsArray),
      restrictions,
      price_per_m3,
      price_per_kg,
      price_per_km,
      pickup_location,
      dropoff_location,
      district,
      final_request_date,
      note,
      capacity,
    ],
    (err) => {
      if (err) {
        console.error("Error inserting truck ad:", err);
        return res.json({
          success: false,
          message: "Database error while inserting ad.",
        });
      }
      res.json({ success: true, message: "Truck ad posted successfully!" });
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

app.get("/getAds", (req, res) => {
  const sql = `
    SELECT truck_ads.*, users.fullname
    FROM truck_ads
    JOIN users ON truck_ads.user_id = users.id
  `;

  db.query(sql, (err, result) => {
    if (err) {
      console.error("Error fetching ads:", err);
      return res.json({ success: false, message: "Database error" });
    }

    res.json({ success: true, ads: result });
  });
});

app.get("/getAd/:id", (req, res) => {
  const adId = req.params.id;

  const sql = `
    SELECT truck_ads.*, users.fullname
    FROM truck_ads
    JOIN users ON truck_ads.user_id = users.id
    WHERE truck_ads.id = ?
  `;

  db.query(sql, [adId], (err, result) => {
    if (err) {
      console.error("Error fetching ad details:", err);
      return res.json({ success: false, message: "Database error" });
    }

    if (result.length === 0) {
      return res.json({ success: false, message: "Ad not found" });
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

  const insertSql = `
    INSERT INTO bookings (
      customer_id, truck_ad_id, weight_requested, price,
      pickup_location, dropoff_location, route_distance, trip_date
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.query(
    insertSql,
    [
      customer_id,
      truck_ad_id,
      weight_requested || null,
      price,
      pickup_location || null,
      dropoff_location || null,
      route_distance || null,
      trip_date,
    ],
    (err) => {
      if (err) {
        console.error("Booking insert error:", err);
        return res.json({ success: false, message: "Database error" });
      }

      return res.json({ success: true, message: "Booking confirmed!" });
    }
  );
});
app.get("/rental-requests", (req, res) => {
  const owner_id = req.query.owner_id;

  if (!owner_id) {
    return res.json({ success: false, message: "owner_id is required" });
  }

  const sql = `
    SELECT
      b.id AS booking_id,
      b.weight_requested,
      b.price,
      b.route_distance,
      b.trip_date,
      b.status,
      ta.truck_type,
      ta.truck_id,
      ta.pickup_location,
      ta.dropoff_location,
      u.fullname AS customer_name
    FROM bookings b
    JOIN truck_ads ta ON b.truck_ad_id = ta.id
    JOIN users u ON b.customer_id = u.id
    WHERE ta.user_id = ?
    ORDER BY b.booking_date DESC, b.id DESC
  `;

  db.query(sql, [owner_id], (err, rows) => {
    if (err) {
      console.error("Error fetching rental requests:", err);
      return res.json({ success: false, message: "Database error" });
    }

    res.json({ success: true, requests: rows });
  });
});

app.post("/rental-requests/status", (req, res) => {
  const { booking_id, status } = req.body;

  const allowed = ["Pending", "Approved", "Rejected"];

  if (!booking_id || !status) {
    return res.json({
      success: false,
      message: "booking_id and status are required",
    });
  }

  if (!allowed.includes(status)) {
    return res.json({ success: false, message: "Invalid status value" });
  }

  const sql = `UPDATE bookings SET status = ? WHERE id = ?`;

  db.query(sql, [status, booking_id], (err) => {
    if (err) {
      console.error("Error updating booking status:", err);
      return res.json({ success: false, message: "Database error" });
    }

    if (status !== "Approved") {
      return res.json({
        success: true,
        message: "Status updated",
      });
    }

    const getBooking = `
  SELECT 
    b.weight_requested,
    b.truck_ad_id,
    ta.max_volume,
    ta.max_weight,
    ta.current_used_volume,
    ta.current_used_weight
  FROM bookings b
  JOIN truck_ads ta ON b.truck_ad_id = ta.id
  WHERE b.id = ?
`;

    db.query(getBooking, [booking_id], (err2, rows) => {
      if (err2 || rows.length === 0) {
        return res.json({
          success: true,
          message: "Status updated (no capacity change)",
        });
      }

      const rec = rows[0];
      const requested = Number(rec.weight_requested);

      let updateCapacitySql;
let params;

if (rec.max_volume <= rec.max_weight) {
  updateCapacitySql = `
    UPDATE truck_ads
    SET current_used_volume = current_used_volume + ?
    WHERE id = ?
  `;
  params = [requested, rec.truck_ad_id];


} else {
  updateCapacitySql = `
    UPDATE truck_ads
    SET current_used_weight = current_used_weight + ?
    WHERE id = ?
  `;
  params = [requested, rec.truck_ad_id];
}


      db.query(updateCapacitySql, params, () => {
        return res.json({
          success: true,
          message: "Approved & capacity reduced",
        });
      });
    });
  });
});

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
