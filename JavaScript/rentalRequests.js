
function applyStatus(statusText, newStatus, approveBtn, rejectBtn) {
  const allClasses = ["status-pending", "status-approved", "status-rejected"];
  statusText.classList.remove(...allClasses);

  let className = "status-pending";
  if (newStatus === "Approved") className = "status-approved";
  else if (newStatus === "Rejected") className = "status-rejected";

  statusText.textContent = "Status: " + newStatus;
  statusText.classList.add(className);

  if (newStatus === "Pending") {
    approveBtn.disabled = false;
    rejectBtn.disabled = false;
  } else {
    approveBtn.disabled = true;
    rejectBtn.disabled = true;
  }
}


function renderRequests(requests) {
  const container = document.getElementById("requestsContainer");
  if (!container) return;

  container.innerHTML = "";

  if (!requests.length) {
    container.innerHTML = "<p>No rental requests yet.</p>";
    return;
  }

  requests.forEach((req) => {
    const card = document.createElement("article");
    card.className = "ad-card";

    const capacityText =
      req.weight_requested === null || req.weight_requested === undefined
        ? "—"
        : String(req.weight_requested);

    const routeText =
      (req.pickup_location || "Pickup not set") +
      " → " +
      (req.dropoff_location || "Drop-off not set");


    let distanceText = "Not set";
    if (req.route_distance !== null && req.route_distance !== undefined) {
      const dist = Number(req.route_distance);
      if (!isNaN(dist)) {
        distanceText = Math.round(dist) + " km";
      }
    }

    let formattedDate = "—";
    if (req.trip_date) {
      const d = new Date(req.trip_date);
      if (!isNaN(d)) {
        formattedDate = d.toISOString().split("T")[0];
      } else if (typeof req.trip_date === "string") {
        formattedDate = req.trip_date.split("T")[0];
      }
    }

  
    let priceText = "SAR 0";
    if (typeof req.price === "number") {
      priceText =
        "SAR " +
        req.price.toLocaleString("en-SA", {
          minimumFractionDigits: 0,
          maximumFractionDigits: 2,
        });
    } else if (req.price) {
      priceText = "SAR " + req.price;
    }

    const rawStatus = (req.status || "Pending").toLowerCase();
    let initialStatus = "Pending";
    if (rawStatus === "approved") initialStatus = "Approved";
    else if (rawStatus === "rejected") initialStatus = "Rejected";

    card.innerHTML = `
      <img src="../Photo/formTruck.png" alt="Truck image">
      <div class="ad-main">
        <h3>${req.customer_name || "Customer"}</h3>
        <p class="ad-type">
          ${req.truck_type || "Truck"} • Booking ID: ${req.booking_id}
        </p>

        <div class="ad-details">
          <p><strong>Requested capacity:</strong> ${capacityText}</p>
          <p><strong>Route:</strong> ${routeText}</p>
          <p><strong>Distance:</strong> ${distanceText}</p>
          <p><strong>Date:</strong> ${formattedDate}</p>
        </div>

        <p class="ad-price">Estimated price: ${priceText}</p>
        <p class="ad-status">Status: ${initialStatus}</p>

        <div class="request-actions">
          <button class="book-btn approve-btn" type="button">Approve</button>
          <button class="reject-btn" type="button">Reject</button>
        </div>
      </div>
    `;

    const statusText = card.querySelector(".ad-status");
    const approveBtn = card.querySelector(".approve-btn");
    const rejectBtn = card.querySelector(".reject-btn");

    applyStatus(statusText, initialStatus, approveBtn, rejectBtn);

    function updateStatusOnServer(newStatus) {
      fetch("http://localhost:3000/rental-requests/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          booking_id: req.booking_id,
          status: newStatus, 
        }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (!data.success) {
            alert(data.message || "Failed to update status");
            return;
          }
          applyStatus(statusText, newStatus, approveBtn, rejectBtn);
        })
        .catch((err) => {
          console.error("Error updating status:", err);
          alert("Server error while updating status");
        });
    }
    approveBtn.addEventListener("click", () => {
      if (!approveBtn.disabled) {
        updateStatusOnServer("Approved");
      }
    });

    rejectBtn.addEventListener("click", () => {
      if (!rejectBtn.disabled) {
        updateStatusOnServer("Rejected");
      }
    });

    container.appendChild(card);
  });
}

function loadRequests() {
  const ownerId = localStorage.getItem("user_id");
  const userType = localStorage.getItem("user_type");
  const container = document.getElementById("requestsContainer");

  console.log("RentalRequests :: ownerId =", ownerId, "userType =", userType);

  if (!ownerId) {
    console.warn("No user_id in localStorage.");
    if (container) {
      container.innerHTML =
        "<p>Please log in as a <strong>Truck owner</strong> to view rental requests.</p>";
    }
    return;
  }

  if (userType !== "Truck owner") {
    console.warn("User is not a truck owner.");
    if (container) {
      container.innerHTML =
        "<p>Only <strong>Truck owners</strong> can view rental requests.</p>";
    }
    return;
  }

  fetch(
    "http://localhost:3000/rental-requests?owner_id=" +
      encodeURIComponent(ownerId)
  )
    .then((res) => res.json())
    .then((data) => {
      console.log("RentalRequests :: server response =", data);

      if (!data.success) {
        console.error("Error loading rental requests:", data.message);
        if (container) {
          container.innerHTML =
            "<p>Could not load rental requests: " +
            (data.message || "Server error") +
            "</p>";
        }
        return;
      }

      renderRequests(data.requests || []);
    })
    .catch((err) => {
      console.error("Fetch error:", err);
      if (container) {
        container.innerHTML =
          "<p>Network error while loading rental requests.</p>";
      }
    });
}

document.addEventListener("DOMContentLoaded", () => {
  loadRequests();
});
