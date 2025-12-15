class Booking {
  selectedAd = null;
  bookingInfo = null;
  rentedCapacityInput = document.getElementById("rentedCapacity");
  rentedCapacityError = document.getElementById("rentedCapacityError");
  unusedCapacity = 0;
  capacityUnit = "";
  distance = 0;
  priceKm = 0;
  priceKg = 0;
  priceM3 = 0;
  currentPrice = 0;

  
  constructor() {
    window.addEventListener("load", () => this.loadSelectedAd());
  }

  loadSelectedAd() {
    const adId = localStorage.getItem("selected_ad_id");
    if (!adId) return alert("No selected ad");

    fetch(`http://localhost:3000/getAd/${adId}`)
      .then((res) => res.json())
      .then((data) => {
        if (!data.success) return;

        this.selectedAd = data.ad;

        this.calculateUnusedCapacity();
        this.updateCapacityUI();
        this.setupPricing();
        this.updatePrice();

        this.rentedCapacityInput.addEventListener("input", () =>
          this.updatePrice()
        );
        this.renderRouteInfo();
      });
  }

  calculateUnusedCapacity() {
    const ad = this.selectedAd;

    const maxWeight = Number(ad.max_weight) || 0;
    const maxVolume = Number(ad.max_volume) || 0;
    const usedWeight = Number(ad.current_used_weight) || 0;
    const usedVolume = Number(ad.current_used_volume) || 0;

    if (maxVolume <= maxWeight) {
      this.unusedCapacity = maxVolume - usedVolume;
      this.capacityUnit = "m³";
    } else {
      this.unusedCapacity = maxWeight - usedWeight;
      this.capacityUnit = "kg";
    }

    if (this.unusedCapacity < 0) this.unusedCapacity = 0;

    localStorage.setItem("capacityUnit", this.capacityUnit);
  }

  updateCapacityUI() {
    document.getElementById(
      "rentedCapacityTitle"
    ).textContent = `Rented capacity (${this.capacityUnit})`;

    this.rentedCapacityInput.value = this.unusedCapacity;
    this.rentedCapacityInput.max = this.unusedCapacity;
  }

  setupPricing() {
    const ad = this.selectedAd;

    this.distance = Number(localStorage.getItem("selected_distance")) || 150;
    this.priceKm =
      Number(localStorage.getItem("price_per_km")) || ad.price_per_km || 0;
    this.priceKg =
      Number(localStorage.getItem("price_per_kg")) || ad.price_per_kg || 0;
    this.priceM3 =
      Number(localStorage.getItem("price_per_m3")) || ad.price_per_m3 || 0;
  }

  updatePrice() {
    let rentedCapacity = Number(this.rentedCapacityInput.value) || 0;

    if (rentedCapacity < 0) rentedCapacity = 0;
    if (rentedCapacity > this.unusedCapacity)
      rentedCapacity = this.unusedCapacity;

    this.rentedCapacityInput.value = rentedCapacity;

    let price = this.distance * this.priceKm;

    if (this.capacityUnit === "kg") price += rentedCapacity * this.priceKg;
    else price += rentedCapacity * this.priceM3;

    this.currentPrice = price;

    document.getElementById("finalPrice").textContent =
      "SAR " + Math.round(price);
    localStorage.setItem("calculated_price", price);
  }

  renderRouteInfo() {
    const ad = this.selectedAd;

    document.getElementById(
      "route"
    ).textContent = `${ad.pickup_location} → ${ad.dropoff_location}`;

    document.getElementById("distance").textContent = this.distance + " km";

    document.getElementById("estimatedTime").textContent =
      Math.round(this.distance / 100) + " hrs";
  }

  submitBooking() {
    const rentedValue = Number(this.rentedCapacityInput.value);

    this.rentedCapacityError.style.display = "none";
    this.rentedCapacityInput.classList.remove("input-error");

    if (rentedValue === 0) {
      this.rentedCapacityError.innerHTML = `<i class="bi bi-exclamation-circle"></i> Capacity cannot be 0`;
      this.rentedCapacityError.style.display = "block";
      this.rentedCapacityInput.classList.add("input-error");
      return;
    }

    const ad = this.selectedAd;

    this.bookingInfo = {
      customer_id: localStorage.getItem("user_id"),
      truck_ad_id: localStorage.getItem("selected_ad_id"),
      weight_requested: rentedValue,
      price: this.currentPrice,
      pickup_location: ad.pickup_location,
      dropoff_location: ad.dropoff_location,
      route_distance: this.distance,
      trip_date: new Date().toISOString().slice(0, 10),
      capacityUnit: this.capacityUnit,
    };

    fetch("http://localhost:3000/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(this.bookingInfo),
    })
      .then((res) => res.json())
      .then((result) => {
        if (result.success) {
          this.showPopup();
        } else {
          alert("Booking failed");
        }
      });
  }

  showPopup() {
    const ad = this.selectedAd;

    document.getElementById("popupTruck").textContent = ad.truck_type;
    document.getElementById("popupDate").textContent =
      this.bookingInfo.trip_date;
    document.getElementById(
      "popupRoute"
    ).textContent = `${ad.pickup_location} → ${ad.dropoff_location}`;
    document.getElementById("popupPrice").textContent =
      "SAR " + Math.round(this.currentPrice);
    document.getElementById("popupStatus").textContent =
      "Pending Supplier Approval";

    document.getElementById("confirmationPopup").style.display = "flex";
  }
}

const booking = new Booking();
window.submitBooking = () => booking.submitBooking();
