window.onload = () => {
  const ownerId = localStorage.getItem("user_id"); 

  if (ownerId) {
    loadDashboardRating(ownerId);
  }
};
document.addEventListener("DOMContentLoaded", () => {
  const storedUsername = localStorage.getItem("username");
  const userId = Number(localStorage.getItem("user_id")) || 0;
  const userType = (localStorage.getItem("user_type") || "").trim();

  const welcomeNameSpan = document.getElementById("welcomeName");
  const ownerRoleText = document.getElementById("ownerRoleText");
  const bellBtn = document.getElementById("bellBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const navBadge = document.getElementById("navBadge");

  const listingsEl = document.getElementById("listingsCount");
  const bookingsEl = document.getElementById("bookingsCount");
  const heroListingsEl = document.getElementById("heroListingsCount");
  const heroBookingsEl = document.getElementById("heroBookingsCount");
  const heroUnreadEl = document.getElementById("heroUnreadCount");

  const notificationsWrap = document.getElementById("notifications");
  const upcomingWrap = document.getElementById("upcomingContainer");

  if (welcomeNameSpan) {
    welcomeNameSpan.textContent = storedUsername || "User";
  }

  if (ownerRoleText) {
    ownerRoleText.textContent = userType || "Truck Owner";
  }

  if (bellBtn) {
    bellBtn.addEventListener("click", () => {
      window.location.href = "/HTML/Notifications.html";
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      localStorage.removeItem("user_id");
      localStorage.removeItem("username");
      localStorage.removeItem("user_type");
      localStorage.removeItem("user_role");
      localStorage.removeItem("chat_room_id");
      localStorage.removeItem("chat_customer_name");
      localStorage.removeItem("chat_ad_id");
      localStorage.removeItem("chat_booking_id");
      localStorage.removeItem("chat_current_user_id");
      localStorage.removeItem("chat_current_user_type");
      localStorage.removeItem("chat_current_user_role");
    });
  }

  const sections = document.querySelectorAll(".dynamic-section");
  sections.forEach((section, index) => {
    setTimeout(() => {
      section.classList.add("show");
    }, index * 180);
  });

  if (!userId) {
    console.warn("No user_id in localStorage. User might not be logged in.");
    return;
  }

  loadDashboardSummary(userId);

  async function loadDashboardSummary(ownerId) {
    try {
      const res = await fetch(
        `http://localhost:3001/api/dashboard/summary/${encodeURIComponent(ownerId)}`,
      );
      const data = await res.json();

      if (!data.success) {
        console.error("Failed to load dashboard summary:", data.message);
        return;
      }

      const stats = data.stats || {};
      const upcoming = data.upcoming || [];
      const recentAlerts = data.recent_alerts || [];

      const totalListings = stats.total_listings ?? 0;
      const totalBookings = stats.total_bookings ?? 0;
      const unreadCount = stats.unread_notifications ?? 0;

      if (listingsEl) listingsEl.textContent = totalListings;
      if (bookingsEl) bookingsEl.textContent = totalBookings;
      if (heroListingsEl) heroListingsEl.textContent = totalListings;
      if (heroBookingsEl) heroBookingsEl.textContent = totalBookings;
      if (heroUnreadEl) heroUnreadEl.textContent = unreadCount;
      if (navBadge) navBadge.textContent = unreadCount;

      renderRecentAlerts(recentAlerts);
      renderUpcoming(upcoming);
    } catch (err) {
      console.error("Error fetching dashboard summary:", err);
      renderRecentAlerts([]);
      renderUpcoming([]);
    }
  }

  function formatDate(dateStr) {
    if (!dateStr) return "No date";
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return dateStr;

    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function getAlertIcon(type) {
    if (type === "approved") return "bi-check-circle";
    if (type === "shipment_started") return "bi-truck";
    if (type === "rental_request") return "bi-box-seam";
    if (type === "message") return "bi-chat-dots";
    if (type === "offer") return "bi-cash-coin";
    if (type === "rejected") return "bi-x-circle";
    return "bi-bell";
  }

  function renderRecentAlerts(items) {
    if (!notificationsWrap) return;

    if (!items.length) {
      notificationsWrap.innerHTML = `
        <div class="empty-state-card">
          <i class="bi bi-bell-slash"></i>
          <p>No recent alerts yet.</p>
        </div>
      `;
      return;
    }

    notificationsWrap.innerHTML = items
      .map((item) => {
        const sender = item.sender_name
          ? `${escapeHtml(item.sender_name)} • `
          : "";
        const body = item.body ? escapeHtml(item.body) : "No details";
        const icon = getAlertIcon(item.type);
        const unreadClass = !item.is_read ? "note-unread" : "";

        return `
          <div class="note ${unreadClass}">
            <i class="bi ${icon}"></i>
            <div class="note-content">
              <p>${sender}${body}</p>
              <span class="note-time">${formatDate(item.created_at)}</span>
            </div>
          </div>
        `;
      })
      .join("");
  }

  function getUpcomingConfig(status) {
    const s = String(status || "").toLowerCase();

    if (s === "approved") {
      return {
        className: "approved",
        icon: "bi-truck",
        title: "Approved booking",
      };
    }

    if (s === "in transit") {
      return {
        className: "in-transit",
        icon: "bi-geo-alt",
        title: "Shipment in transit",
      };
    }

    return {
      className: "pending",
      icon: "bi-box-seam",
      title: "Pending booking",
    };
  }

  function renderUpcoming(items) {
    if (!upcomingWrap) return;

    if (!items.length) {
      upcomingWrap.innerHTML = `
        <div class="empty-state-card">
          <i class="bi bi-calendar-x"></i>
          <p>No upcoming shipments yet.</p>
        </div>
      `;
      return;
    }

    upcomingWrap.innerHTML = items
      .map((item) => {
        const cfg = getUpcomingConfig(item.status);
        const route = `${escapeHtml(item.pickup_location || "—")} → ${escapeHtml(item.dropoff_location || "—")}`;
        const customerName = escapeHtml(item.customer_name || "Customer");
        const truckType = escapeHtml(item.truck_type || "Truck");
        const statusText = escapeHtml(item.status || "Pending");
        const tripDate = formatDate(item.trip_date);

        return `
          <div class="upcoming-card ${cfg.className}">
            <div class="icon">
              <i class="bi ${cfg.icon}"></i>
            </div>

            <div class="cardInfo">
              <div class="card-topline">
                <h4>${cfg.title}</h4>
                <span class="status-pill ${cfg.className}">${statusText}</span>
              </div>

              <p>${customerName}</p>
              <p>${route}</p>
              <p>${truckType}</p>
              <p class="date">Trip Date: ${tripDate}</p>
            </div>
          </div>
        `;
      })
      .join("");
  }
});
async function loadDashboardRating(ownerId) {
  try {
    const res = await fetch(`http://localhost:3001/api/ratings/${ownerId}`);
    const data = await res.json();

    console.log("RATING RESPONSE:", data);

    const rating = data.rating || { overall_rating: 0, total_ratings: 0 };

    const value = rating.overall_rating || 0;
    const count = rating.total_ratings || 0;

    document.getElementById("ratingValue").textContent = value.toFixed(1);
    document.getElementById("ratingCount").textContent = `(${count} reviews)`;

    renderStars(value);

  } catch (err) {
    console.error("DASHBOARD RATING ERROR:", err);
  }
}
function renderStars(rating) {
  const el = document.getElementById("ratingStars");

  let stars = "";

  for (let i = 1; i <= 5; i++) {
    stars += rating >= i ? "★" : "☆";
  }

  el.textContent = stars;
}