const API_BASE = window.location.origin;
const socket = io();

const $ = (id) => document.getElementById(id);

function getParams() {
  const url = new URL(window.location.href);
  return {
    room: url.searchParams.get("room"),
    ad: url.searchParams.get("ad"),
    name: url.searchParams.get("name"),
    booking: url.searchParams.get("booking"),
  };
}

function escapeHTML(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatTime(dateString) {
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatMoney(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "—";
  return `${num} SAR`;
}

function extractOfferValue(text) {
  const match = String(text || "").match(/(\d+(\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

const params = getParams();
const roomCode = params.room || localStorage.getItem("chat_room_id") || "";
const peerName =
  params.name || localStorage.getItem("chat_customer_name") || "Customer";

const currentUserId =
  Number(localStorage.getItem("user_id")) ||
  Number(localStorage.getItem("chat_current_user_id")) ||
  1;

const currentUserType =
  localStorage.getItem("user_type") ||
  localStorage.getItem("chat_current_user_type") ||
  "Truck owner";

let latestOfferValue = null;
let currentDealStatus = "Pending";
let roomOwnerId = null;
let roomCustomerId = null;
let roomOwnerAccepted = 0;
let roomCustomerAccepted = 0;

let isSendingText = false;
let isSendingOffer = false;
let lastSentSignature = "";

if (!roomCode) {
  alert("No chat room found.");
  window.location.href = "/HTML/Notifications.html";
}

function removeUnwantedChatUI() {
  const dealPanel = document.getElementById("dealPanel");
  if (dealPanel) {
    dealPanel.remove();
  }

  const pricePill = document.getElementById("pricePill");
  if (pricePill) {
    pricePill.remove();
  }

  const clearBtn = document.getElementById("clearBtn");
  if (clearBtn) {
    clearBtn.remove();
  }

  const summaryCustomer = document.getElementById("summaryCustomer");
  const summaryAd = document.getElementById("summaryAd");
  const summaryRoom = document.getElementById("summaryRoom");
  const summaryStatus = document.getElementById("summaryStatus");

  if (summaryCustomer) summaryCustomer.textContent = "";
  if (summaryAd) summaryAd.textContent = "";
  if (summaryRoom) summaryRoom.textContent = "";
  if (summaryStatus) summaryStatus.textContent = "";
}

if ($("peerName")) $("peerName").textContent = peerName;
if ($("peerSub")) $("peerSub").textContent = "";

removeUnwantedChatUI();

socket.emit("join_room", {
  roomCode,
  userId: currentUserId,
});

function showToast(message, type = "success") {
  const toast = $("toastMessage");
  if (!toast) return;

  toast.textContent = message;
  toast.className = `toast-message show ${type}`;

  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(() => {
    toast.className = "toast-message";
  }, 2500);
}

function setNegotiationState(status, metaText = "") {
  const stateEl = $("negotiationState");
  const metaEl = $("negotiationMeta");

  if (!stateEl || !metaEl) return;

  stateEl.className = "negotiation-state";

  if (status === "Accepted") {
    stateEl.classList.add("accepted");
    stateEl.textContent = "Accepted";
  } else if (status === "Rejected") {
    stateEl.classList.add("rejected");
    stateEl.textContent = "Rejected";
  } else {
    stateEl.classList.add("waiting");
    stateEl.textContent = "Waiting";
  }

  metaEl.textContent = metaText || "";
}

function updateButtonsState() {
  const acceptBtn = $("acceptBtn");
  const rejectBtn = $("rejectBtn");
  const sendBtn = $("sendBtn");
  const sendOfferBtn = $("sendOfferBtn");

  if (acceptBtn) {
    const alreadyAccepted =
      Number(currentUserId) === Number(roomOwnerId)
        ? Number(roomOwnerAccepted) === 1
        : Number(roomCustomerAccepted) === 1;

    acceptBtn.disabled =
      latestOfferValue == null ||
      currentDealStatus === "Accepted" ||
      currentDealStatus === "Rejected" ||
      alreadyAccepted;
  }

  if (rejectBtn) {
    rejectBtn.disabled =
      currentDealStatus === "Accepted" || currentDealStatus === "Rejected";
  }

  if (sendBtn) {
    sendBtn.disabled =
      isSendingText ||
      currentDealStatus === "Accepted" ||
      currentDealStatus === "Rejected";
  }

  if (sendOfferBtn) {
    sendOfferBtn.disabled =
      isSendingOffer ||
      currentDealStatus === "Accepted" ||
      currentDealStatus === "Rejected";
  }
}

function updateOfferUI() {
  const priceEl = $("negotiationPrice");
  const offerValueEl = $("offerValue");

  if (priceEl) {
    priceEl.textContent =
      latestOfferValue != null ? formatMoney(latestOfferValue) : "— SAR";
  }

  if (offerValueEl) {
    offerValueEl.textContent =
      latestOfferValue != null ? latestOfferValue : "—";
  }

  updateButtonsState();
}

function renderRoom(room) {
  roomOwnerId = room.owner_id ?? null;
  roomCustomerId = room.customer_id ?? null;
  roomOwnerAccepted = Number(room.owner_accepted) || 0;
  roomCustomerAccepted = Number(room.customer_accepted) || 0;

  latestOfferValue =
    room.current_offer != null && room.current_offer !== ""
      ? Number(room.current_offer)
      : room.booking_price != null && room.booking_price !== ""
        ? Number(room.booking_price)
        : null;

  currentDealStatus = room.deal_status || "Pending";

  if (currentDealStatus === "Accepted") {
    setNegotiationState("Accepted", "Both parties approved the deal.");
  } else if (currentDealStatus === "Rejected") {
    setNegotiationState("Rejected", "The negotiation has been rejected.");
  } else if (roomOwnerAccepted || roomCustomerAccepted) {
    const iAmOwner = Number(currentUserId) === Number(roomOwnerId);
    const iAccepted = iAmOwner ? roomOwnerAccepted : roomCustomerAccepted;

    if (iAccepted) {
      setNegotiationState(
        "Waiting",
        "You accepted. Waiting for the other party.",
      );
    } else {
      setNegotiationState(
        "Waiting",
        "The other party accepted. Waiting for you.",
      );
    }
  } else if (latestOfferValue != null) {
    setNegotiationState(
      "Waiting",
      "Initial offered price is available. You can accept it or send a new offer.",
    );
  } else {
    setNegotiationState("Waiting", "No active offer yet.");
  }

  updateOfferUI();
}

function renderMessage(m) {
  const box = $("messages");
  if (!box) return;

  const div = document.createElement("div");
  const isMe = Number(m.sender_id) === Number(currentUserId);
  const isOffer = m.message_type === "offer";

  div.className = `msg ${isMe ? "me" : ""} ${isOffer ? "offer-msg" : ""}`;

  if (isOffer) {
    const offerValue = extractOfferValue(m.message_text);

    if (offerValue != null) {
      latestOfferValue = offerValue;
      updateOfferUI();
    }

    div.innerHTML = `
      <div class="offer-amount">
        💰 ${
          offerValue != null
            ? formatMoney(offerValue)
            : escapeHTML(m.message_text || "")
        }
      </div>
      <div class="offer-caption">
        Price proposal from ${
          isMe ? "you" : escapeHTML(m.sender_name || peerName)
        }
      </div>
      <div class="meta">
        <span class="tag">Offer</span>
        <span>${isMe ? "You" : escapeHTML(m.sender_name || peerName)}</span>
        <span>•</span>
        <span>${formatTime(m.created_at)}</span>
      </div>
    `;
  } else {
    const tag =
      m.message_type === "system" ? `<span class="tag">System</span>` : "";

    div.innerHTML = `
      <div class="text">${escapeHTML(m.message_text || "")}</div>
      <div class="meta">
        ${tag}
        <span>${isMe ? "You" : escapeHTML(m.sender_name || peerName)}</span>
        <span>•</span>
        <span>${formatTime(m.created_at)}</span>
      </div>
    `;
  }

  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

async function loadRoom() {
  try {
    const res = await fetch(
      `${API_BASE}/api/chat/room/${encodeURIComponent(roomCode)}`,
    );
    const data = await res.json();

    if (!data.success) {
      console.error("Load room failed:", data.message);
      return;
    }

    renderRoom(data.room);
  } catch (error) {
    console.error("Load room error:", error);
  }
}

async function loadMessages() {
  try {
    const res = await fetch(
      `${API_BASE}/api/chat/messages/${encodeURIComponent(roomCode)}`,
    );
    const data = await res.json();

    if (!data.success) {
      console.error("Load messages failed:", data.message);
      return;
    }

    const box = $("messages");
    if (!box) return;

    box.innerHTML = "";

    (data.messages || []).forEach(renderMessage);
    updateOfferUI();
  } catch (error) {
    console.error("Load messages error:", error);
  }
}

async function markRoomNotificationsRead() {
  try {
    await fetch(
      `${API_BASE}/api/notifications/room/${encodeURIComponent(roomCode)}/read`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: currentUserId }),
      },
    );
  } catch (error) {
    console.error("Mark room notifications read error:", error);
  }
}

function preventDuplicate(signature) {
  if (lastSentSignature === signature) return true;

  lastSentSignature = signature;
  setTimeout(() => {
    if (lastSentSignature === signature) {
      lastSentSignature = "";
    }
  }, 1200);

  return false;
}

function sendText() {
  const input = $("textInput");
  const text = input?.value.trim();

  if (!text || !roomCode || isSendingText) return;

  const signature = `text:${text}`;
  if (preventDuplicate(signature)) return;

  isSendingText = true;
  updateButtonsState();

  const clientMsgId = generateClientMsgId();

  socket.emit("send_message", {
    roomCode,
    senderId: currentUserId,
    text,
    messageType: "text",
    clientMsgId,
  });

  input.value = "";

  setTimeout(() => {
    isSendingText = false;
    updateButtonsState();
  }, 400);
}

function sendOffer() {
  const offerInput = $("offerInput");
  const offer = Number(offerInput?.value);

  if (!roomCode || !Number.isFinite(offer) || offer <= 0 || isSendingOffer) {
    showToast("Please enter a valid offer", "error");
    return;
  }

  const signature = `offer:${offer}`;
  if (preventDuplicate(signature)) return;

  isSendingOffer = true;
  updateButtonsState();

  const clientMsgId = generateClientMsgId();

  socket.emit("send_message", {
    roomCode,
    senderId: currentUserId,
    text: `Offered price: ${offer} SAR`,
    messageType: "offer",
    offerValue: offer,
    clientMsgId,
  });

  offerInput.value = "";
  latestOfferValue = offer;
  roomOwnerAccepted = 0;
  roomCustomerAccepted = 0;
  currentDealStatus = "Pending";

  updateOfferUI();
  setNegotiationState("Waiting", "Offer sent. Waiting for the other party.");

  setTimeout(() => {
    isSendingOffer = false;
    updateButtonsState();
  }, 400);

  showToast("Offer sent successfully", "success");
}

function updateStatus(status) {
  if (!roomCode) return;

  if (currentDealStatus === "Accepted" || currentDealStatus === "Rejected") {
    showToast("This booking is already finalized.", "error");
    return;
  }

  socket.emit("update_status", {
    roomCode,
    senderId: currentUserId,
    status,
  });
}

async function clearChat() {
  return;
}

socket.off("chat_cleared");
socket.on("chat_cleared", ({ roomCode: updatedRoomCode }) => {
  if (updatedRoomCode !== roomCode) return;
  $("messages").innerHTML = "";
});

socket.off("message_blocked");
socket.on("message_blocked", ({ reason }) => {
  showToast(reason || "This action is no longer allowed", "error");
});

async function markMessagesSeen() {
  try {
    await fetch(
      `${API_BASE}/api/chat/messages/${encodeURIComponent(roomCode)}/seen`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ viewerId: currentUserId }),
      },
    );
  } catch (error) {
    console.error("Mark seen error:", error);
  }
}

socket.off("receive_message");
socket.off("status_updated");
socket.off("typing_start");
socket.off("typing_stop");

socket.on("receive_message", (msg) => {
  if (msg.room_code && msg.room_code !== roomCode) return;

  renderMessage(msg);

  if (Number(msg.sender_id) !== Number(currentUserId)) {
    markMessagesSeen();
  }

  if (msg.message_type === "offer") {
    const offerValue = extractOfferValue(msg.message_text);
    if (offerValue != null) {
      latestOfferValue = offerValue;
      roomOwnerAccepted = 0;
      roomCustomerAccepted = 0;
      currentDealStatus = "Pending";

      updateOfferUI();

      if (Number(msg.sender_id) === Number(currentUserId)) {
        setNegotiationState(
          "Waiting",
          "Offer sent. Waiting for the other party.",
        );
      } else {
        setNegotiationState(
          "Waiting",
          "New offer received. Review and respond.",
        );
      }
    }
  }

  loadRoom();
});

let typingTimer = null;

$("textInput")?.addEventListener("input", () => {
  socket.emit("typing_start", {
    roomCode,
    senderId: currentUserId,
  });

  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    socket.emit("typing_stop", {
      roomCode,
      senderId: currentUserId,
    });
  }, 1200);
});

socket.on("typing_start", ({ senderId }) => {
  if (Number(senderId) === Number(currentUserId)) return;
  const el = $("typingIndicator");
  if (el) el.style.display = "block";
});

socket.on("typing_stop", ({ senderId }) => {
  if (Number(senderId) === Number(currentUserId)) return;
  const el = $("typingIndicator");
  if (el) el.style.display = "none";
});

function generateClientMsgId() {
  return `msg_${currentUserId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

socket.on(
  "status_updated",
  ({ roomCode: updatedRoomCode, status, acceptedBy }) => {
    if (updatedRoomCode && updatedRoomCode !== roomCode) return;

    if (status === "Accepted") {
      currentDealStatus = "Accepted";
      setNegotiationState("Accepted", "Both parties approved the deal.");
      showToast("The deal has been accepted", "success");

      if (currentUserType === "Customer") {
        setTimeout(() => {
          window.location.href = "/HTML/trackShipment.html";
        }, 1200);
      }
    } else if (status === "Rejected") {
      currentDealStatus = "Rejected";
      roomOwnerAccepted = 0;
      roomCustomerAccepted = 0;
      setNegotiationState("Rejected", "The negotiation has been rejected.");
      showToast("The negotiation has been rejected", "error");
    } else if (status === "Waiting") {
      currentDealStatus = "Pending";

      if (Number(acceptedBy) === Number(roomOwnerId)) {
        roomOwnerAccepted = 1;
      } else if (Number(acceptedBy) === Number(roomCustomerId)) {
        roomCustomerAccepted = 1;
      }

      if (Number(acceptedBy) === Number(currentUserId)) {
        setNegotiationState(
          "Waiting",
          "You accepted. Waiting for the other party.",
        );
        showToast(
          "Your acceptance has been recorded. Waiting for the other party.",
          "success",
        );
      } else {
        setNegotiationState(
          "Waiting",
          "The other party accepted. Waiting for you.",
        );
        showToast(
          "The other party accepted the offer. You can now confirm it.",
          "success",
        );
      }
    }

    updateButtonsState();
    loadRoom();
    loadMessages();
    markMessagesSeen();
  },
);

$("backBtn")?.addEventListener("click", () => {
  window.location.href = "Notifications.html";
});

$("sendBtn")?.addEventListener("click", sendText);

$("textInput")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendText();
  }
});

$("sendOfferBtn")?.addEventListener("click", sendOffer);

$("offerInput")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    sendOffer();
  }
});

$("acceptBtn")?.addEventListener("click", () => {
  if (latestOfferValue == null) {
    showToast("There is no active offer to accept", "error");
    return;
  }

  updateStatus("Accepted");
});

$("rejectBtn")?.addEventListener("click", () => {
  updateStatus("Rejected");
});

updateOfferUI();
loadRoom();
loadMessages();
markMessagesSeen();
markRoomNotificationsRead();