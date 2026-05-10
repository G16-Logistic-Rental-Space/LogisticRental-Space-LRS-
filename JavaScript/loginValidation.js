function showFieldError(id, message) {
  const box = document.getElementById(id + "Error");
  const input = document.getElementById(id);

  box.innerHTML = `<i class="bi bi-exclamation-circle"></i> ${message}`;
  box.style.display = "block";

  input.classList.remove("input-success");
  input.classList.add("input-error");

  setTimeout(() => {
    box.style.display = "none";
    input.classList.remove("input-error");
  }, 3001);
}

function showLoginSuccess(message) {
  const box = document.getElementById("loginSuccess");
  box.innerHTML = `<i class="bi bi-check-circle"></i> ${message}`;
  box.style.display = "block";

  setTimeout(() => {
    box.style.display = "none";
  }, 3001);
}

function loginUser(event) {
  event.preventDefault();

  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;

  if (!username) {
    showFieldError("username", "Username is required");
    return;
  }
  if (!password) {
    showFieldError("password", "Password is required");
    return;
  }

  fetch("http://localhost:3001/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  })
    .then((res) => res.json())
    .then((data) => {
      if (!data.success) {
        if (data.message.includes("password")) {
          showFieldError("password", data.message);
        } else {
          showFieldError("username", data.message);
        }
        return;
      }

      localStorage.setItem("user_id", data.user_id);
      localStorage.setItem("username", data.username);
      localStorage.setItem("user_type", data.user_type);
console.log("LOGIN RESPONSE:", data);
      document.getElementById("username").classList.add("input-success");
      document.getElementById("password").classList.add("input-success");
      showLoginSuccess("You have logged in successfully");

      setTimeout(() => {
        if (data.user_type === "Truck owner") {
          window.location.href = "Dashboard.html";
        } else if (data.user_type === "Customer") {
          window.location.href = "advertising.html";
        } else {
          window.location.href = "HomePage.html";
        }
      }, 1200);
    })
    .catch(() => {
      showFieldError("username", "Server error, please try again later.");
    });
}
