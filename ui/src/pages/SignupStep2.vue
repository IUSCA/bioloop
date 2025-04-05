<template>
  <div class="signup-container">
    <div class="signup-box">
      <h2 class="text-center mb-4">
        Welcome {{ fullName }}, Please create your username and password.
      </h2>

      <!-- Username -->
      <div class="field-wrapper">
        <label class="form-label">USERNAME *</label>
        <va-input v-model="username" placeholder="Enter your username" />
      </div>

      <!-- Password -->
      <div class="field-wrapper">
        <label class="form-label">PASSWORD *</label>
        <va-input
          v-model="password"
          :type="showPassword ? 'text' : 'password'"
          placeholder="Enter your password"
        >
          <template #appendInner>
            <span
              v-if="password"
              class="material-icons eye-icon"
              @click="togglePasswordVisibility"
            >
              {{ showPassword ? "visibility_off" : "visibility" }}
            </span>
          </template>
        </va-input>

        <!-- Password Strength -->
        <div v-if="password" class="strength-indicator mt-2">
          <div class="strength-bar-wrapper">
            <div
              class="strength-bar"
              :style="{
                width: strengthPercentage + '%',
                backgroundColor: strengthColor,
              }"
            ></div>
          </div>
          <div class="strength-label" :style="{ color: strengthColor }">
            {{ passwordStrength }}
          </div>
        </div>
      </div>

      <!-- Confirm Password -->
      <div class="field-wrapper">
        <label class="form-label">CONFIRM PASSWORD *</label>
        <va-input
          v-model="confirmPassword"
          :type="showConfirmPassword ? 'text' : 'password'"
          placeholder="Re-enter your password"
        >
          <template #appendInner>
            <span
              v-if="confirmPassword"
              class="material-icons eye-icon"
              @click="toggleConfirmPasswordVisibility"
            >
              {{ showConfirmPassword ? "visibility_off" : "visibility" }}
            </span>
          </template>
        </va-input>
      </div>

      <!-- Password Requirements -->
      <div class="password-requirements mt-3 mb-4">
        <h4 class="text-base font-semibold mb-2">Password must contain:</h4>
        <ul class="text-left text-sm list-disc pl-5">
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

      <!-- Terms Modal -->
      <va-modal
        v-model="showTermsModal"
        title="Terms of Use"
        ok-text="Accept"
        cancel-text="Close"
        :ok-disabled="!agreedToTerms"
        @ok="acceptTerms"
      >
        <div
          class="terms-text"
          style="max-height: 220px; overflow-y: auto"
          @scroll="checkScroll"
          ref="termsBox"
        >
          <!-- Terms content remains same -->
          <p>
            <strong>1. Acceptance of Terms</strong><br />
            By accessing or using this platform, you agree to comply with and be
            bound by these Terms of Use. If you do not agree to these terms,
            please do not use this application.
          </p>

          <p>
            <strong>2. User Responsibilities</strong><br />
            You agree to use the system for lawful purposes only. You are
            prohibited from using the platform to post or transmit any material
            that is unlawful, threatening, defamatory, or otherwise
            objectionable.
          </p>

          <p>
            <strong>3. Account Security</strong><br />
            You are responsible for maintaining the confidentiality of your
            account credentials. You agree to notify us immediately of any
            unauthorized use of your account or any other breach of security.
          </p>

          <p>
            <strong>4. Intellectual Property</strong><br />
            All content, including but not limited to text, graphics, logos,
            images, and software, is the property of the platform or its content
            suppliers and is protected by applicable intellectual property laws.
          </p>

          <p>
            <strong>5. Prohibited Conduct</strong><br />
            You agree not to engage in any activity that interferes with or
            disrupts the platform or the servers and networks connected to the
            platform.
          </p>

          <p>
            <strong>6. Termination</strong><br />
            We reserve the right to terminate your access to the platform at any
            time, without notice, for conduct that we believe violates these
            Terms of Use or is harmful to other users of the platform.
          </p>

          <p>
            <strong>7. Disclaimers</strong><br />
            The platform is provided "as is" and "as available" without
            warranties of any kind. We do not guarantee that the platform will
            be uninterrupted or error-free.
          </p>

          <p>
            <strong>8. Limitation of Liability</strong><br />
            In no event shall the platform or its affiliates be liable for any
            damages arising out of or related to your use of the platform.
          </p>

          <p>
            <strong>9. Governing Law</strong><br />
            These Terms shall be governed by and interpreted in accordance with
            the laws of the applicable jurisdiction. Any disputes arising from
            these terms shall be resolved in the courts of the same
            jurisdiction.
          </p>

          <p>
            <strong>10. Contact Information</strong><br />
            If you have any questions about these Terms, please contact our
            support team.
          </p>

          <p>
            <strong>11. Entire Agreement</strong><br />
            These Terms of Use constitute the entire agreement between you and
            the platform with respect to your use of the service, superseding
            any prior agreements.
          </p>

          <p>
            <strong
              >By scrolling to the bottom and clicking "Accept", you acknowledge
              that you have read, understood, and agreed to be bound by these
              Terms of Use.</strong
            >
          </p>

          <p>Thank you for using our platform responsibly!</p>
        </div>
        <va-checkbox
          class="mt-3"
          v-model="agreedToTerms"
          :disabled="!scrolledToBottom"
          label="I agree to the Terms of Use"
        />
      </va-modal>

      <!-- Submit -->
      <va-button
        color="success"
        class="w-full mt-4"
        @click="validateAndProceed"
      >
        Create Account
      </va-button>
    </div>
  </div>
</template>

<script setup>
import toast from "@/services/toast";
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";

const router = useRouter();
const route = useRoute();

const fullName = computed(() =>
  `${route.query.firstName || ""} ${route.query.middleName || ""} ${route.query.lastName || ""}`.trim(),
);

const username = ref("");
const password = ref("");
const confirmPassword = ref("");

// Eye toggles
const showPassword = ref(false);
const showConfirmPassword = ref(false);
const togglePasswordVisibility = () => {
  showPassword.value = !showPassword.value;
};
const toggleConfirmPasswordVisibility = () => {
  showConfirmPassword.value = !showConfirmPassword.value;
};

// Password strength
const passwordStrength = computed(() => {
  if (!password.value) return "";
  let strength = 0;
  if (password.value.length >= 8) strength++;
  if (/[A-Z]/.test(password.value)) strength++;
  if (/[a-z]/.test(password.value)) strength++;
  if (/[0-9]/.test(password.value)) strength++;
  if (/[^A-Za-z0-9]/.test(password.value)) strength++;

  if (strength <= 2) return "Weak";
  if (strength === 3 || strength === 4) return "Moderate";
  return "Strong";
});

const strengthColor = computed(() => {
  if (passwordStrength.value === "Weak") return "red";
  if (passwordStrength.value === "Moderate") return "orange";
  if (passwordStrength.value === "Strong") return "green";
  return "transparent";
});

const strengthPercentage = computed(() => {
  if (passwordStrength.value === "Weak") return 33;
  if (passwordStrength.value === "Moderate") return 66;
  if (passwordStrength.value === "Strong") return 100;
  return 0;
});

// Terms modal
const showTermsModal = ref(false);
const scrolledToBottom = ref(false);
const agreedToTerms = ref(false);
const termsBox = ref(null);

const checkScroll = () => {
  const el = termsBox.value;
  if (!el) return;
  scrolledToBottom.value = el.scrollTop + el.clientHeight >= el.scrollHeight;
};

const acceptTerms = () => {
  showTermsModal.value = false;
};

const validateAndProceed = () => {
  if (!username.value.trim()) {
    toast.error("Username is required. Please enter your username.");
    return;
  }

  if (!password.value) {
    toast.error("Password is required. Please enter your password.");
    return;
  }

  if (passwordStrength.value !== "Strong") {
    toast.error("Password must be Strong. Please follow the password rules.");
    return;
  }

  if (!confirmPassword.value) {
    toast.error("Confirm Password is required. Please re-enter your password.");
    return;
  }

  if (confirmPassword.value !== password.value) {
    toast.error("Passwords do not match. Please check your confirmation.");
    return;
  }

  if (!agreedToTerms.value) {
    toast.error("You must agree to the Terms of Use to proceed.");
    showTermsModal.value = true;
    return;
  }

  toast.success("Account created successfully!");
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
  padding: 40px;
  border-radius: 12px;
  box-shadow: 0px 4px 6px rgba(0, 0, 0, 0.1);
  width: 420px;
  text-align: center;
}

.field-wrapper {
  margin-bottom: 16px;
  text-align: left;
}

.form-label {
  display: block;
  font-weight: bold;
  font-size: 0.9rem;
  text-transform: uppercase;
  color: #2c3e50;
  margin-bottom: 6px;
}

.terms-link a {
  color: #007bff;
  text-decoration: none;
  font-size: 1rem;
}

.terms-link a:hover {
  text-decoration: underline;
}

.password-requirements ul {
  list-style: none;
  padding: 0;
  font-size: 0.95rem;
}

.password-requirements li {
  margin-bottom: 4px;
}

.eye-icon {
  cursor: pointer;
  user-select: none;
  font-size: 20px;
  color: #666;
}

.strength-indicator {
  margin-top: 6px;
}

.strength-bar-wrapper {
  height: 8px;
  width: 100%;
  background-color: #eee;
  border-radius: 4px;
  overflow: hidden;
}

.strength-bar {
  height: 100%;
  transition:
    width 0.3s ease-in-out,
    background-color 0.3s ease-in-out;
}

.strength-label {
  font-size: 0.85rem;
  margin-top: 4px;
  font-weight: 500;
}
</style>
