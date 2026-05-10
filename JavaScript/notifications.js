const API_BASE = window.location.origin;
const CHAT_PAGE = "/HTML/chat.html";
const socket = io();

const $ = (id) => document.getElementById(id);

const CURRENT_USER_ID = Number(localStorage.getItem("user_id")) || 0;
const CURRENT_USERNAME = localStorage.getItem("username") || "User";
const CURRENT_USER_TYPE = (localStorage.getItem("user_type") || "").trim();

const CURRENT_USER_ROLE =
  CURRENT_USER_TYPE.toLowerCase() === "truck owner".toLowerCase()
    ? "owner"
    : "customer";

const state = {
  filter: "all",
  search: "",
  items: [],
};

function formatDateTime(dateString) {
  if (!dateString) return "—";
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return dateString;
  return d.toLocaleString();
}

function formatMoney(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "0 SAR";
  return `${num} SAR`;
}

function setRoleBasedText() {
  const subtitle = document.querySelector(".page-subtitle");
  const searchInput = $("searchInput");
  const hint = document.querySelector(".panel-hint");
  const ownerName = $("ownerName");

  if (ownerName) {
    ownerName.textContent =
      CURRENT_USER_ROLE === "owner" ? "Truck Owner" : "Customer";
  }

  if (CURRENT_USER_ROLE === "owner") {
    if (subtitle) {
      subtitle.textContent =
        "Rental requests & messages that need your action.";
    }
    if (searchInput) {
      searchInput.placeholder = "Search by customer, route, or price…";
    }
    if (hint) {
      hint.textContent = 'Accept directly or click "Open Chat" to negotiate.';
    }
  } else {
    if (subtitle) {
      subtitle.textContent =
        "Updates from truck owners and your request conversations.";
    }
    if (searchInput) {
      searchInput.placeholder = "Search by truck owner, route, or price…";
    }
    if (hint) {
      hint.textContent = "Approve or reject offers from here.";
    }
  }
}

function counts() {
  const unread = state.items.filter((i) => i.unread).length;
  const req = state.items.filter(
    (i) => i.unread && i.type === "rental_request"
  ).length;
  const msg = state.items.filter(
    (i) => i.unread && i.type === "message"
  ).length;

  return { unread, req, msg };
}

function getSidebarHTML(role) {
  const badge = `<span id="navBadge" class="nav-badge" style="display:none;">0</span>`;

  if (role === "owner") {
    return `
    <div class="brand">
      <div class="brand-logo">
        <i class="bi bi-box-seam-fill"></i>
      </div>

      <div class="brand-text-wrap">
        <div class="brand-text-main">LRS</div>
        <span class="brand-divider"></span>
        <div class="brand-text-sub">Truck Space Rental</div>
      </div>
    </div>

    <nav class="nav">
      <a class="nav-item" href="/HTML/Dashboard.html">
        <i class="bi bi-house-door"></i>
        <span>Dashboard</span>
      </a>

      <a class="nav-item" href="/HTML/postForm.html">
        <i class="bi bi-megaphone"></i>
        <span>Post an ad</span>
      </a>

      <a class="nav-item" href="/HTML/requestsPage.html">
        <i class="bi bi-clipboard-check"></i>
        <span>Requests page</span>
      </a>

      <a class="nav-item active" href="/HTML/Notifications.html">
        <i class="bi bi-bell"></i>
        <span>Notifications</span>
        ${badge}
      </a>

      <a class="nav-item logout" href="/HTML/HomePage.html" id="logoutBtn">
        <i class="bi bi-box-arrow-right"></i>
        <span>Log out</span>
      </a>
    </nav>
    `;
  }

  return `
    <div class="brand">
      <div class="brand-logo">
        <i class="bi bi-box-seam-fill"></i>
      </div>

      <div class="brand-text-wrap">
        <div class="brand-text-main">LRS</div>
        <span class="brand-divider"></span>
        <div class="brand-text-sub">Truck Space Rental</div>
      </div>
    </div>

    <nav class="nav">
      <a class="nav-item" href="/HTML/advertising.html">
        <i class="bi bi-badge-ad"></i>
        <span>Advertising Page</span>
      </a>

      <a class="nav-item" href="/HTML/requestForm.html">
        <i class="bi bi-card-heading"></i>
        <span>Post a request</span>
      </a>

      <a class="nav-item" href="/HTML/trackShipment.html">
        <i class="bi bi-geo-alt"></i>
        <span>Track My Shipment</span>
      </a>

      <a class="nav-item active" href="/HTML/Notifications.html">
        <i class="bi bi-bell"></i>
        <span>Notifications</span>
        ${badge}
      </a>

      <a class="nav-item logout" href="/HTML/HomePage.html" id="logoutBtn">
        <i class="bi bi-box-arrow-right"></i>
        <span>Log out</span>
      </a>
    </nav>
  `;
}

function renderSidebar() {
  const sidebar = document.getElementById("sidebar");
  if (!sidebar) return;

  const role = CURRENT_USER_ROLE === "owner" ? "owner" : "customer";

  sidebar.innerHTML = getSidebarHTML(role);

  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      localStorage.clear();
    });
  }
}

function setCountsUI() {
  const c = counts();

  if ($("unreadCount")) $("unreadCount").textContent = c.unread;
  if ($("reqCount")) $("reqCount").textContent = c.req;
  if ($("msgCount")) $("msgCount").textContent = c.msg;
  if ($("heroUnreadCount")) $("heroUnreadCount").textContent = c.unread;
  if ($("heroMsgCount")) $("heroMsgCount").textContent = c.msg;

  const navBadge = $("navBadge");
  if (navBadge) navBadge.textContent = c.unread;
}

function typeLabel(type) {
  if (type === "recommendation") return "Recommended Ad ⭐";
  if (type === "rental_request") return "Rental Request";
  if (type === "message") return "New Message";
  if (type === "offer") return "New Offer";
  if (type === "booking") return "Booking";
  if (type === "shipment_started") return "Shipment Started";
  if (type === "approved") return "Approved";
  if (type === "rejected") return "Rejected";
  return "Notification";
}

function iconClass(type) {
  if (type === "recommendation")
    return { box: "recommend", icon: "bi bi-star-fill" };
  if (type === "rental_request") return { box: "req", icon: "bi bi-inboxes" };
  if (type === "message") return { box: "msg", icon: "bi bi-chat-dots" };
  if (type === "offer") return { box: "offer", icon: "bi bi-cash-coin" };
  if (type === "booking") return { box: "req", icon: "bi bi-calendar-check" };
  if (type === "shipment_started")
    return { box: "tracking", icon: "bi bi-truck" };
  if (type === "approved") return { box: "ok", icon: "bi bi-check2-circle" };
  if (type === "rejected") return { box: "ok", icon: "bi bi-x-circle" };
  return { box: "ok", icon: "bi bi-bell" };
}

function getNotificationClass(item) {
  if (item.type === "recommendation") return "notif-recommend";
  if (item.type === "shipment_started") return "notif-tracking";
  if (item.finalState === "approved") return "notif-success";
  if (item.finalState === "rejected") return "notif-error";
  return "notif-default";
}

function matchesFilter(item) {
  if (state.filter === "all") return true;
  if (state.filter === "unread") return item.unread;
  return item.type === state.filter;
}

function matchesSearch(item) {
  const q = state.search.toLowerCase().trim();
  if (!q) return true;

  const blob =
    `${item.senderName} ${item.route} ${item.goods} ${item.requestedSpace} ${item.priceOffer} ${item.lastMessage || ""}`.toLowerCase();

  return blob.includes(q);
}

function canAccept(item) {
  return (
    !item.isFinal &&
    (
      (CURRENT_USER_ROLE === "owner" &&
        (item.type === "rental_request" || item.type === "message")) ||
      (CURRENT_USER_ROLE === "customer" && item.type === "offer")
    )
  );
}

function canReject(item) {
  return (
    !item.isFinal &&
    (
      (CURRENT_USER_ROLE === "owner" &&
        (item.type === "rental_request" || item.type === "message")) ||
      (CURRENT_USER_ROLE === "customer" && item.type === "offer")
    )
  );
}

function canOpenChat(item) {
  if (!item.roomId) return false;

  if (CURRENT_USER_ROLE === "customer" && item.type === "offer") {
    return false;
  }

  if (item.type === "rental_request") {
    return false;
  }

  return (
    item.type === "message" ||
    item.type === "approved" ||
    item.type === "rejected"
  );
}

function normalizeNotification(n) {
  const pickup = n.pickup_location || "";
  const dropoff = n.dropoff_location || "";
  const route =
    pickup && dropoff ? `${pickup} → ${dropoff}` : pickup || dropoff || "—";

  const currentOffer =
    n.current_offer != null && n.current_offer !== ""
      ? Number(n.current_offer)
      : null;

  const bookingPrice =
    n.booking_price != null && n.booking_price !== ""
      ? Number(n.booking_price)
      : null;

  const finalPrice = bookingPrice != null ? bookingPrice : (currentOffer ?? 0);

  const capacityText =
    n.booked_capacity != null
      ? `${n.booked_capacity} m³`
      : n.good_weight != null
        ? `${n.good_weight} KG`
        : n.good_volume != null
          ? `${n.good_volume} m³`
          : n.max_volume != null
            ? `${n.max_volume} m³`
            : n.max_weight != null
              ? `${n.max_weight} KG`
              : "—";

  const lowerBody = String(n.body || "").toLowerCase();
  const isApproved =
    n.type === "approved" ||
    lowerBody.includes("accepted") ||
    lowerBody.includes("approved");
  const isRejected =
    n.type === "rejected" || lowerBody.includes("rejected");

  return {
    id: String(n.id),
    offerId: String(n.offer_id || ""),
    type: n.type,
    unread: !Boolean(n.is_read),
    senderName: n.sender_name || (n.type === "shipment_started" ? "System" : "Unknown"),
    route,
    goods: n.good_type || "General Goods",
    requestedSpace: capacityText,
    requestedCapacity:
      n.booked_capacity != null ? Number(n.booked_capacity) : null,
    initialPrice: bookingPrice ?? finalPrice,
    priceOffer: finalPrice,
    truckType: n.truck_type || "",
    truckDepartureDate: n.truck_departure_date || "",
    time: formatDateTime(n.created_at),
    roomId: n.room_code || "",
    adId: n.truck_ad_id || "",
    bookingId: n.booking_id || "",
    lastMessage: n.body || "",
    isFinal: isApproved || isRejected,
    finalState: isApproved ? "approved" : isRejected ? "rejected" : "pending",
    roomDealStatus: null,
    originType: n.type,
  };
}

async function enrichRoomStatuses(items) {
  const roomIds = [...new Set(items.map((i) => i.roomId).filter(Boolean))];

  await Promise.all(
    roomIds.map(async (roomId) => {
      try {
        const res = await fetch(
          `${API_BASE}/api/chat/room/${encodeURIComponent(roomId)}`
        );
        const data = await res.json();
        if (!data.success || !data.room) return;

        const dealStatus = String(data.room.deal_status || "").trim();

        items.forEach((item) => {
          if (item.roomId === roomId) {
            item.roomDealStatus = dealStatus;

            if (dealStatus === "Accepted") {
              item.isFinal = true;
              item.finalState = "approved";
            } else if (dealStatus === "Rejected") {
              item.isFinal = true;
              item.finalState = "rejected";
            }
          }
        });
      } catch (err) {
        console.error("Room status enrich error:", err);
      }
    })
  );
}

async function loadNotifications() {
  if (!CURRENT_USER_ID) {
    state.items = [];
    render();
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/notifications/${CURRENT_USER_ID}`);
    const data = await res.json();

    console.log(data.notifications);
    console.log("API RESPONSE =>", data);

    if (!data.success) {
      console.error("Failed to load notifications:", data.message);
      state.items = [];
      render();
      return;
    }

    state.items = Array.isArray(data)
      ? data
      : (data.notifications || [])
          .filter((n) => !String(n.room_code || "").startsWith("inquiry_"))
          .map(normalizeNotification);

    await enrichRoomStatuses(state.items);
    render();
  } catch (error) {
    console.error("Load notifications error:", error);
    state.items = [];
    render();
  }
}

async function openChat(item) {
  if (!item.roomId) {
    alert("No chat room is linked to this notification yet.");
    return;
  }

  try {
    if (item.unread) {
      await markRead(item.id);
    }
  } catch (error) {
    console.error(
      "Failed to mark notification as read before opening chat:",
      error
    );
  }

  localStorage.setItem("chat_room_id", item.roomId);
  localStorage.setItem("chat_customer_name", item.senderName);
  localStorage.setItem("chat_ad_id", String(item.adId || ""));
  localStorage.setItem("chat_booking_id", String(item.bookingId || ""));
  localStorage.setItem("chat_current_user_id", String(CURRENT_USER_ID));
  localStorage.setItem("chat_current_user_type", CURRENT_USER_TYPE);
  localStorage.setItem("chat_current_user_role", CURRENT_USER_ROLE);

  window.location.href =
    `${CHAT_PAGE}?room=${encodeURIComponent(item.roomId)}` +
    `&ad=${encodeURIComponent(item.adId || "")}` +
    `&name=${encodeURIComponent(item.senderName)}` +
    `&booking=${encodeURIComponent(item.bookingId || "")}`;
}

async function openTracking(item) {
  if (!item.bookingId) {
    alert("This shipment notification is missing the booking id.");
    return;
  }

  try {
    if (item.unread) {
      await markRead(item.id);
    }
  } catch (error) {
    console.error("Failed to mark tracking notification as read:", error);
  }

  window.location.href = `/HTML/trackShipment.html?shipment=${encodeURIComponent(item.bookingId)}`;
}

async function markRead(id) {
  try {
    const res = await fetch(`${API_BASE}/api/notifications/${id}/read`, {
      method: "PATCH",
    });
    const data = await res.json();

    if (!data.success) return;

    const it = state.items.find((x) => x.id === id);
    if (it) it.unread = false;

    render();
  } catch (error) {
    console.error("Mark read error:", error);
  }
}

async function markAllRead() {
  try {
    const res = await fetch(
      `${API_BASE}/api/notifications/mark-all/${CURRENT_USER_ID}`,
      { method: "PATCH" }
    );
    const data = await res.json();

    if (!data.success) return;

    state.items.forEach((i) => {
      i.unread = false;
    });

    render();
  } catch (error) {
    console.error("Mark all read error:", error);
  }
}

function markLocalItemFinal(item, finalState) {
  item.isFinal = true;
  item.finalState = finalState;
  item.unread = false;
  item.type = finalState === "approved" ? "approved" : "rejected";
}

async function acceptRequest(item) {
  if (item.isFinal) {
    await loadNotifications();
    return;
  }

  if (item.type === "offer") {
    try {
      const res = await fetch(`${API_BASE}/api/offers/${item.offerId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "Accepted",
          sender_id: CURRENT_USER_ID,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        alert(data.message || "Failed to accept offer");
        return;
      }

      markLocalItemFinal(item, "approved");
      render();
      return;
    } catch (err) {
      console.error(err);
      return;
    }
  }

  if (item.type === "rental_request" || item.type === "message") {
    try {
      const res = await fetch(`${API_BASE}/api/chat/room/${item.roomId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "Accepted",
          senderId: CURRENT_USER_ID,
        }),
      });

      const data = await res.json();

      if (!data.success) {
        alert(data.message || "Failed to accept request");
        return;
      }

      await loadNotifications();
      return;
    } catch (err) {
      console.error(err);
      return;
    }
  }
}

async function rejectRequest(item) {
  if (item.isFinal) {
    await loadNotifications();
    return;
  }

  if (item.type === "offer") {
    try {
      const res = await fetch(`${API_BASE}/api/offers/${item.offerId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "Rejected",
          sender_id: CURRENT_USER_ID,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        alert(data.message || "Failed to reject offer");
        return;
      }

      markLocalItemFinal(item, "rejected");
      render();
      return;
    } catch (err) {
      console.error(err);
      return;
    }
  }

  if (item.type === "rental_request" || item.type === "message") {
    try {
      const res = await fetch(`${API_BASE}/api/chat/room/${item.roomId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "Rejected",
          senderId: CURRENT_USER_ID,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        alert(data.message || "Failed to reject request");
        return;
      }

      await loadNotifications();
      return;
    } catch (err) {
      console.error(err);
      return;
    }
  }
}

async function deleteNotification(id) {
 
  const element = document
    .querySelector(`[data-id="${id}"]`)
    ?.closest(".notif");

  if (element) {
    element.classList.add("removing");
  }

  setTimeout(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/notifications/${id}`, {
        method: "DELETE",
      });

      const data = await res.json();
      if (!data.success) return;

      state.items = state.items.filter((n) => n.id !== id);
      render();
    } catch (err) {
      console.error(err);
    }
  }, 250);
}

function buildActionButtons(item) {
  const main = [];

  if (item.type === "shipment_started") {
    main.push(`
      <button class="btn btn-small btn-primary" data-action="track" data-id="${item.id}">
        <i class="bi bi-geo-alt"></i> Track Now
      </button>
    `);
  } else {
    if (canAccept(item)) {
      main.push(`
        <button class="btn btn-small btn-success" data-action="accept" data-id="${item.id}">
          <i class="bi bi-check2-circle"></i> Accept
        </button>
      `);
    }

    if (canReject(item)) {
      main.push(`
        <button class="btn btn-small btn-danger" data-action="reject" data-id="${item.id}">
          <i class="bi bi-x-circle"></i> Reject
        </button>
      `);
    }

    if (canOpenChat(item)) {
      main.push(`
        <button class="btn btn-small btn-primary" data-action="chat" data-id="${item.id}">
          <i class="bi bi-chat"></i> Open Chat
        </button>
      `);
    }
  }

  main.push(`
    <button class="btn btn-small btn-ghost subtle-action" data-action="read" data-id="${item.id}">
      <i class="bi bi-check2"></i> Read
    </button>
  `);

  main.push(`
    <button class="btn btn-small btn-ghost subtle-action" data-action="delete" data-id="${item.id}">
      <i class="bi bi-trash"></i> Delete
    </button>
  `);

  return main.join("");
}

function shouldHideChips(item) {
  return item.originType === "offer" || item.offerId;
}

function renderChips(item) {
  if (item.type === "shipment_started") {
    return `
      <span class="info-chip tracking-chip">
        <i class="bi bi-broadcast-pin"></i>
        Status: In Transit
      </span>

      <span class="info-chip tracking-chip">
        <i class="bi bi-geo-alt"></i>
        Route: ${item.route || "-"}
      </span>
    `;
  }

  if (shouldHideChips(item)) {
    return ``;
  }

  return `
    <span class="info-chip">
      <i class="bi bi-box"></i>
      Capacity: ${item.requestedSpace || "-"}
    </span>

    ${
      item.type === "recommendation"
        ? ``
        : item.finalState === "approved"
          ? `
          <span class="info-chip price-chip" style="background: rgba(34,197,94,0.15); border-color: rgba(34,197,94,0.4);">
            <i class="bi bi-check-circle"></i>
            Agreed Price: <b>${formatMoney(item.priceOffer)}</b>
          </span>
        `
          : `
          <span class="info-chip price-chip">
            <i class="bi bi-cash-coin"></i>
            Initial Price: <b>${formatMoney(item.initialPrice)}</b>
          </span>
        `
    }
  `;
}

function render() {
  setCountsUI();

  const list = $("notifList");
  const emptyState = $("emptyState");
  if (!list) return;

  list.innerHTML = "";

  const filtered = state.items
    .filter(matchesFilter)
    .filter(matchesSearch);

  if (emptyState) {
    emptyState.style.display = filtered.length ? "none" : "block";
  }

  filtered.forEach((item) => {
    const { box, icon } = iconClass(item.type);

    const div = document.createElement("div");
    div.className = `notif ${item.unread ? "unread" : ""} ${getNotificationClass(item)} newly-added`;
    div.setAttribute("data-id", item.id);

    div.innerHTML = `
      <div class="n-icon ${box}">
        <i class="${icon}"></i>
      </div>

      <div class="n-body">
        <div class="n-title">
          <span>${typeLabel(item.type)}</span>
          <span class="badge">${item.senderName}</span>
        </div>

        ${
          item.type === "offer"
            ? ""
            : `
          <div class="n-meta top-meta">
            <span><i class="bi bi-geo-alt"></i> ${item.route}</span>
            <span><i class="bi bi-box-seam"></i> ${item.goods}</span>
          </div>
        `
        }

        ${
          renderChips(item)
            ? `
          <div class="n-chips">
            ${renderChips(item)}
          </div>
        `
            : ``
        }

        ${
          item.type === "recommendation"
            ? `
          <div class="n-note">
            <i class="bi bi-star"></i>
            <span>New ad from a highly rated truck owner</span>
          </div>
        `
            : item.lastMessage
              ? `
          <div class="n-note">
            <i class="bi bi-chat-left-text"></i>
            <span>${item.lastMessage}</span>
          </div>
        `
              : ``
        }
      </div>

      <div class="n-actions">
        <span class="time">${item.time}</span>
        <div class="action-row">
          ${buildActionButtons(item)}
        </div>
      </div>
    `;

    list.appendChild(div);

    setTimeout(() => {
      div.classList.remove("newly-added");
    }, 1500);

    div.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const action = btn.getAttribute("data-action");
        const id = btn.getAttribute("data-id");
        const it = state.items.find((x) => x.id === id);
        if (!it) return;

        if (action === "chat") await openChat(it);
        if (action === "read") await markRead(id);
        if (action === "accept") await acceptRequest(it);
        if (action === "reject") await rejectRequest(it);
        if (action === "delete") await deleteNotification(id);
        if (action === "track") await openTracking(it);
      });
    });
  });
}

function bindStaticEvents() {
  document.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".chip").forEach((c) => {
        c.classList.remove("active");
      });

      chip.classList.add("active");
      state.filter = chip.dataset.filter;
      render();
    });
  });

  if ($("searchInput")) {
    $("searchInput").addEventListener("input", (e) => {
      state.search = e.target.value;
      render();
    });
  }

  if ($("markAllBtn")) {
    $("markAllBtn").addEventListener("click", markAllRead);
  }
}

function initPage() {
  if (!CURRENT_USER_ID || !CURRENT_USER_TYPE) {
    window.location.href = "/HTML/Login.html";
    return;
  }

  localStorage.setItem("user_role", CURRENT_USER_ROLE);

  renderSidebar();
  setRoleBasedText();
  bindStaticEvents();
  loadNotifications();

  if (CURRENT_USER_ID) {
    socket.emit("join_user_room", CURRENT_USER_ID);
  }
}

socket.off("new_notification");
socket.on("new_notification", async (notification) => {
  if (String(notification.room_code || "").startsWith("inquiry_")) return;

  const normalized = normalizeNotification(notification);
  state.items.unshift(normalized);
  await enrichRoomStatuses(state.items);
  render();
});

initPage();