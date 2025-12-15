document.addEventListener("DOMContentLoaded", () => {
  const storedUsername = localStorage.getItem("username");
  const welcomeNameSpan = document.getElementById("welcomeName");
  if (welcomeNameSpan) {
    welcomeNameSpan.textContent = storedUsername || "User";
  }

  let lastScrollTop = 0;
  const header = document.querySelector("header");

  window.addEventListener("scroll", () => {
    let scrollTop = window.pageYOffset || document.documentElement.scrollTop;

    if (scrollTop > lastScrollTop) {
      if (header) header.style.top = "-90px";
    } else {
      if (header) header.style.top = "0";
    }

    lastScrollTop = scrollTop;
  });

  const sections = document.querySelectorAll(".dynamic-section");
  sections.forEach((section, index) => {
    setTimeout(() => {
      section.classList.add("show");
    }, index * 300);
  });

  const userId = localStorage.getItem("user_id");
  const listingsEl = document.getElementById("listingsCount");
  const bookingsEl = document.getElementById("bookingsCount");

  if (!userId) {
    console.warn("No user_id in localStorage. User might not be logged in.");
    return;
  }

  if (!listingsEl && !bookingsEl) {
    console.warn("Dashboard count elements not found.");
    return;
  }

  fetch(
    `http://localhost:3000/dashboard-stats?user_id=${encodeURIComponent(
      userId
    )}`
  )
    .then((res) => res.json())
    .then((data) => {
      if (!data.success) {
        console.error("Failed to load dashboard stats:", data.message);
        return;
      }

      if (listingsEl) listingsEl.textContent = data.total_listings ?? 0;
      if (bookingsEl) bookingsEl.textContent = data.total_bookings ?? 0;
    })
    .catch((err) => {
      console.error("Error fetching dashboard stats:", err);
    });
});
