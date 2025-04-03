<template>
  <div class="signup-container">
    <div class="signup-box">
      <h2>Welcome {{ fullName }}, Please create your username and password.</h2>

      <!-- Username -->
      <div class="input-group">
        <label for="username">Username <span class="required">*</span></label>
        <input
          type="text"
          id="username"
          v-model="username"
          placeholder="Enter your username"
        />
        <p v-if="errors.username" class="error-message">
          {{ errors.username }}
        </p>
      </div>

      <!-- Password Field with Toggle Eye Icon -->
      <div class="input-group password-group">
        <label for="password">Password <span class="required">*</span></label>
        <div class="password-wrapper">
          <input
            :type="showPassword ? 'text' : 'password'"
            id="password"
            v-model="password"
            placeholder="Enter your password"
          />
          <span class="toggle-password" @click="togglePasswordVisibility">
            <i :class="showPassword ? 'fa fa-eye-slash' : 'fa fa-eye'"></i>
          </span>
        </div>
        <p v-if="errors.password" class="error-message">
          {{ errors.password }}
        </p>
      </div>

      <!-- Confirm Password Field with Toggle Eye Icon -->
      <div class="input-group password-group">
        <label for="confirmPassword"
          >Confirm Password <span class="required">*</span></label
        >
        <div class="password-wrapper">
          <input
            :type="showConfirmPassword ? 'text' : 'password'"
            id="confirmPassword"
            v-model="confirmPassword"
            placeholder="Re-enter your password"
          />
          <span
            class="toggle-password"
            @click="toggleConfirmPasswordVisibility"
          >
            <i
              :class="showConfirmPassword ? 'fa fa-eye-slash' : 'fa fa-eye'"
            ></i>
          </span>
        </div>
        <p v-if="errors.confirmPassword" class="error-message">
          {{ errors.confirmPassword }}
        </p>
      </div>

      <!-- Password Requirements -->
      <div class="password-requirements">
        <h4>Password must contain:</h4>
        <ul>
          <li>✅ At least 8 characters</li>
          <li>✅ At least one uppercase letter</li>
          <li>✅ At least one lowercase letter</li>
          <li>✅ At least one number</li>
          <li>✅ At least one special character (!@#$%^&*)</li>
          <li>✅ No repeating characters (e.g., "aaaaaa")</li>
          <li>✅ Cannot contain personal info (Name, Email, Username)</li>
        </ul>
      </div>

      <!-- Terms of Use Link -->
      <p class="terms-link">
        <a href="#" @click.prevent="showTermsModal = true">Terms of Use</a>
      </p>

      <!-- Terms of Use Modal -->
      <div v-if="showTermsModal" class="modal">
        <div class="modal-content">
          <h3>Terms of Use</h3>
          <div class="terms-text" @scroll="checkScroll">
            <p>
              Sample Terms of Use - Please scroll to the bottom to continue.
            </p>
            <p>More Terms...</p>
            <p>Even more Terms...</p>
            <p>End of the document...</p>
          </div>
          <label>
            <input
              type="checkbox"
              v-model="agreedToTerms"
              :disabled="!scrolledToBottom"
            />
            I agree to the Terms of Use
          </label>
          <button @click="acceptTerms" :disabled="!agreedToTerms">
            Accept
          </button>
          <button @click="showTermsModal = false">Close</button>
        </div>
      </div>

      <!-- Green "Create Account" Button -->
      <button class="create-account-btn" @click="validateAndProceed">
        Create Account
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";

const router = useRouter();
const route = useRoute();

// Grabbing user details from Signup.vue via route params
const fullName = computed(() => {
  return `${route.query.firstName || ""} ${route.query.middleName || ""} ${route.query.lastName || ""}`.trim();
});

// Form Fields
const username = ref("");
const password = ref("");
const confirmPassword = ref("");
const showPassword = ref(false);
const showConfirmPassword = ref(false);
const errors = ref({});

// Terms Modal State
const showTermsModal = ref(false);
const scrolledToBottom = ref(false);
const agreedToTerms = ref(false);

// Toggle Password Visibility
const togglePasswordVisibility = () => {
  showPassword.value = !showPassword.value;
};
const toggleConfirmPasswordVisibility = () => {
  showConfirmPassword.value = !showConfirmPassword.value;
};

// Validate Inputs
const validateAndProceed = () => {
  errors.value = {};

  if (!username.value.trim()) {
    errors.value.username = "Username is required.";
  }

  if (!password.value) {
    errors.value.password = "Password is required.";
  }

  if (confirmPassword.value !== password.value) {
    errors.value.confirmPassword = "Passwords do not match.";
  }

  if (Object.keys(errors.value).length === 0) {
    alert("Account created successfully! (Simulated)");
  }
};
</script>

<style scoped>
.signup-container {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
  background: #f9f9f9;
}

.signup-box {
  background: white;
  padding: 30px;
  border-radius: 10px;
  box-shadow: 0px 4px 6px rgba(0, 0, 0, 0.1);
  width: 400px;
  text-align: center;
}

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

.password-wrapper {
  position: relative;
}

.toggle-password {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  cursor: pointer;
  font-size: 1.2rem;
  color: #555;
}

.error-message {
  color: red;
  font-size: 0.85rem;
}

/* Green Create Account Button */
.create-account-btn {
  width: 100%;
  background-color: #4caf50; /* ✅ Green button */
  color: white;
  border: none;
  border-radius: 5px;
  padding: 10px;
  font-size: 1rem;
  cursor: pointer;
}

.create-account-btn:hover {
  background-color: #45a049;
}

.terms-link a {
  color: blue;
  cursor: pointer;
}

.modal {
  position: fixed;
  top: 20%;
  left: 50%;
  transform: translate(-50%, -20%);
  background: white;
  padding: 20px;
  border-radius: 10px;
}

.modal-content {
  max-height: 300px;
  overflow-y: auto;
}
</style>
