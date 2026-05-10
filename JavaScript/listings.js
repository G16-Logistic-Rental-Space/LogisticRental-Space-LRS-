let allAds = [];
let filteredAds = [];
console.log("advertising.js loaded");

class TruckListing {
  constructor(ad) {
    this.listing_id = ad.id;
    this.truck_id = ad.truck_id;
    this.owner_id = ad.user_id;

    this.length = Number(ad.length) || 0;
    this.width = Number(ad.width) || 0;
    this.height = Number(ad.height) || 0;

    this.max_volume = Number(ad.max_volume) || 0;
    this.max_weight = Number(ad.max_weight) || 0;
    this.current_used_volume = Number(ad.current_used_volume) || 0;
    this.current_used_weight = Number(ad.current_used_weight) || 0;

    this.accepted_goods = ad.accepted_goods;
    this.restrictions = ad.restrictions;

    this.price = Number(ad.price) || 0;

    this.pickup_location = ad.pickup_location || "";
    this.dropoff_location = ad.dropoff_location || "";
    this.district = ad.district || "";

    this.final_request_date = ad.final_request_date || "";
    this.note = ad.note || "";

    this.status = ad.status || "Available";
    this.fullname = ad.fullname || "Truck Owner";
    this.truck_type = ad.truck_type || "Truck";
    this.owner_rating = Number(ad.owner_rating) || 0;
    this.rating_count = Number(ad.rating_count) || 0;
  }

  calculateRemainingVolume() {
    return Math.max(this.max_volume - this.current_used_volume, 0);
  }

  calculateRemainingWeight() {
    return Math.max(this.max_weight - this.current_used_weight, 0);
  }

  getCapacityInfo() {
    const remVol = this.calculateRemainingVolume();
    const remWeight = this.calculateRemainingWeight();

    if (remVol <= remWeight) {
      return { value: remVol.toFixed(2), unit: "m³", raw: remVol };
    } else {
      return { value: remWeight.toFixed(2), unit: "kg", raw: remWeight };
    }
  }

  isActive() {
    return this.getCapacityInfo().raw > 0;
  }

  getGoodsList() {
    try {
      return Array.isArray(this.accepted_goods)
        ? this.accepted_goods
        : JSON.parse(this.accepted_goods);
    } catch {
      return this.accepted_goods ? [this.accepted_goods] : [];
    }
  }

  getGoodsText() {
    const goods = this.getGoodsList();
    return goods.length ? goods.join(", ") : "Not specified";
  }

  getGoodsHTML() {
    const goodsHTML = this.getGoodsList()
      .map((g) => `<span class="goods-item">✔ ${g}</span>`)
      .join(" ");

    return `
      <div class="goods-flex">
        ${goodsHTML || '<span class="goods-item">No goods specified</span>'}
        <span class="restriction-item">
          <span class="restriction-icon">✖</span>
          <span class="restriction-text">${this.restrictions || "No restrictions"}</span>
        </span>
      </div>
    `;
  }

  getDimensionsText() {
    return `${this.length}m × ${this.width}m × ${this.height}m`;
  }

  getRouteText() {
    return `${this.pickup_location} (${this.district}) → ${this.dropoff_location}`;
  }
}

window.TruckListing = TruckListing;

window.addEventListener("load", () => {
  loadAds();
  setupModalClose();
});

function loadAds() {
  fetch("http://localhost:3001/getAds")
    .then((res) => res.json())
    .then((data) => {
      if (!data.success) {
        return;
      }

      allAds = data.ads
        .map((adData) => new TruckListing(adData))
        .filter((ad) => ad.isActive());

      filteredAds = [...allAds];

      populateAdsFilters();
      renderAds(filteredAds);
      setupAdsFilters();
    })
    .catch((err) => console.error("Fetch error:", err));
}

function createAdCard(ad) {
  const card = document.createElement("article");
  card.classList.add("listing-card");

  const rating = Number(ad.owner_rating || 0).toFixed(1);

  card.innerHTML = `
    <img src="../Photo/adPic.png" alt="Truck" class="truck-modal-img">
    <div class="listing-main">
      <h3>${ad.fullname}</h3>

      <div class="rating">
        ⭐ ${rating}
      </div>

      <p class="ad-type">${ad.truck_type}</p>

      <div class="listing-details">
        <p><strong>Pickup:</strong> ${ad.pickup_location}</p>
        <p><strong>Drop-off:</strong> ${ad.dropoff_location}</p>
        <p><strong>Accepted Goods:</strong> ${ad.getGoodsText()}</p>
      </div>

      <p class="listing-status">${ad.status}</p>

      <div class="ad-footer">
        <button class="book-btn">Book Now</button>
      </div>
    </div>
  `;

  card.addEventListener("click", (e) => {
    if (!e.target.classList.contains("book-btn")) {
      openModal(ad);
    }
  });

  const bookBtn = card.querySelector(".book-btn");
  bookBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    openModal(ad);
  });

  return card;
}

function openModal(ad) {
  if (!ad.isActive()) {
    alert("This ad is no longer available.");
    return;
  }

  document.getElementById("modalTitle").textContent = ad.fullname;
  document.getElementById("modalType").textContent = ad.truck_type;
  document.getElementById("modalID").textContent = ad.truck_id;
  document.getElementById("modalDim").textContent = ad.getDimensionsText();
  document.getElementById("modalVol").textContent = ad.max_volume + " m³";
  document.getElementById("modalLoad").textContent = ad.max_weight + " kg";
  document.getElementById("modalGoods").innerHTML = ad.getGoodsHTML();
  document.getElementById("modalPrice").textContent = "SAR " + ad.price;
  document.getElementById("modalRoute").textContent = ad.getRouteText();
  document.getElementById("modalNotes").textContent =
    ad.note || "No notes available.";

  const capInfo = ad.getCapacityInfo();
  document.getElementById("capacity").textContent =
    `Unused Capacity: ${capInfo.value} ${capInfo.unit}`;

  const proceedBtn = document.getElementById("proceedBtn");
  if (proceedBtn) {
    proceedBtn.disabled = !ad.isActive();
    proceedBtn.textContent = ad.isActive()
      ? "Proceed to Booking"
      : "No Capacity Available";
  }

  saveSelectedAd(ad);
  document.getElementById("truckModal").classList.add("show");
}

function saveSelectedAd(ad) {
  const capInfo = ad.getCapacityInfo();
  localStorage.setItem("selected_ad_id", ad.listing_id);
  localStorage.setItem("pickup_location", ad.pickup_location);
  localStorage.setItem("dropoff_location", ad.dropoff_location);
  localStorage.setItem("price", ad.price);
  localStorage.setItem("capacity_value", capInfo.value);
  localStorage.setItem("capacity_unit", capInfo.unit);
}

function setupModalClose() {
  const modal = document.getElementById("truckModal");
  const closeBtn = document.querySelector(".truck-modal-close");

  if (!modal || !closeBtn) return;

  closeBtn.addEventListener("click", () => {
    modal.classList.remove("show");
  });

  window.addEventListener("click", (e) => {
    if (
      e.target === modal ||
      e.target.classList.contains("truck-modal-overlay")
    ) {
      modal.classList.remove("show");
    }
  });
}

function setupSearch() {
  const searchInput = document.querySelector(".topbar input");
  if (!searchInput) return;

  searchInput.addEventListener("input", (e) => {
    const term = e.target.value.toLowerCase();
    const cards = document.querySelectorAll(".listing-card");

    cards.forEach((card) => {
      const text = card.textContent.toLowerCase();
      card.style.display = text.includes(term) ? "flex" : "none";
    });
  });
}

function updateAdsCounters(total, visible) {
  const adsCount = document.getElementById("adsCount");
  const visibleAdsCount = document.getElementById("visibleAdsCount");

  if (adsCount) adsCount.textContent = total;
  if (visibleAdsCount) visibleAdsCount.textContent = visible;
}

function getUniqueValues(items, extractor) {
  const values = items
    .flatMap(extractor)
    .map((v) => String(v || "").trim())
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

function populateAdsFilters() {
  fillSelectOptions(
    "pickupFilter",
    getUniqueValues(allAds, (ad) => [ad.pickup_location]),
    "All Pickup Cities"
  );

  fillSelectOptions(
    "dropoffFilter",
    getUniqueValues(allAds, (ad) => [ad.dropoff_location]),
    "All Drop-off Cities"
  );

  fillSelectOptions(
    "truckTypeFilter",
    getUniqueValues(allAds, (ad) => [ad.truck_type]),
    "All Truck Types"
  );

  fillSelectOptions(
    "goodsFilter",
    getUniqueValues(allAds, (ad) => ad.getGoodsList()),
    "All Goods"
  );

  fillSelectOptions(
    "statusFilter",
    getUniqueValues(allAds, (ad) => [ad.status]),
    "All Statuses"
  );
}

function renderAds(list) {
  const adsContainer = document.querySelector(".listings-container");
  if (!adsContainer) return;

  adsContainer.innerHTML = "";

  if (!list.length) {
    adsContainer.innerHTML = `
      <div class="no-data">
        No truck listings matched your filters.
      </div>
    `;
    updateAdsCounters(allAds.length, 0);
    return;
  }

  list.forEach((ad) => {
    const card = createAdCard(ad);
    adsContainer.appendChild(card);
  });

  updateAdsCounters(allAds.length, list.length);
}

function applyAdsFilters() {
  const searchValue =
    document.getElementById("truckSearch")?.value.toLowerCase().trim() || "";

  const pickupValue = document.getElementById("pickupFilter")?.value || "";
  const dropoffValue = document.getElementById("dropoffFilter")?.value || "";
  const truckTypeValue =
    document.getElementById("truckTypeFilter")?.value || "";
  const goodsValue = document.getElementById("goodsFilter")?.value || "";
  const statusValue = document.getElementById("statusFilter")?.value || "";

  filteredAds = allAds.filter((ad) => {
    if (!ad.isActive()) return false;

    const goodsList = ad.getGoodsList();

    const matchesSearch =
      !searchValue ||
      `
        ${ad.fullname}
        ${ad.truck_type}
        ${ad.pickup_location}
        ${ad.dropoff_location}
        ${ad.district}
        ${ad.note}
        ${ad.status}
        ${ad.getGoodsText()}
        ${ad.restrictions || ""}
      `
        .toLowerCase()
        .includes(searchValue);

    const matchesPickup = !pickupValue || ad.pickup_location === pickupValue;
    const matchesDropoff =
      !dropoffValue || ad.dropoff_location === dropoffValue;
    const matchesTruckType =
      !truckTypeValue || ad.truck_type === truckTypeValue;
    const matchesGoods =
      !goodsValue || goodsList.some((g) => String(g).trim() === goodsValue);
    const matchesStatus = !statusValue || ad.status === statusValue;

    return (
      matchesSearch &&
      matchesPickup &&
      matchesDropoff &&
      matchesTruckType &&
      matchesGoods &&
      matchesStatus
    );
  });

  renderAds(filteredAds);
}

function setupAdsFilters() {
  const ids = [
    "truckSearch",
    "pickupFilter",
    "dropoffFilter",
    "truckTypeFilter",
    "goodsFilter",
    "statusFilter",
  ];

  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", applyAdsFilters);
    el.addEventListener("change", applyAdsFilters);
  });

  const resetBtn = document.getElementById("resetAdsFiltersBtn");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      const fields = [
        "truckSearch",
        "pickupFilter",
        "dropoffFilter",
        "truckTypeFilter",
        "goodsFilter",
        "statusFilter",
      ];

      fields.forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.value = "";
      });

      applyAdsFilters();
    });
  }
}
