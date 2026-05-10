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
      truck_type: document.getElementById("truck_type").value.trim(),
      truck_id: document.getElementById("truck_id").value.trim(),
      length: document.getElementById("length").value,
      width: document.getElementById("width").value,
      height: document.getElementById("height").value,
      max_volume: document.getElementById("max_volume").value,
      max_weight: document.getElementById("max_weight").value,
      current_used_volume: document.getElementById("current_used_volume").value,
      current_used_weight: document.getElementById("current_used_weight").value,
      accepted_goods: Array.from(
        document.querySelectorAll(".dropdown-content input:checked"),
      ).map((cb) => cb.value),
      restrictions: document.getElementById("restrictions").value.trim(),
      price: document.getElementById("price").value,
      pickup_location: document.getElementById("pickup_location").value.trim(),
      dropoff_location: document
        .getElementById("dropoff_location")
        .value.trim(),
      district: document.getElementById("district").value.trim(),
      final_request_date: document.getElementById("final_request_date").value,
      note: document.getElementById("note").value.trim(),
    };
    if (document.getElementById("otherCheckbox").checked) {
      const otherValue = document.getElementById("otherInput").value.trim();
      if (otherValue) {
        truckData.accepted_goods.push(otherValue);
      }
    }
    let valid = true;
    const requiredFields = [
      "truck_type",
      "truck_id",
      "length",
      "width",
      "height",
      "max_volume",
      "max_weight",
      "current_used_volume",
      "current_used_weight",
      "price",
      "pickup_location",
      "dropoff_location",
      "district",
      "final_request_date",
    ];
    requiredFields.forEach((field) => {
      if (!truckData[field]) {
        const label =
          field === "district"
            ? "District / Neighborhood / Area"
            : field.replace(/_/g, " ");
        showFieldError(field, `${label} is required`);
        valid = false;
      } else {
        markSuccess(field);
      }
    });
    const cityDistrictFields = [
      "pickup_location",
      "dropoff_location",
      "district",
    ];
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

    if (truckData.accepted_goods.length === 0) {
      showFieldError(
        "accepted_goods",
        "Select at least one type of accepted goods",
      );
      valid = false;
    }
    const numericFields = [
      "price",
      "length",
      "width",
      "height",
      "max_volume",
      "max_weight",
      "current_used_volume",
      "current_used_weight",
    ];
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
    const maxVol = Number(truckData.max_volume) || 0;
    const usedVol = Number(truckData.current_used_volume) || 0;
    const maxWeight = Number(truckData.max_weight) || 0;
    const usedWeight = Number(truckData.current_used_weight) || 0;
    if (usedVol > maxVol) {
      showFieldError(
        "current_used_volume",
        "Current used volume cannot be greater than maximum volume",
      );
      valid = false;
    }

    if (usedWeight > maxWeight) {
      showFieldError(
        "current_used_weight",
        "Current used weight cannot be greater than maximum weight",
      );
      valid = false;
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
    if (truckData.restrictions.length > 300) {
      showFieldError(
        "restrictions",
        "Restrictions text too long (max 300 characters)",
      );
      valid = false;
    } else if (truckData.restrictions) {
      markSuccess("restrictions");
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
      const res = await fetch("http://localhost:3001/postAd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(truckData),
      });

      const data = await res.json();
      console.log("Server response:", data);

      if (data.success) {
        Object.keys(truckData).forEach((key) => {
          if (key === "user_id" || key === "accepted_goods") return;
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
