const socket = io("http://localhost:3001");
let currentRoom = null;
let selectedAd = null;
let chatReady = false;

window.addEventListener("load", () => {
  loadSelectedAd();
  setActionButtonsState();

  const input = document.getElementById("chatMessageInput");
  if (input) {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        sendMessage();
      }
    });
  }
});

function goBackToAdvertising() {
  window.location.href = "/HTML/advertising.html";
}

function joinNegotiationRoom(roomCode) {
  if (!roomCode) return;
  currentRoom = roomCode;
  chatReady = true;

  const userId = Number(localStorage.getItem("user_id")) || 0;

  socket.emit("join_room", {
    roomCode,
    userId,
  });
}

function showConfirmationPopup(finalPrice) {
  const truck = selectedAd?.truck_type || "---";
  const date = new Date().toISOString().slice(0, 10);
  const route = `${selectedAd?.pickup_location || "---"} → ${selectedAd?.dropoff_location || "---"}`;

  document.getElementById("popupTruck").textContent = truck;
  document.getElementById("popupDate").textContent = date;
  document.getElementById("popupRoute").textContent = route;
  document.getElementById("popupPrice").textContent = `SAR ${finalPrice}`;
  document.getElementById("popupStatus").textContent = "Pending";

  document.getElementById("confirmationPopup").style.display = "flex";
}

function getBookingPayload() {
  const rentedVal = Number(localStorage.getItem("booked_capacity"));
  const finalPrice = Number(localStorage.getItem("calculated_price"));

  return {
    customer_id: localStorage.getItem("user_id"),
    truck_ad_id: localStorage.getItem("selected_ad_id"),
    weight_requested: rentedVal,
    price: finalPrice,
    trip_date: new Date().toISOString().slice(0, 10),
    capacityUnit: localStorage.getItem("capacityUnit"),
    pickup_location: selectedAd?.pickup_location || null,
    dropoff_location: selectedAd?.dropoff_location || null,
  };
}

async function ensureBookingRoom() {
  const storedRoom = localStorage.getItem("booking_room_code");
  const storedBookingId = localStorage.getItem("booking_id");
  const storedAdId = localStorage.getItem("booking_room_ad_id");
  const currentAdId = String(localStorage.getItem("selected_ad_id") || "");

  if (storedRoom && storedAdId === currentAdId) {
    currentRoom = storedRoom;
    chatReady = true;
    joinNegotiationRoom(storedRoom);
    return {
      success: true,
      room_code: storedRoom,
      booking_id: storedBookingId || "",
      reused: true,
    };
  }

  const payload = getBookingPayload();

  const res = await fetch("http://localhost:3001/book", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const result = await res.json();

  if (!result.success || !result.room_code) {
    return result;
  }

  currentRoom = result.room_code;
  chatReady = true;

  localStorage.setItem("booking_room_code", result.room_code);
  localStorage.setItem("booking_id", result.booking_id || "");
  localStorage.setItem("booking_room_ad_id", currentAdId);

  joinNegotiationRoom(result.room_code);

  return result;
}

function loadSelectedAd() {
  const adId = localStorage.getItem("selected_ad_id");
  if (!adId) {
    alert("No selected ad found.");
    return;
  }

  localStorage.removeItem("calculated_price");
  localStorage.removeItem("booked_capacity");
  localStorage.removeItem("capacityUnit");
  localStorage.removeItem("capacityUnitLabel");
  localStorage.removeItem("booking_room_code");
  localStorage.removeItem("booking_id");
  localStorage.removeItem("booking_room_ad_id");

  fetch(`http://localhost:3001/getAd/${adId}`)
    .then((res) => res.json())
    .then((data) => {
      if (!data.success || !data.ad) {
        alert("Ad not found.");
        return;
      }

      selectedAd = data.ad;

      document.getElementById("displayAdName").textContent =
        selectedAd.truck_type || "Confirm Booking";

      document.getElementById("bookingRoute").textContent =
        `${selectedAd.pickup_location || "---"} → ${selectedAd.dropoff_location || "---"}`;

      document.getElementById("bookingTruckId").textContent =
        selectedAd.truck_id || "---";

      document.getElementById("bookingBasePrice").textContent =
        `SAR ${Number(selectedAd.price) || 0}`;

      const maxW = Number(selectedAd.max_weight) || 0;
      const maxV = Number(selectedAd.max_volume) || 0;
      const usedW = Number(selectedAd.current_used_weight) || 0;
      const usedV = Number(selectedAd.current_used_volume) || 0;

      const remainingWeight = Math.max(maxW - usedW, 0);
      const remainingVolume = Math.max(maxV - usedV, 0);

      let unusedCapacity = 0;
      let unitLabel = "kg";
      let unitValue = "weight";

      if (remainingVolume <= remainingWeight) {
        unusedCapacity = remainingVolume;
        unitLabel = "m³";
        unitValue = "volume";
      } else {
        unusedCapacity = remainingWeight;
        unitLabel = "kg";
        unitValue = "weight";
      }

      localStorage.setItem("capacityUnit", unitValue);
      localStorage.setItem("capacityUnitLabel", unitLabel);

      document.getElementById("rentedCapacityTitle").textContent =
        `Required Capacity (${unitLabel})`;

      document.getElementById("availableCapacity").textContent =
        `${unusedCapacity} ${unitLabel}`;

      const input = document.getElementById("rentedCapacity");
      input.value = "";
      input.max = unusedCapacity;
      input.placeholder = `Max: ${unusedCapacity} ${unitLabel}`;

      document.getElementById("finalPrice").textContent = `SAR 0`;
      setActionButtonsState();
    })
    .catch((err) => {
      console.error("Fetch booking error:", err);
      alert("Server connection error");
    });
}

function updatePrice() {
  if (!selectedAd) return;

  const input = document.getElementById("rentedCapacity");
  const errorBox = document.getElementById("rentedCapacityError");
  const rentedVal = Number(input.value);
  const unitLabel = localStorage.getItem("capacityUnitLabel") || "kg";

  errorBox.textContent = "";

  const maxAllowed = Number(input.max);

  if (!rentedVal || rentedVal <= 0) {
    errorBox.textContent = "Please enter a valid capacity.";
    document.getElementById("finalPrice").textContent = `SAR 0`;
    localStorage.removeItem("calculated_price");
    localStorage.removeItem("booked_capacity");
    setActionButtonsState();
    return;
  }

  if (rentedVal > maxAllowed) {
    errorBox.textContent = `Requested capacity exceeds available space (${maxAllowed} ${unitLabel}).`;
    input.value = maxAllowed;
    document.getElementById("finalPrice").textContent = `SAR 0`;
    localStorage.removeItem("calculated_price");
    localStorage.removeItem("booked_capacity");
    setActionButtonsState();
    return;
  }

  const baseFlatPrice = Number(selectedAd.price) || 0;

     
const totalCapacity =
  (Number(selectedAd.max_weight) || 0) ||
  (Number(selectedAd.max_volume) || 0);

let total = baseFlatPrice;

if (totalCapacity > 0 && rentedVal < totalCapacity) {
  total = Math.round((rentedVal / totalCapacity) * baseFlatPrice * 100) / 100;
}

  document.getElementById("finalPrice").textContent = `SAR ${total}`;

  localStorage.setItem("calculated_price", total);
  localStorage.setItem("booked_capacity", rentedVal);
  setActionButtonsState();
}

async function openChat() {
  const customerId = localStorage.getItem("user_id");
  const truckAdId = localStorage.getItem("selected_ad_id");

  if (!customerId || !truckAdId) {
    showActionError("Missing user or ad information.");
    return;
  }

  if (!isPriceCalculated()) {
    showActionError("Please calculate the price first.");
    return;
  }

  const chatOverlay = document.getElementById("chatOverlay");
  const chatBody = document.getElementById("chatBody");
  const input = document.getElementById("chatMessageInput");

  if (chatOverlay) chatOverlay.classList.add("show");

  if (chatBody && !chatBody.dataset.initialized) {
    chatBody.innerHTML = `<div class="chat-day-label">Today</div>`;
    chatBody.dataset.initialized = "true";
  }

  if (input) input.focus();

  try {
    const result = await ensureBookingRoom();

    if (!result.success || !result.room_code) {
      showActionError(result.message || "Failed to open chat.");
      return;
    }

    loadChatHistory(result.room_code);
  } catch (err) {
    console.error("Open chat error:", err);
    showActionError("Server connection error while opening chat.");
  }
}

function showActionError(message) {
  const errorBox = document.getElementById("bookingActionError");
  if (!errorBox) return;

  errorBox.textContent = message;

  setTimeout(() => {
    errorBox.textContent = "";
  }, 3000);
}

function isPriceCalculated() {
  const calculatedPrice = Number(localStorage.getItem("calculated_price"));
  const bookedCapacity = Number(localStorage.getItem("booked_capacity"));
  return calculatedPrice > 0 && bookedCapacity > 0;
}

function setActionButtonsState() {
  const confirmBtn = document.querySelector(".confirm-btn-modern");
  const negotiationBtn = document.querySelector(".negotiation-btn-modern");

  if (!confirmBtn || !negotiationBtn) return;

  if (isPriceCalculated()) {
    confirmBtn.classList.remove("disabled");
    negotiationBtn.classList.remove("disabled");
  } else {
    confirmBtn.classList.add("disabled");
    negotiationBtn.classList.add("disabled");
  }
}

function closeChat() {
  document.getElementById("chatOverlay").classList.remove("show");
}

function sendMessage() {
  const input = document.getElementById("chatMessageInput");
  const messageText = input.value.trim();
  const senderId = localStorage.getItem("user_id");

  if (!messageText) return;

  if (!chatReady || !currentRoom) {
    showActionError("Please wait a moment until the chat room is ready.");
    return;
  }

  if (!senderId) {
    showActionError("Please log in first.");
    return;
  }

  const payload = {
    roomCode: currentRoom,
    senderId: Number(senderId),
    text: messageText,
    messageType: "text",
  };

  socket.emit("send_message", payload);

  appendMessage(
    {
      message_text: messageText,
      sender_id: Number(senderId),
    },
    "sent",
  );

  input.value = "";
}

socket.off("receive_message");
socket.on("receive_message", (data) => {
  const senderId = Number(localStorage.getItem("user_id"));

  if (data.room_code && currentRoom && data.room_code !== currentRoom) return;
  if (Number(data.sender_id) === senderId) return;

  appendMessage(data, "received");
});

function loadChatHistory(roomCode) {
  if (!roomCode) return;

  fetch(`http://localhost:3001/api/chat/messages/${encodeURIComponent(roomCode)}`)
    .then((res) => res.json())
    .then((data) => {
      if (!data.success) return;

      const chatBody = document.getElementById("chatBody");
      if (!chatBody) return;

      chatBody.innerHTML = `<div class="chat-day-label">Today</div>`;

      const currentUserId = Number(localStorage.getItem("user_id"));

      (data.messages || []).forEach((msg) => {
        const type =
          Number(msg.sender_id) === currentUserId ? "sent" : "received";
        appendMessage(msg, type);
      });
    })
    .catch((err) => {
      console.error("Load chat history error:", err);
    });
}

function appendMessage(data, type) {
  const chatBody = document.getElementById("chatBody");
  if (!chatBody) return;

  const wrapper = document.createElement("div");
  wrapper.className = `chat-message ${type}`;

  const bubble = document.createElement("div");
  bubble.className = "chat-bubble";
  bubble.textContent = data.message_text || data.text || data.message || "";

  const meta = document.createElement("div");
  meta.className = "chat-meta";

  let timeText = "";
  if (data.created_at) {
    const d = new Date(data.created_at);
    timeText = Number.isNaN(d.getTime())
      ? ""
      : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } else {
    const now = new Date();
    timeText = now.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  meta.textContent =
    type === "sent" ? `You • ${timeText}` : `Owner • ${timeText}`;

  wrapper.appendChild(bubble);
  wrapper.appendChild(meta);

  chatBody.appendChild(wrapper);
  chatBody.scrollTop = chatBody.scrollHeight;
}

async function submitBooking() {
  const rentedVal = Number(localStorage.getItem("booked_capacity"));
  const finalPrice = Number(localStorage.getItem("calculated_price"));

  if (!rentedVal || rentedVal <= 0) {
    alert("Please calculate the price before confirming.");
    return;
  }

  if (!isPriceCalculated()) {
    showActionError("Please calculate the price first.");
    return;
  }

  try {
    const existingRoom = localStorage.getItem("booking_room_code");
    const existingAdId = localStorage.getItem("booking_room_ad_id");
    const currentAdId = String(localStorage.getItem("selected_ad_id") || "");

    if (existingRoom && existingAdId === currentAdId) {
      currentRoom = existingRoom;
      chatReady = true;
      joinNegotiationRoom(existingRoom);
      showConfirmationPopup(finalPrice);
      return;
    }

    const result = await ensureBookingRoom();

    if (!result.success) {
      alert(result.message || "Booking failed.");
      console.error("Booking response:", result);
      return;
    }

    showConfirmationPopup(finalPrice);
  } catch (err) {
    console.error("Booking request error:", err);
    alert("Server connection error while booking.");
  }
}