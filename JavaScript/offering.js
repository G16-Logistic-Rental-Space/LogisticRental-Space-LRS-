const form = document.getElementById("offerForm");

if (form) {
  form.addEventListener("submit", async function (e) {
    e.preventDefault();

    const fullname = document.getElementById("fullName").value.trim();
    const truckId = document.getElementById("truckID").value.trim();
    const truckType = document.getElementById("truck_type").value.trim();
    const departureDate = document.getElementById("departureDate").value.trim();

    const ownerId = localStorage.getItem("user_id");
    if (!ownerId) {
      alert("User not logged in");
      return;
    }

    const requestId = localStorage.getItem("offer_requestId");
    if (!requestId) {
      alert("No request selected");
      return;
    }

    console.log(
      "offer_requestId from localStorage =",
      localStorage.getItem("offer_requestId"),
    );

    const today = new Date().toISOString().split("T")[0];

    const nameError = document.getElementById("nameError");
    const idError = document.getElementById("idError");
    const typeError = document.getElementById("typeError");
    const dateError = document.getElementById("dateError");
    const formStatus = document.getElementById("formStatus");

    nameError.textContent = "";
    idError.textContent = "";
    typeError.textContent = "";
    dateError.textContent = "";
    formStatus.textContent = "";
    formStatus.className = "form-status";

    let isValid = true;
    const lettersOnly = /^[A-Za-z\s]+$/;

    if (!fullname) {
      nameError.textContent = "Full name is required";
      isValid = false;
    } else if (!lettersOnly.test(fullname)) {
      nameError.textContent = "Name must contain letters only";
      isValid = false;
    }

    if (!truckId) {
      idError.textContent = "Truck ID is required";
      isValid = false;
    }

    if (!truckType) {
      typeError.textContent = "Please select truck type";
      isValid = false;
    }

    if (!departureDate) {
      dateError.textContent = "Departure date is required";
      isValid = false;
    } else if (departureDate < today) {
      dateError.textContent = "Date cannot be in the past";
      isValid = false;
    }

    if (!isValid) {
      formStatus.textContent = "Please fix the highlighted fields.";
      formStatus.classList.add("error");
      return;
    }

    const data = {
      owner_id: ownerId,
      truck_req_id: requestId,
      fullname,
      truck_id: truckId,
      truck_type: truckType,
      truck_departure_date: departureDate,
    };

    try {
      const res = await fetch("http://localhost:3001/addOffer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      const result = await res.json();

      if (result.success) {
        formStatus.textContent = "Your offer has been successfully registered.";
        formStatus.classList.add("success");
        form.reset();

        setTimeout(() => {
          window.location.href = "requestsPage.html";
        }, 1200);
      } else {
        formStatus.textContent = "Error saving offer: " + result.message;
        formStatus.classList.add("error");
      }
    } catch (err) {
      console.error("Fetch error:", err);
      formStatus.textContent = "Error connecting to server.";
      formStatus.classList.add("error");
    }
  });
}
