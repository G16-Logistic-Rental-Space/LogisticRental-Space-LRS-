document.addEventListener("DOMContentLoaded", () => {
  const welcomeNameEl = document.getElementById("welcomeName");
  const storedUsername = localStorage.getItem("username");

  if (welcomeNameEl) {
    welcomeNameEl.textContent = storedUsername || "Guest";
  }
  const form = document.getElementById("truckForm");
  if (!form) {
    console.error("truckForm not found");
    return;
  }
  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    const formSuccess = document.getElementById("formSuccess");
    const submitBtn = form.querySelector("button[type='submit']");

    function showFieldError(id, message) {
      const input = document.getElementById(id);
      const errorDiv = document.getElementById(id + "Error");
      console.log("Validation error on", id, ":", message);
      if (input) {
        input.classList.remove("input-success");
        input.classList.add("input-error");
      }
      if (errorDiv) {
        errorDiv.innerHTML = `<i class="bi bi-exclamation-circle"></i> ${message}`;
        errorDiv.style.display = "block";
      }
    }

    function clearErrors() {
      document
        .querySelectorAll(".input-error, .input-success")
        .forEach((el) => el.classList.remove("input-error", "input-success"));
      document
        .querySelectorAll(".error-message")
        .forEach((el) => (el.style.display = "none"));

      if (formSuccess) {
        formSuccess.style.display = "none";
        formSuccess.innerHTML = "";
      }
    }

    function markSuccess(id) {
      const input = document.getElementById(id);
      const errorDiv = document.getElementById(id + "Error");
      if (input) {
        input.classList.remove("input-error");
        input.classList.add("input-success");
      }
      if (errorDiv) {
        errorDiv.style.display = "none";
      }
    }

    clearErrors();

    const user_id = localStorage.getItem("user_id");
    if (!user_id) {
      alert("You must be logged in to post an ad.");
      return;
    }

    const truckData = {
      user_id,
      truck_type: document.getElementById("truck_type").value,
      good_type: Array.from(
        document.querySelectorAll(".dropdown-content input:checked"),
      ).map((cb) => cb.value),
      good_weight: document.getElementById("weight").value,
      good_volume: document.getElementById("good_volume")?.value,
      quantity: document.querySelector(
        "input[placeholder='Number of boxes / barrels']",
      )?.value,
      packaging_method: document.getElementById("packaging_method").value,
      restrictions: document.getElementById("restrictions")?.value.trim(),
      pickup_location: document.getElementById("pickup_location").value.trim(),
      dropoff_location: document
        .getElementById("dropoff_location")
        .value.trim(),
      final_request_date: document.getElementById("final_request_date").value,
      note: document.getElementById("note").value.trim(),
    };
    if (document.getElementById("otherCheckbox").checked) {
      const otherValue = document.getElementById("otherInput").value.trim();
      if (otherValue) {
        truckData.good_type.push(otherValue);
      }
    }
    truckData.good_type = truckData.good_type.join(",");
    let valid = true;
    if (!truckData.truck_type) {
      showFieldError("truck_type", "Please select The truck type ");
      valid = false;
    } else {
      markSuccess("truck_type");
    }

    if (!truckData.dropoff_location) {
      showFieldError("dropoff_location", "Please Enter the dropoff location");
      valid = false;
    }
    if (!truckData.pickup_location) {
      showFieldError("pickup_location", "Please Enter the pickup location");
      valid = false;
    }
    if (!truckData.good_type) {
      showFieldError("good_type", "Select at least one type of accepted goods");
      valid = false;
    }
    if (!truckData.final_request_date) {
      showFieldError("final_request_date", "Select the final request date");
    }
    if (!truckData.final_request_date) {
      showFieldError("final_request_date", "Select the final request date");
    }
    if (!truckData.restrictions) {
      showFieldError(
        "restrictions",
        "Write  the restrictions for shipping the goods.",
      );
    }
    if (!truckData.good_weight) {
      showFieldError("good_weight", "Write  the good weight .");
    }
    if (!truckData.good_volume) {
      showFieldError("good_volume", "Write  the good volume .");
    }
    if (!truckData.quantity) {
      showFieldError("quantity", "Write  the good volume .");
    }

    const cityDistrictFields = ["pickup_location", "dropoff_location"];
    const lettersOnly = /^[A-Za-z\s]+$/;
    cityDistrictFields.forEach((field) => {
      const value = truckData[field];
      if (!value) return;
      if (!lettersOnly.test(value)) {
        showFieldError(
          field,
          `${field.replace(/_/g, " ")} must contain letters only`,
        );
        valid = false;
      } else {
        markSuccess(field);
      }
    });

    const numericFields = ["good_weight", "good_volume", "quantity"];
    numericFields.forEach((field) => {
      const raw = truckData[field];
      if (!raw) return;

      const value = Number(raw);
      if (Number.isNaN(value) || value <= 0) {
        showFieldError(
          field,
          `${field.replace(/_/g, " ")} must be a positive number`,
        );
        valid = false;
      } else {
        markSuccess(field);
      }
    });

    if (!truckData.packaging_method) {
      showFieldError("packaging_method", "Please select a packaging method");
      valid = false;
    } else {
      markSuccess("packaging_method");
    }

    if (truckData.restrictions?.length > 200) {
      showFieldError(
        "restrictions",
        "Restrictions text too long (max 200 characters)",
      );
      valid = false;
    } else if (truckData.restrictions) {
      markSuccess("restrictions");
    }
    const today = new Date().toISOString().split("T")[0];
    if (truckData.final_request_date) {
      if (truckData.final_request_date < today) {
        showFieldError(
          "final_request_date",
          "Final request date cannot be in the past",
        );
        valid = false;
      } else {
        markSuccess("final_request_date");
      }
    }

    if (truckData.note.length > 500) {
      showFieldError("note", "Note text too long (max 500 characters)");
      valid = false;
    } else if (truckData.note) {
      markSuccess("note");
    }
    if (!valid) {
      console.log("Form not valid, not sending to backend.");
      return;
    }
    try {
      if (submitBtn) submitBtn.disabled = true;
      const res = await fetch("http://localhost:3001/addRequest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(truckData),
      });

      const data = await res.json();
      console.log("Server response:", data);

      if (data.success) {
        Object.keys(truckData).forEach((key) => {
          if (key === "user_id" || key === "good_type") return;
          markSuccess(key);
        });

        if (formSuccess) {
          formSuccess.innerHTML = `<i class="bi bi-check-circle"></i> ${data.message}`;
          formSuccess.style.display = "block";

          setTimeout(() => {
            formSuccess.style.display = "none";
          }, 3001);
        }
        form.reset();
        document
          .querySelectorAll(".input-success")
          .forEach((el) => el.classList.remove("input-success"));
      } else {
        showFieldError("truck_type", data.message || "Failed to submit ad.");
      }
    } catch (err) {
      console.error("Error posting ad:", err);
      showFieldError("truck_type", "Server error. Please try again later.");
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
});

const otherCheckbox = document.getElementById("otherCheckbox");
const otherInput = document.getElementById("otherInput");
otherCheckbox.addEventListener("change", () => {
  if (otherCheckbox.checked) {
    otherInput.style.display = "block";
  } else {
    otherInput.style.display = "none";
    otherInput.value = "";
  }
});
