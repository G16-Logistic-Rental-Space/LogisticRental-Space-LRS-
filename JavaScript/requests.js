let allRequests = [];
let filteredRequests = [];

class RequestListing {
  listing_id;
  user_id;
  truck_type;
  good_type;
  restrictions;
  good_weight;
  good_volume;
  quantity;
  packaging_method;
  pickup_location;
  dropoff_location;
  final_request_date;
  note;
  fullname;

  constructor(req) {
    this.listing_id = req.id;
    this.user_id = req.user_id;
    this.truck_type = req.truck_type;
    this.good_type = req.good_type;
    this.restrictions = req.restrictions;
    this.good_weight = Number(req.good_weight) || 0;
    this.good_volume = Number(req.good_volume) || 0;
    this.quantity = Number(req.quantity) || 0;
    this.packaging_method = req.packaging_method || "Not specified";
    this.pickup_location = req.pickup_location || "---";
    this.dropoff_location = req.dropoff_location || "---";
    this.final_request_date = req.final_request_date;
    this.note = req.note;
    this.fullname = req.fullname || "Customer";
  }
}

window.RequestListing = RequestListing;

window.addEventListener("load", () => {
  loadReq();
  setupModalClose();
  setupSearch();
});

function loadReq() {
  fetch("http://localhost:3001/getRequests")
    .then((res) => res.json())
    .then((data) => {
      if (!data.success) return;

      allRequests = data.req.map((reqData) => new RequestListing(reqData));
      filteredRequests = [...allRequests];

      populateFilters();
      renderRequests(filteredRequests);
      setupFilters();
    })
    .catch((err) => console.error("Fetch error:", err));
}

function createAdCard(req) {
  const card = document.createElement("article");
  card.classList.add("req-card");

  card.innerHTML = `
    <img src="../Photo/adPic.png" class="req-card-img" alt="Request">
    <div class="card-right">
      <h3>${req.fullname}</h3>
      <div class="request-meta">
        <i class="bi bi-box-seam"></i>
        Shipment Request
      </div>

      <div class="req-info">
        <p><strong>Type of Goods:</strong> ${req.good_type}</p>
        <p><strong>Weight:</strong> ${req.good_weight} kg</p>
        <p><strong>Pickup:</strong> ${req.pickup_location}</p>
        <p><strong>Drop-off:</strong> ${req.dropoff_location}</p>
        <p><strong>Note:</strong> ${req.note || "No notes"}</p>
      </div>

      <div class="ad-footer">
        <button class="book-btn">Send Offer</button>
      </div>
    </div>
  `;

  const button = card.querySelector(".book-btn");

  button.addEventListener("click", (e) => {
    e.stopPropagation();
    goToOffer(req.listing_id, req.user_id);
  });

  card.addEventListener("click", () => {
    openModal(req);
  });

  return card;
}

function openModal(req) {
  document.getElementById("modalTitle").textContent = req.fullname;
  document.getElementById("modalType").textContent =
    req.truck_type || "Shipment Request";
  document.getElementById("modalLoad").textContent = `${req.good_weight} kg`;
  document.getElementById("modalVol").textContent = `${req.good_volume} m³`;
  document.getElementById("modalQuantity").textContent = req.quantity;
  document.getElementById("modalPackaging_method").textContent =
    req.packaging_method;
  document.getElementById("modalGoods").textContent =
    `${req.good_type} | ${req.restrictions}`;
  document.getElementById("modalRoute").textContent =
    `${req.pickup_location} → ${req.dropoff_location}`;
  document.getElementById("modalNotes").textContent =
    req.note || "No notes available.";

  localStorage.setItem("offer_requestId", req.listing_id);
  localStorage.setItem("offer_ownerId", req.user_id);

  saveSelectedAd(req);
  document.getElementById("truckModal").classList.add("show");
}
function saveSelectedAd(req) {
  localStorage.setItem("selected_ad_id", req.listing_id);
  localStorage.setItem("pickup_location", req.pickup_location);
  localStorage.setItem("dropoff_location", req.dropoff_location);
  localStorage.setItem("max_volume", req.good_volume);
}

function setupModalClose() {
  const modal = document.getElementById("truckModal");
  const closeBtn = document.querySelector(".truck-modal-close");

  closeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    modal.classList.remove("show");
  });

  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      modal.classList.remove("show");
    }
  });
}

function goToOffer(requestId, ownerId) {
  localStorage.removeItem("offer_requestId");
  localStorage.removeItem("offer_ownerId");

  localStorage.setItem("offer_requestId", String(requestId));
  localStorage.setItem("offer_ownerId", String(ownerId));

  window.location.href = "sendOffer.html";
}

function updateCounters(count) {
  const requestCount = document.getElementById("requestCount");
  const reviewCount = document.getElementById("reviewCount");

  if (requestCount) requestCount.textContent = count;
  if (reviewCount) reviewCount.textContent = count;
}

function renderRequests(list) {
  const reqContainer = document.querySelector(".req-container");
  if (!reqContainer) return;

  reqContainer.innerHTML = "";

  if (!list.length) {
    reqContainer.innerHTML = `
      <div class="no-data">
        No shipping requests matched your search.
      </div>
    `;
    updateCounters(0);
    return;
  }

  list.forEach((reqData) => {
    const req =
      reqData instanceof RequestListing ? reqData : new RequestListing(reqData);
    const card = createAdCard(req);
    reqContainer.appendChild(card);
  });

  updateCounters(list.length);
}

function setupSearch() {
  const input = document.getElementById("requestSearch");
  if (!input) return;

  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();

    const filtered = allRequests.filter((req) => {
      const blob = `
        ${req.fullname}
        ${req.good_type}
        ${req.pickup_location}
        ${req.dropoff_location}
        ${req.note || ""}
        ${req.truck_type || ""}
        ${req.restrictions || ""}
      `.toLowerCase();

      return blob.includes(q);
    });

    renderRequests(filtered);
  });
}

function getUniqueValues(items, key) {
  const values = items
    .map((item) => (item[key] || "").toString().trim())
    .filter(Boolean);

  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function fillSelectOptions(selectId, values, defaultLabel) {
  const select = document.getElementById(selectId);
  if (!select) return;

  select.innerHTML = `<option value="">${defaultLabel}</option>`;

  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });
}

function populateFilters() {
  fillSelectOptions(
    "goodsFilter",
    getUniqueValues(allRequests, "good_type"),
    "All Goods",
  );

  fillSelectOptions(
    "pickupFilter",
    getUniqueValues(allRequests, "pickup_location"),
    "All Pickup Cities",
  );

  fillSelectOptions(
    "dropoffFilter",
    getUniqueValues(allRequests, "dropoff_location"),
    "All Drop-off Cities",
  );

  fillSelectOptions(
    "truckTypeFilter",
    getUniqueValues(allRequests, "truck_type"),
    "All Truck Types",
  );
}

function applyFilters() {
  const searchValue =
    document.getElementById("requestSearch")?.value.toLowerCase().trim() || "";

  const goodsValue = document.getElementById("goodsFilter")?.value || "";
  const pickupValue = document.getElementById("pickupFilter")?.value || "";
  const dropoffValue = document.getElementById("dropoffFilter")?.value || "";
  const truckTypeValue =
    document.getElementById("truckTypeFilter")?.value || "";

  filteredRequests = allRequests.filter((req) => {
    const matchesSearch =
      !searchValue ||
      `
        ${req.fullname}
        ${req.good_type}
        ${req.pickup_location}
        ${req.dropoff_location}
        ${req.note || ""}
        ${req.truck_type || ""}
        ${req.restrictions || ""}
        ${req.packaging_method || ""}
      `
        .toLowerCase()
        .includes(searchValue);

    const matchesGoods = !goodsValue || req.good_type === goodsValue;
    const matchesPickup = !pickupValue || req.pickup_location === pickupValue;
    const matchesDropoff =
      !dropoffValue || req.dropoff_location === dropoffValue;
    const matchesTruckType =
      !truckTypeValue || req.truck_type === truckTypeValue;

    return (
      matchesSearch &&
      matchesGoods &&
      matchesPickup &&
      matchesDropoff &&
      matchesTruckType
    );
  });

  renderRequests(filteredRequests);
}

function setupFilters() {
  const ids = [
    "requestSearch",
    "goodsFilter",
    "pickupFilter",
    "dropoffFilter",
    "truckTypeFilter",
  ];

  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", applyFilters);
    el.addEventListener("change", applyFilters);
  });

  const resetBtn = document.getElementById("resetFiltersBtn");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      const search = document.getElementById("requestSearch");
      const goods = document.getElementById("goodsFilter");
      const pickup = document.getElementById("pickupFilter");
      const dropoff = document.getElementById("dropoffFilter");
      const truckType = document.getElementById("truckTypeFilter");

      if (search) search.value = "";
      if (goods) goods.value = "";
      if (pickup) pickup.value = "";
      if (dropoff) dropoff.value = "";
      if (truckType) truckType.value = "";

      applyFilters();
    });
  }
}
