class User {
  id;
  fullname;
  username;
  user_type;
  apiBase = "http://localhost:3001";

  constructor(id, fullname, username, user_type) {
    this.id = id;
    this.fullname = fullname;
    this.username = username;
    this.user_type = user_type;
  }

  isTruckOwner() {
    return this.user_type === "Truck owner";
  }

  isCustomer() {
    return this.user_type === "Customer";
  }

  showFieldError(id, message) {
    const box = document.getElementById(id + "Error");
    const input = document.getElementById(id);

    if (box) {
      box.innerHTML = `<i class="bi bi-exclamation-circle"></i> ${message}`;
      box.style.display = "block";
    }

    if (input) {
      input.classList.remove("input-success");
      input.classList.add("input-error");
      setTimeout(() => input.classList.remove("input-error"), 3001);
    }

    setTimeout(() => {
      if (box) box.style.display = "none";
    }, 3001);
  }

  showSuccess(id, message) {
    const box = document.getElementById(id);
    box.innerHTML = `<i class="bi bi-check-circle"></i> ${message}`;
    box.style.display = "block";
    setTimeout(() => (box.style.display = "none"), 3001);
  }

  validatePassword(password) {
    const pattern =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!"#$%&'()*+,\-./:;<=>?@[\\\]^_{|}~]).{8,}$/;
    return pattern.test(password);
  }

  handleSignupError(message) {
    if (message.includes("Full name"))
      return this.showFieldError("fullname", message);
    if (message.includes("Username"))
      return this.showFieldError("username", message);
    if (message.includes("Password"))
      return this.showFieldError("password", message);
    if (message.includes("mobile"))
      return this.showFieldError("mobile", message);
    if (message.includes("User type"))
      return this.showFieldError("userType", message);

    return this.showFieldError("username", message);
  }
}
class TruckOwner extends User {
  constructor(id, fullname, username) {
    super(id, fullname, username, "Truck owner");
  }
}

class Customer extends User {
  constructor(id, fullname, username) {
    super(id, fullname, username, "Customer");
  }
}

window.User = User;
window.TruckOwner = TruckOwner;
window.Customer = Customer;
