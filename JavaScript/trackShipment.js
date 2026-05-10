let map;
let truckMarker;
let pickupMarker;
let dropoffMarker;
let directionsService;
let directionsRenderer;

let activeShipmentId = null;
let mapReady = false;
let pendingStartShipmentId = null;

let routeAnimationTimer = null;
let fallbackLine = null;

const shipmentsById = {};
const deliveredBookingsById = {};
const ratingValues = {};

let selectedBooking = null;

function normalizePlace(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";

  const lower = s.toLowerCase();

  const fixes = {
    khouber: "Khobar, Saudi Arabia",
    khober: "Khobar, Saudi Arabia",
    khobar: "Khobar, Saudi Arabia",
    jeddah: "Jeddah, Saudi Arabia",
    jedah: "Jeddah, Saudi Arabia",
    hail: "Hail, Saudi Arabia",
    "ha'il": "Hail, Saudi Arabia",
    riyadh: "Riyadh, Saudi Arabia",
    dammam: "Dammam, Saudi Arabia",
    jubail: "Jubail, Saudi Arabia",
  };

  if (fixes[lower]) return fixes[lower];
  if (lower.includes("saudi")) return s;

  return `${s}, Saudi Arabia`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDistance(d) {
  const n = Number(d);
  if (!Number.isFinite(n) || n <= 0) return "N/A";
  return `${n} km`;
}

function badgeInfo(status) {
  const s = String(status || "").toLowerCase().trim();

  if (s.includes("delivered")) {
    return { className: "done", text: "Delivered" };
  }

  if (s.includes("in transit")) {
    return { className: "transit", text: "In Transit" };
  }

  if (s.includes("approved")) {
    return { className: "transit", text: "Approved" };
  }

  if (s.includes("rejected")) {
    return { className: "pending", text: "Rejected" };
  }

  return { className: "pending", text: "Pending" };
}

function clearFallbackLine() {
  if (fallbackLine) {
    fallbackLine.setMap(null);
    fallbackLine = null;
  }
}

function stopCurrentAnimation() {
  if (routeAnimationTimer) {
    clearInterval(routeAnimationTimer);
    routeAnimationTimer = null;
  }
}

function showToast(message, type = "success") {
  let toast = document.getElementById("appToast");

  if (!toast) {
    toast = document.createElement("div");
    toast.id = "appToast";
    toast.style.position = "fixed";
    toast.style.top = "24px";
    toast.style.right = "24px";
    toast.style.zIndex = "100000";
    toast.style.minWidth = "260px";
    toast.style.maxWidth = "360px";
    toast.style.padding = "14px 18px";
    toast.style.borderRadius = "14px";
    toast.style.boxShadow = "0 16px 40px rgba(0,0,0,0.18)";
    toast.style.fontWeight = "700";
    toast.style.fontSize = "14px";
    toast.style.transition = "opacity 0.25s ease, transform 0.25s ease";
    toast.style.opacity = "0";
    toast.style.transform = "translateY(-10px)";
    document.body.appendChild(toast);
  }

  if (type === "error") {
    toast.style.background = "#7f1d1d";
    toast.style.color = "#ffffff";
  } else {
    toast.style.background = "#0f3d63";
    toast.style.color = "#ffffff";
  }

  toast.textContent = message;
  toast.style.opacity = "1";
  toast.style.transform = "translateY(0)";

  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(-10px)";
  }, 2200);
}

function geocodeAddress(address) {
  return new Promise((resolve, reject) => {
    if (!window.google || !google.maps || !google.maps.Geocoder) {
      return reject(new Error("Geocoder not available"));
    }

    const geocoder = new google.maps.Geocoder();
    geocoder.geocode(
      { address: normalizePlace(address), region: "SA" },
      (results, status) => {
        if (status === "OK" && results && results[0]) {
          const loc = results[0].geometry.location;
          resolve({ lat: loc.lat(), lng: loc.lng() });
        } else {
          reject(new Error(`Geocode failed: ${status}`));
        }
      }
    );
  });
}

function updateCardDistanceAndTravelTime(
  shipmentId,
  distanceText,
  travelTimeText
) {
  const card = document.querySelector(
    `.shipment-card[data-shipment-id="${shipmentId}"]`
  );
  if (!card) return;

  const distanceEl = card.querySelector(".distance-text");
  if (distanceEl) distanceEl.textContent = distanceText || "N/A";

  const etaEl = card.querySelector(".eta-text");
  if (etaEl) etaEl.textContent = travelTimeText || "N/A";
}

window.initMap = function initMap() {
  const initialPosition = { lat: 24.7136, lng: 46.6753 };

  map = new google.maps.Map(document.getElementById("map"), {
    center: initialPosition,
    zoom: 6,
  });

  truckMarker = new google.maps.Marker({
    position: initialPosition,
    map,
    title: "Truck (Simulated)",
    zIndex: 9888,
    icon: {
      url: "../Photo/deliveryTruck.png",
      scaledSize: new google.maps.Size(38, 38),
    },
  });

  pickupMarker = new google.maps.Marker({ map, title: "Pickup" });
  dropoffMarker = new google.maps.Marker({ map, title: "Dropoff" });

  directionsService = new google.maps.DirectionsService();
  directionsRenderer = new google.maps.DirectionsRenderer({
    map,
    suppressMarkers: true,
    preserveViewport: false,
  });

  mapReady = true;

  if (pendingStartShipmentId) {
    const savedId = pendingStartShipmentId;
    pendingStartShipmentId = null;
    startTracking(savedId);
  }
};

document.addEventListener("DOMContentLoaded", async () => {
  const listEl = document.getElementById("shipmentsList");
  const emptyEl = document.getElementById("shipmentsEmpty");

  if (!listEl) {
    console.error("shipmentsList container not found in HTML.");
    return;
  }

  const customerId = localStorage.getItem("user_id");
  const userType = localStorage.getItem("user_type");

  if (!customerId) {
    if (emptyEl) emptyEl.textContent = "Please login first.";
    return;
  }

  if (userType && userType !== "Customer") {
    if (emptyEl) {
      emptyEl.textContent = "Tracking page is for Customer accounts only.";
    }
    return;
  }

  initStars();

  await loadMyShipments(customerId);
  await loadDeliveredBookings(customerId);

  const params = new URLSearchParams(window.location.search);
  const shipmentFromNotification = params.get("shipment");
  if (
    shipmentFromNotification &&
    shipmentsById[String(shipmentFromNotification)]
  ) {
    const card = document.querySelector(
      `.shipment-card[data-shipment-id="${String(shipmentFromNotification)}"]`
    );
    if (card) {
      document
        .querySelectorAll(".shipment-card[data-shipment-id]")
        .forEach((c) => c.classList.remove("active-card"));
      card.classList.add("active-card");
    }
    await startTracking(String(shipmentFromNotification));
  }
});

async function loadMyShipments(customerId) {
  const listEl = document.getElementById("shipmentsList");
  const emptyEl = document.getElementById("shipmentsEmpty");
  const countEl = document.getElementById("shipmentsCount");

  try {
    const res = await fetch(
      `/api/my-shipments?customer_id=${encodeURIComponent(customerId)}`
    );
    const data = await res.json();

    if (!data || data.success !== true) {
      if (emptyEl) {
        emptyEl.textContent = data?.message || "Failed to load shipments.";
      }
      if (countEl) countEl.textContent = "0";
      return;
    }

    const shipments = (data.shipments || []).filter((s) => {
      const status = String(s.status || "").toLowerCase().trim();
      return status === "approved" || status === "in transit";
    });

    if (countEl) countEl.textContent = String(shipments.length);

    Object.keys(shipmentsById).forEach((k) => delete shipmentsById[k]);
    shipments.forEach((s) => {
      shipmentsById[String(s.shipment_id)] = s;
    });

    listEl.innerHTML = "";

    if (shipments.length === 0) {
      if (emptyEl) {
        emptyEl.textContent = "No active shipments available right now.";
      }
      return;
    }

    shipments.forEach((s) => {
      const shipmentId = String(s.shipment_id);
      const badge = badgeInfo(s.status);

      const card = document.createElement("div");
      card.className = "shipment-card";
      card.dataset.shipmentId = shipmentId;

      card.innerHTML = `
        <div class="shipment-header">
          <div class="shipment-id-box">
            <i class="bi bi-box-seam"></i>
            <span class="shipment-id">#${escapeHtml(shipmentId)}</span>
          </div>

          <span class="shipment-owner center-owner">
            ${escapeHtml(s.truck_owner_name || "Truck Owner")}
          </span>

          <span class="status-badge ${badge.className}">
            ${escapeHtml(badge.text)}
          </span>
        </div>

        <div class="route-wrapper">
          <div class="shipment-route">
            <div class="route-indicator">
              <span class="dot active"></span>
              <div class="route-line active"></div>
              <i class="bi bi-truck-front route-icon"></i>
              <div class="route-line"></div>
              <span class="dot"></span>
            </div>

            <div class="route-addresses">
              <p class="route-from">${escapeHtml(s.pickup_location || "-")}</p>
              <p class="route-to">${escapeHtml(s.dropoff_location || "-")}</p>
            </div>
          </div>

          <div class="route-side-info">
            <div class="info-item">
              <i class="bi bi-signpost-2-fill distance-icon"></i>
              <span>
                <strong>Distance: </strong>
                <span class="distance-text">${escapeHtml(
                  formatDistance(s.route_distance)
                )}</span>
              </span>
            </div>

            <div class="info-item">
              <i class="bi bi-clock-fill time-icon"></i>
              <span>
                <strong>Estimated travel time: </strong>
                <span class="eta-text">Calculating...</span>
              </span>
            </div>
          </div>
        </div>
      `;

      card.addEventListener("click", async () => {
        document
          .querySelectorAll(".shipment-card[data-shipment-id]")
          .forEach((c) => c.classList.remove("active-card"));

        card.classList.add("active-card");
        await startTracking(shipmentId);
      });

      listEl.appendChild(card);
    });
  } catch (err) {
    console.error("loadMyShipments error:", err);
    if (countEl) countEl.textContent = "0";
    if (emptyEl) emptyEl.textContent = "Error loading shipments.";
  }
}

async function startTracking(shipmentId) {
  activeShipmentId = String(shipmentId);

  const shipment = shipmentsById[activeShipmentId];
  if (!shipment) return;

  stopCurrentAnimation();

  if (!mapReady || !truckMarker || !map) {
    pendingStartShipmentId = activeShipmentId;
    return;
  }

  const fullPath = await drawRouteForShipment(activeShipmentId);
  await placeTruckAtPickup(shipment);
  await startSimulation(activeShipmentId, shipment);

  if (fullPath && fullPath.length > 0) {
    animateTruckOnRoute(activeShipmentId, fullPath);
  }
}

async function placeTruckAtPickup(shipment) {
  try {
    if (shipment.pickup_lat && shipment.pickup_lng) {
      const pos = {
        lat: Number(shipment.pickup_lat),
        lng: Number(shipment.pickup_lng),
      };

      truckMarker.setPosition(pos);
      map.panTo(pos);
      return;
    }

    if (shipment.pickup_location) {
      const coords = await geocodeAddress(shipment.pickup_location);
      truckMarker.setPosition(coords);
      map.panTo(coords);
    }
  } catch (err) {
    console.log("Could not place truck at pickup:", err.message);
  }
}

async function drawRouteForShipment(shipmentId) {
  const s = shipmentsById[String(shipmentId)];
  if (!s || !directionsService || !directionsRenderer) return null;

  clearFallbackLine();

  return new Promise((resolve) => {
    directionsService.route(
      {
        origin: normalizePlace(s.pickup_location || ""),
        destination: normalizePlace(s.dropoff_location || ""),
        travelMode: google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (status !== "OK" || !result) {
          resolve(null);
          return;
        }

        directionsRenderer.setDirections(result);

        const fullPath = result.routes[0].overview_path;

        try {
          const leg = result.routes[0].legs[0];

          pickupMarker.setPosition(leg.start_location);
          dropoffMarker.setPosition(leg.end_location);

          const distanceText = leg?.distance?.text || "N/A";
          const travelTimeText = leg?.duration?.text || "N/A";

          updateCardDistanceAndTravelTime(
            shipmentId,
            distanceText,
            travelTimeText
          );
        } catch (e) {
          console.log("Route leg read error:", e.message);
        }

        resolve(fullPath);
      }
    );
  });
}

async function startSimulation(shipmentId, shipment) {
  const hasPickupCoords =
    shipment &&
    shipment.pickup_lat != null &&
    shipment.pickup_lng != null &&
    shipment.pickup_lat !== "" &&
    shipment.pickup_lng !== "";

  let body = null;

  if (hasPickupCoords) {
    body = JSON.stringify({
      lat: Number(shipment.pickup_lat),
      lng: Number(shipment.pickup_lng),
    });
  } else {
    try {
      if (shipment && shipment.pickup_location) {
        const coords = await geocodeAddress(shipment.pickup_location);
        body = JSON.stringify(coords);
      }
    } catch (e) {
      console.warn(
        "Pickup geocode failed; server will start from default location.",
        e.message
      );
      body = null;
    }
  }

  try {
    const res = await fetch(`/api/sim/start/${shipmentId}`, {
      method: "POST",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body || undefined,
    });

    const data = await res.json();

    if (!data || data.success !== true) {
      console.error("Simulation start failed:", data);
      return;
    }

    if (shipmentsById[String(shipmentId)]) {
      shipmentsById[String(shipmentId)].status = "In Transit";
    }

    const card = document.querySelector(
      `.shipment-card[data-shipment-id="${shipmentId}"]`
    );

    if (card) {
      const badge = card.querySelector(".status-badge");
      if (badge) {
        badge.className = "status-badge transit";
        badge.textContent = "In Transit";
      }
    }
  } catch (err) {
    console.error("Failed to start simulation:", err);
  }
}

function compressPath(path, maxPoints = 30) {
  if (!path || path.length <= maxPoints) return path;

  const result = [];
  const step = Math.ceil(path.length / maxPoints);

  for (let i = 0; i < path.length; i += step) {
    result.push(path[i]);
  }

  if (result[result.length - 1] !== path[path.length - 1]) {
    result.push(path[path.length - 1]);
  }

  return result;
}

function animateTruckOnRoute(shipmentId, path) {
  if (!path || path.length === 0) return;

  stopCurrentAnimation();

  const shortenedPath = compressPath(path, 30);
  let index = 0;

  routeAnimationTimer = setInterval(async () => {
    if (String(activeShipmentId) !== String(shipmentId)) {
      stopCurrentAnimation();
      return;
    }

    if (index >= shortenedPath.length) {
      stopCurrentAnimation();

      try {
        const deliveredRes = await fetch(`/api/shipment/${shipmentId}/delivered`, {
          method: "POST",
        });
        const deliveredData = await deliveredRes.json();

        if (deliveredData?.success) {
          if (shipmentsById[String(shipmentId)]) {
            delete shipmentsById[String(shipmentId)];
          }

          activeShipmentId = null;

          const customerId = localStorage.getItem("user_id");
          await loadMyShipments(customerId);
          await loadDeliveredBookings(customerId);

          directionsRenderer.set("directions", null);
          clearFallbackLine();
        }
      } catch (err) {
        console.error("Failed to mark shipment delivered:", err);
      }

      return;
    }

    const point = shortenedPath[index];
    const pos = {
      lat: point.lat(),
      lng: point.lng(),
    };

    truckMarker.setPosition(pos);
    map.panTo(pos);

    try {
      await fetch(`/api/sim/update/${shipmentId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(pos),
      });
    } catch (e) {
      console.log("Simulation update error:", e.message);
    }

    index++;
  }, 1200);
}

async function loadDeliveredBookings(customerId) {
  const deliveredList = document.getElementById("deliveredList");

  try {
    const res = await fetch(
      `/api/delivered-bookings?customer_id=${encodeURIComponent(customerId)}`
    );
    const data = await res.json();

    if (!data || data.success !== true) {
      if (deliveredList) {
        deliveredList.innerHTML = `<div style="padding: 14px; opacity: 0.75;">Failed to load delivered shipments.</div>`;
      }
      return;
    }

    const bookings = data.bookings || [];

    Object.keys(deliveredBookingsById).forEach((k) => delete deliveredBookingsById[k]);
    bookings.forEach((b) => {
      deliveredBookingsById[String(b.id)] = b;
    });

    displayDelivered(bookings);
  } catch (err) {
    console.error("loadDeliveredBookings error:", err);
    if (deliveredList) {
      deliveredList.innerHTML = `<div style="padding: 14px; opacity: 0.75;">Error loading delivered shipments.</div>`;
    }
  }
}

function displayDelivered(bookings) {
  const container = document.getElementById("deliveredList");
  if (!container) return;

  container.innerHTML = "";

  if (!bookings || bookings.length === 0) {
    container.innerHTML =
      '<div style="padding: 14px; opacity: 0.75;">No delivered shipments yet.</div>';
    return;
  }

  bookings.forEach((b) => {
    const card = document.createElement("div");
    card.className = "shipment-card";
    card.dataset.bookingId = String(b.id);

    card.innerHTML = `
      <div class="shipment-header">
        <div class="shipment-id-box">
          <i class="bi bi-box-seam"></i>
          <strong>Booking #${escapeHtml(b.id)}</strong>
        </div>

        <span class="shipment-owner">
          By: ${escapeHtml(b.truck_owner_name || "Truck Owner")}
        </span>

        <span class="status-badge done">Delivered</span>
      </div>

      <p><strong>Date:</strong> ${escapeHtml(b.booking_date || "-")}</p>
      <p><strong>From:</strong> ${escapeHtml(b.pickup_location || "-")}</p>
      <p><strong>To:</strong> ${escapeHtml(b.dropoff_location || "-")}</p>
    `;

    if (Number(b.is_rated) === 1) {
      const ratedLabel = document.createElement("span");
      ratedLabel.className = "rated-badge";
      ratedLabel.textContent = "Rated ✔";
      card.appendChild(ratedLabel);
    } else {
      const btn = document.createElement("button");
      btn.className = "rate-btn";
      btn.textContent = "Rate";

      btn.onclick = () => {
        showRatingBox(b);
      };

      card.appendChild(btn);
    }

    container.appendChild(card);
  });
}

function initStars() {
  document.querySelectorAll(".stars").forEach((container) => {
    container.innerHTML = "";
    const type = container.dataset.type;

    for (let i = 1; i <= 5; i++) {
      const star = document.createElement("span");
      star.innerHTML = "★";
      star.style.cursor = "pointer";
      star.style.fontSize = "32px";
      star.style.marginRight = "6px";
      star.style.color = "#cbd5e1";

      star.onclick = () => {
        ratingValues[type] = i;

        container.querySelectorAll("span").forEach((s, index) => {
          s.style.color = index < i ? "#f59e0b" : "#cbd5e1";
        });
      };

      container.appendChild(star);
    }
  });
}

function resetRatingForm() {
  selectedBooking = null;

  ["service", "behavior", "trust", "speed", "attitude"].forEach((key) => {
    delete ratingValues[key];
  });

  document.querySelectorAll(".stars").forEach((container) => {
    container.querySelectorAll("span").forEach((star) => {
      star.style.color = "#cbd5e1";
    });
  });

  const title = document.getElementById("ratingTitle");
  if (title) title.textContent = "Rate Truck Owner";

  const submitBtn = document.getElementById("submitRatingBtn");
  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.textContent = "Submit Rating";
  }
}

function showRatingBox(booking) {
  selectedBooking = booking;

  const overlay = document.getElementById("ratingOverlay");
  const title = document.getElementById("ratingTitle");

  if (title) {
    title.textContent = `Rate Truck Owner: ${booking.truck_owner_name || "Truck Owner"}`;
  }

  if (overlay) {
    overlay.style.display = "flex";
  }
}

function closeRating() {
  const overlay = document.getElementById("ratingOverlay");
  if (overlay) {
    overlay.style.display = "none";
  }
  resetRatingForm();
}

async function submitRating() {
  if (!selectedBooking || !selectedBooking.id) {
    showToast("No booking selected.", "error");
    return;
  }

  const requiredKeys = ["service", "behavior", "trust", "speed", "attitude"];
  const missing = requiredKeys.some((key) => !ratingValues[key]);

  if (missing) {
    showToast("Please rate all five categories before submitting.", "error");
    return;
  }

  const submitBtn = document.getElementById("submitRatingBtn");
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting...";
  }

  const payload = {
    booking_id: selectedBooking.id,
    customer_id: localStorage.getItem("user_id"),
    service: ratingValues.service,
    behavior: ratingValues.behavior,
    trust: ratingValues.trust,
    speed: ratingValues.speed,
    attitude: ratingValues.attitude,
  };

  try {
    const res = await fetch("/ratings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const result = await res.json();

    if (res.ok && result.success) {
      const bookingId = String(payload.booking_id);

      if (deliveredBookingsById[bookingId]) {
        deliveredBookingsById[bookingId].is_rated = 1;
      }

      const bookingCard = document.querySelector(
        `.shipment-card[data-booking-id="${bookingId}"]`
      );

      if (bookingCard) {
        const btn = bookingCard.querySelector(".rate-btn");
        if (btn) btn.remove();

        let label = bookingCard.querySelector(".rated-badge");
        if (!label) {
          label = document.createElement("span");
          label.className = "rated-badge";
          label.textContent = "Rated ✔";
          bookingCard.appendChild(label);
        }
      }

      closeRating();
    } else {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Submit Rating";
      }
      showToast(result.message || "Failed to submit rating.", "error");
    }
  } catch (err) {
    console.error("submitRating error:", err);

    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit Rating";
    }

    showToast("Something went wrong while submitting the rating.", "error");
  }
}

window.closeRating = closeRating;
window.submitRating = submitRating;