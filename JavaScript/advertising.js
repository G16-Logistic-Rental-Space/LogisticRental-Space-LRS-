class TruckListing {
  listing_id;
  truck_id;
  owner_id;
  max_volume;
  max_weight;
  current_used_volume;
  current_used_weight;
  accepted_goods;
  restrictions;
  price_per_m3;
  price_per_kg;
  price_per_km;
  pickup_location;
  dropoff_location;
  district;
  final_request_date;
  note;
  capacity;
  status;
  fullname;
  truck_type;
  length;
  width;
  height;

  constructor(ad) {
    this.listing_id = ad.id;
    this.truck_id = ad.truck_id;
    this.owner_id = ad.user_id;

    this.length = Number(ad.length);
    this.width = Number(ad.width);
    this.height = Number(ad.height);

    this.max_volume = Number(ad.max_volume);
    this.max_weight = Number(ad.max_weight);
    this.current_used_volume = Number(ad.current_used_volume);
    this.current_used_weight = Number(ad.current_used_weight);

    this.accepted_goods = ad.accepted_goods;
    this.restrictions = ad.restrictions;

    this.price_per_m3 = Number(ad.price_per_m3);
    this.price_per_kg = Number(ad.price_per_kg);
    this.price_per_km = Number(ad.price_per_km);

    this.pickup_location = ad.pickup_location;
    this.dropoff_location = ad.dropoff_location;
    this.district = ad.district;

    this.final_request_date = ad.final_request_date;
    this.note = ad.note;

    this.capacity = Number(ad.capacity);
    this.status = ad.status || "Available";

    this.fullname = ad.fullname;
    this.truck_type = ad.truck_type;
  }

  calculateUnusedVolume() {
    return Math.max(this.max_volume - this.current_used_volume, 0);
  }

  calculateUnusedWeight() {
    return Math.max(this.max_weight - this.current_used_weight, 0);
  }

  determineLimitingCapacity() {
    return this.max_volume <= this.max_weight ? "volume" : "weight";
  }

  calculateUnusedCapacity() {
    return this.determineLimitingCapacity() === "volume"
      ? this.calculateUnusedVolume()
      : this.calculateUnusedWeight();
  }

  getCapacityUnit() {
    return this.determineLimitingCapacity() === "volume" ? "m³" : "kg";
  }

  isActive() {
    return this.calculateUnusedCapacity() > 0;
  }

  getGoodsList() {
    try {
      const arr = JSON.parse(this.accepted_goods);

      const otherIndex = arr.indexOf("Other");
      if (otherIndex !== -1 && arr[otherIndex + 1]) {
        const otherText = arr[otherIndex + 1];
        arr[otherIndex] = `Other (${otherText})`;
        arr.splice(otherIndex + 1, 1);
      }

      return arr;
    } catch {
      return [this.accepted_goods];
    }
  }

  getGoodsText() {
    return this.getGoodsList().join(", ");
  }

  getGoodsHTML() {
    const goodsHTML = this.getGoodsList()
      .map((g) => `<span class="goods-item">✔ ${g}</span>`)
      .join(" ");

    const restrictionHTML = `
      <span class="restriction-item">
        <span class="restriction-icon">✖</span>
        <span class="restriction-text">${this.restrictions || "No restrictions"}</span>
      </span>
    `;

    return `
      <div class="goods-flex">
        ${goodsHTML}
        ${restrictionHTML}
      </div>
    `;
  }

  getDimensionsText() {
    return `${this.length}m × ${this.width}m × ${this.height}m`;
  }

  getRouteText() {
    return `${this.pickup_location} → ${this.dropoff_location}`;
  }
}

window.TruckListing = TruckListing;

window.addEventListener("load", () => {
  loadAds();
  setupModalClose();
});

function loadAds() {
  fetch("http://localhost:3000/getAds")
    .then((res) => res.json())
    .then((data) => {
      if (!data.success) return;

      const adsContainer = document.querySelector(".ads-container");
      adsContainer.innerHTML = "";

      data.ads.forEach((adData) => {
        const ad = new TruckListing(adData);
        if (!ad.isActive()) return;

        const card = createAdCard(ad);
        adsContainer.appendChild(card);
      });
    })
    .catch((err) => console.error("Fetch error:", err));
}

function createAdCard(ad) {
  const card = document.createElement("article");
  card.classList.add("ad-card");

  card.innerHTML = `
    <img src="../Photo/adPic.png" class="truck-modal-img">
    <div class="ad-main">  
      <h3>${ad.fullname}</h3>
      <p class="ad-type">${ad.truck_type}</p>

      <div class="ad-details">
        <p><strong>Pickup:</strong> ${ad.pickup_location}</p>
        <p><strong>Drop-off:</strong> ${ad.dropoff_location}</p>
        <p><strong>Accepted Goods:</strong> ${ad.getGoodsText()}</p>
      </div>

      <p class="ad-status">${ad.status}</p>

      <div class="ad-footer">
        <button class="book-btn">Book Now</button>
      </div>
    </div>
  `;

  card.addEventListener("click", (e) => {
    if (e.target.closest(".book-btn")) {
      saveSelectedAd(ad);
      window.location.href = "confirm-booking.html";
      return;
    }
    openModal(ad);
  });

  return card;
}

function openModal(ad) {
  document.getElementById("modalTitle").textContent = ad.fullname;
  document.getElementById("modalType").textContent = ad.truck_type;
  document.getElementById("modalID").textContent = ad.truck_id;

  document.getElementById("modalDim").textContent = ad.getDimensionsText();
  document.getElementById("modalVol").textContent = ad.max_volume + " m³";
  document.getElementById("modalLoad").textContent = ad.max_weight + " kg";

  document.getElementById("modalGoods").innerHTML = ad.getGoodsHTML();

  document.getElementById("modalPrice").textContent = "SAR " + ad.price_per_km;
  document.getElementById("modalRoute").textContent = ad.getRouteText();
  document.getElementById("modalNotes").textContent =
    ad.note || "No notes available.";

  const unused = ad.calculateUnusedCapacity();
  const unit = ad.getCapacityUnit();

  document.getElementById(
    "capacity"
  ).textContent = `Unused Capacity: ${unused} ${unit}`;

  saveSelectedAd(ad);
  document.getElementById("truckModal").classList.add("show");
}

function saveSelectedAd(ad) {
  localStorage.setItem("selected_ad_id", ad.listing_id);
  localStorage.setItem("pickup_location", ad.pickup_location);
  localStorage.setItem("dropoff_location", ad.dropoff_location);

  localStorage.setItem("price_per_km", ad.price_per_km);
  localStorage.setItem("price_per_kg", ad.price_per_kg);
  localStorage.setItem("price_per_m3", ad.price_per_m3);

  localStorage.setItem("max_volume", ad.max_volume);
  localStorage.setItem("capacity", ad.calculateUnusedCapacity());
}

function setupModalClose() {
  document.querySelector(".truck-modal-close").addEventListener("click", () => {
    document.getElementById("truckModal").classList.remove("show");
  });

  document.getElementById("truckModal").addEventListener("click", (e) => {
    if (e.target.classList.contains("truck-modal-overlay")) {
      document.getElementById("truckModal").classList.remove("show");
    }
  });
}
