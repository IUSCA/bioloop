<template>
  <div class="signup-container">
    <div class="signup-box">
      <h2>Sign Up</h2>

      <!-- First Name (Required) -->
      <div class="input-group">
        <label for="firstName"
          >First Name <span class="required">*</span></label
        >
        <input
          type="text"
          id="firstName"
          v-model="firstName"
          placeholder="Enter your first name"
        />
        <p v-if="errors.firstName" class="error-message">
          {{ errors.firstName }}
        </p>
      </div>

      <!-- Middle Name (Optional) -->
      <div class="input-group">
        <label for="middleName">Middle Name</label>
        <input
          type="text"
          id="middleName"
          v-model="middleName"
          placeholder="Enter your middle name (optional)"
        />
      </div>

      <!-- Last Name (Required) -->
      <div class="input-group">
        <label for="lastName">Last Name <span class="required">*</span></label>
        <input
          type="text"
          id="lastName"
          v-model="lastName"
          placeholder="Enter your last name"
        />
        <p v-if="errors.lastName" class="error-message">
          {{ errors.lastName }}
        </p>
      </div>

      <!-- Email Address (Required) -->
      <div class="input-group">
        <label for="email">Email Address <span class="required">*</span></label>
        <input
          type="email"
          id="email"
          v-model="email"
          placeholder="Enter your email"
        />
        <p v-if="errors.email" class="error-message">{{ errors.email }}</p>
      </div>

      <!-- Phone Number (Required, US Format) -->
      <div class="input-group">
        <label for="phone">Phone Number <span class="required">*</span></label>
        <div class="phone-input">
          <span class="country-code">+1</span>
          <input
            type="text"
            id="phone"
            v-model="phone"
            placeholder="(XXX) XXX-XXXX"
            maxlength="14"
            @input="formatPhone"
          />
        </div>
        <p v-if="errors.phone" class="error-message">{{ errors.phone }}</p>
      </div>

      <!-- Next Step Button -->
      <button class="next-btn" @click="validateAndProceed">Next Step</button>
    </div>
  </div>
</template>

<script setup>
import { ref } from "vue";
import { useRouter } from "vue-router";

const router = useRouter();

// User Input Fields
const firstName = ref("");
const middleName = ref("");
const lastName = ref("");
const email = ref("");
const phone = ref("");

// Validation Errors
const errors = ref({
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
});

// Function to validate email format
const isValidEmail = (email) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

// Function to format phone number as (XXX) XXX-XXXX
const formatPhone = () => {
  let rawNumber = phone.value.replace(/\D/g, ""); // Remove all non-numeric characters
  if (rawNumber.length > 10) rawNumber = rawNumber.substring(0, 10); // Max 10 digits (excluding country code)
  phone.value = rawNumber.replace(/(\d{3})(\d{3})(\d{4})/, "($1) $2-$3");
};

// Function to validate required fields
const validateAndProceed = () => {
  let valid = true;

  // Reset errors
  errors.value = { firstName: "", lastName: "", email: "", phone: "" };

  // First Name Validation
  if (!firstName.value.trim()) {
    errors.value.firstName = "First name is required.";
    valid = false;
  }

  // Last Name Validation
  if (!lastName.value.trim()) {
    errors.value.lastName = "Last name is required.";
    valid = false;
  }

  // Email Validation
  if (!email.value.trim()) {
    errors.value.email = "Email is required.";
    valid = false;
  } else if (!isValidEmail(email.value)) {
    errors.value.email = "Please enter a valid email address.";
    valid = false;
  }

  // Phone Validation
  if (!phone.value.trim()) {
    errors.value.phone = "Phone number is required.";
    valid = false;
  } else if (!/^\(\d{3}\) \d{3}-\d{4}$/.test(phone.value)) {
    errors.value.phone = "Phone number must be in (XXX) XXX-XXXX format.";
    valid = false;
  }

  // Proceed if valid
  if (valid) {
    router.push("/signupStep2"); // Navigate to next step (username & password)
  }
};
</script>

<style scoped>
/* Centering the sign-up form */
.signup-container {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
  background: #f9f9f9;
}

/* Sign-up box */
.signup-box {
  background: white;
  padding: 30px;
  border-radius: 10px;
  box-shadow: 0px 4px 6px rgba(0, 0, 0, 0.1);
  width: 400px;
  text-align: center;
}

/* Input Fields */
.input-group {
  margin-bottom: 15px;
  text-align: left;
}

.input-group label {
  display: block;
  font-weight: bold;
  margin-bottom: 5px;
}

.input-group input {
  width: 100%;
  padding: 10px;
  border: 1px solid #ccc;
  border-radius: 5px;
}

/* Required field asterisk */
.required {
  color: red;
  font-weight: bold;
}

/* Phone Number Input with Country Code */
.phone-input {
  display: flex;
  align-items: center;
}

.country-code {
  background: #4caf50; /* Green background */
  color: white;
  padding: 10px;
  border-radius: 5px 0 0 5px;
  font-weight: bold;
}

.phone-input input {
  flex: 1;
  border-radius: 0 5px 5px 0;
}

/* Error Messages */
.error-message {
  color: red;
  font-size: 0.85rem;
  margin-top: 5px;
}

/* Next Step Button */
.next-btn {
  width: 100%;
  background-color: #4caf50; /* Green button */
  color: white;
  border: none;
  border-radius: 5px;
  padding: 10px;
  font-size: 1rem;
  cursor: pointer;
}

.next-btn:hover {
  background-color: #45a049;
}
</style>
