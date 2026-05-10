function showFieldError(id, message) {
  const box = document.getElementById(id + "Error");
  box.innerHTML = `<i class="bi bi-exclamation-circle"></i> ${message}`;
  box.style.display = "block";
  const input = document.getElementById(id);
  if (input) {
    input.classList.remove("input-success");
    input.classList.add("input-error");

    setTimeout(() => {
      input.classList.remove("input-error");
    }, 3001);
  }

  setTimeout(() => {
    box.style.display = "none";
  }, 3001);
}
function showSignupSuccess(message) {
  const box = document.getElementById("signupSuccess");

  box.innerHTML = `<i class="bi bi-check-circle"></i> ${message}`;
  box.style.display = "block";

  setTimeout(() => {
    box.style.display = "none";
  }, 3001);
}
function signupUser(event) {
  event.preventDefault();
  const fullname = document.getElementById("fullname").value.trim();
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;
  const confirm = document.getElementById("confirm").value;
  const mobile = document.getElementById("mobile").value.trim();
  const user_type =
    document.querySelector('input[name="userType"]:checked')?.value || "";
  const usernamePattern = /^[A-Za-z][A-Za-z0-9_]{2,19}$/;
  const passwordPattern =
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!"#$%&'()*+,\-./:;<=>?@[\\\]^_{|}~]).{8,}$/;
  const mobilePattern = /^(05\d{8}|9665\d{8})$/;

  if (!fullname) return showFieldError("fullname", "Full name is required");
  if (!username) return showFieldError("username", "Username is required");
  if (!password) return showFieldError("password", "Password is required");
  if (!confirm) return showFieldError("confirm", "Please confirm password");
  if (!mobile) return showFieldError("mobile", "Mobile number is required");
  if (!user_type) return showFieldError("userType", "User type is required");
  if (!usernamePattern.test(username)) {
    return showFieldError(
      "username",
      "Username must start with a letter, and be 3–20 characters (letters, numbers, _ )",
    );
  }

  if (!passwordPattern.test(password)) {
    return showFieldError(
      "password",
      "Password must be at least 8 chars and include: uppercase, lowercase, number, and symbol",
    );
  }

  if (password !== confirm) {
    return showFieldError("confirm", "Passwords do not match");
  }
  if (!mobilePattern.test(mobile)) {
    return showFieldError(
      "mobile",
      "Mobile must start with 05 or 9665 and be 10 digits long",
    );
  }
  fetch("http://localhost:3001/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fullname,
      username,
      password,
      mobile,
      user_type,
    }),
  })
    .then((res) => res.json())
    .then((data) => {
      if (!data.success) {
        if (data.message.includes("Full name")) {
          return showFieldError("fullname", data.message);
        }
        if (data.message.includes("Username")) {
          return showFieldError("username", data.message);
        }
        if (data.message.includes("Password")) {
          return showFieldError("password", data.message);
        }
        if (data.message.includes("mobile")) {
          return showFieldError("mobile", data.message);
        }
        if (data.message.includes("User type")) {
          return showFieldError("userType", data.message);
        }
        return showFieldError("username", data.message);
      }
      document.getElementById("fullname").classList.add("input-success");
      document.getElementById("username").classList.add("input-success");
      document.getElementById("password").classList.add("input-success");
      document.getElementById("confirm").classList.add("input-success");
      document.getElementById("mobile").classList.add("input-success");
      showSignupSuccess("Account created successfully");
      setTimeout(() => {
        window.location.href = "Login.html";
      }, 1500);
    })
    .catch(() => showFieldError("username", "Server error, try again later."));
}
