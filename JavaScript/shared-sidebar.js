(function () {
  function getCurrentRole() {
    const userType = (localStorage.getItem("user_type") || "")
      .trim()
      .toLowerCase();
    return userType === "truck owner" ? "owner" : "customer";
  }

  function clearUserSession() {
    const keys = [
      "user_id",
      "username",
      "user_type",
      "user_role",
      "chat_room_id",
      "chat_customer_name",
      "chat_ad_id",
      "chat_booking_id",
      "chat_current_user_id",
      "chat_current_user_type",
      "chat_current_user_role",
      "selected_ad_id",
      "booked_capacity",
      "calculated_price",
      "capacityUnit",
    ];

    keys.forEach((key) => localStorage.removeItem(key));
  }

  function getSidebarHTML(role, activePage, unreadCount = 0) {
    const badgeHTML =
      unreadCount > 0
        ? `<span id="navBadge" class="nav-badge">${unreadCount}</span>`
        : `<span id="navBadge" class="nav-badge" style="display:none;">0</span>`;

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
          <a class="nav-item ${activePage === "dashboard" ? "active" : ""}" href="/HTML/Dashboard.html">
            <i class="bi bi-house-door"></i>
            <span>Dashboard</span>
          </a>

          <a class="nav-item ${activePage === "post-ad" ? "active" : ""}" href="/HTML/postForm.html">
            <i class="bi bi-megaphone"></i>
            <span>Post an ad</span>
          </a>

          <a class="nav-item ${activePage === "requests" ? "active" : ""}" href="/HTML/requestsPage.html">
            <i class="bi bi-clipboard-check"></i>
            <span>Requests page</span>
          </a>

          <a class="nav-item ${activePage === "notifications" ? "active" : ""}" href="/HTML/Notifications.html">
            <i class="bi bi-bell"></i>
            <span>Notifications</span>
            ${badgeHTML}
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
        <a class="nav-item ${activePage === "advertising" ? "active" : ""}" href="/HTML/advertising.html">
          <i class="bi bi-badge-ad"></i>
          <span>Advertising Page</span>
        </a>

        <a class="nav-item ${activePage === "request-form" ? "active" : ""}" href="/HTML/requestForm.html">
          <i class="bi bi-card-heading"></i>
          <span>Post a request</span>
        </a>

        <a class="nav-item ${activePage === "track-shipment" ? "active" : ""}" href="/HTML/trackShipment.html">
          <i class="bi bi-geo-alt"></i>
          <span>Track My Shipment</span>
        </a>

        <a class="nav-item ${activePage === "notifications" ? "active" : ""}" href="/HTML/Notifications.html">
          <i class="bi bi-bell"></i>
          <span>Notifications</span>
          ${badgeHTML}
        </a>

        <a class="nav-item logout" href="/HTML/HomePage.html" id="logoutBtn">
          <i class="bi bi-box-arrow-right"></i>
          <span>Log out</span>
        </a>
      </nav>
    `;
  }

  function renderSharedSidebar(options = {}) {
    const { mountId = "sidebar", activePage = "", unreadCount = 0 } = options;

    const sidebar = document.getElementById(mountId);
    if (!sidebar) return;

    const role = getCurrentRole();
    localStorage.setItem("user_role", role);

    sidebar.innerHTML = getSidebarHTML(role, activePage, unreadCount);

    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", () => {
        clearUserSession();
      });
    }
  }

  function updateSidebarBadge(count = 0) {
    const navBadge = document.getElementById("navBadge");
    if (!navBadge) return;

    if (count > 0) {
      navBadge.style.display = "inline-flex";
      navBadge.textContent = count;
    } else {
      navBadge.style.display = "none";
      navBadge.textContent = "0";
    }
  }

  window.renderSharedSidebar = renderSharedSidebar;
  window.updateSidebarBadge = updateSidebarBadge;
})();