<template>
  <div class="signup-container">
    <div class="signup-box">
      <h2 class="text-center mb-4">Sign Up</h2>

      <!-- First Name -->
      <div class="field-wrapper">
        <label class="form-label">FIRST NAME *</label>
        <va-input v-model="firstName" placeholder="Enter your first name" />
      </div>

      <!-- Middle Name -->
      <div class="field-wrapper">
        <label class="form-label">MIDDLE NAME</label>
        <va-input
          v-model="middleName"
          placeholder="Enter your middle name (optional)"
        />
      </div>

      <!-- Last Name -->
      <div class="field-wrapper">
        <label class="form-label">LAST NAME *</label>
        <va-input v-model="lastName" placeholder="Enter your last name" />
      </div>

      <!-- Email -->
      <div class="field-wrapper">
        <label class="form-label">EMAIL ADDRESS *</label>
        <va-input
          v-model="email"
          placeholder="Enter your email"
          type="email"
          :error="emailTouched && !!errors.email"
          :error-messages="emailTouched ? errors.email : ''"
          @update:modelValue="onEmailUpdate"
        />
      </div>

      <!-- Phone -->
      <div class="field-wrapper">
        <label class="form-label">PHONE NUMBER</label>
        <div class="phone-wrapper">
          <span class="country-code">+1</span>
          <va-input
            v-model="phone"
            placeholder="(XXX) XXX-XXXX"
            maxlength="14"
            class="flex-1"
            @update:modelValue="onPhoneUpdate"
            :error="phoneTouched && !!errors.phone"
            :error-messages="phoneTouched ? errors.phone : ''"
          />
        </div>
      </div>

      <!-- Next Step Button -->
      <va-button
        class="w-full next-btn mt-4"
        color="success"
        @click="validateAndProceed"
      >
        Next Step
      </va-button>
    </div>
  </div>
</template>

<script setup>
import toast from "@/services/toast";
import { useDebounceFn } from "@vueuse/core";
import { ref } from "vue";
import { useRouter } from "vue-router";

const router = useRouter();

const firstName = ref("");
const middleName = ref("");
const lastName = ref("");
const email = ref("");
const phone = ref("");

const errors = ref({
  email: "",
  phone: "",
});

const emailTouched = ref(false);
const phoneTouched = ref(false);

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const isValidPhone = (phone) => /^\(\d{3}\) \d{3}-\d{4}$/.test(phone);

const formatPhone = () => {
  let raw = phone.value.replace(/\D/g, "");
  if (raw.length > 10) raw = raw.slice(0, 10);
  phone.value = raw.replace(/(\d{3})(\d{3})(\d{4})/, "($1) $2-$3");
};

const onEmailUpdate = useDebounceFn((value) => {
  emailTouched.value = true;
  errors.value.email = isValidEmail(value)
    ? ""
    : "Please enter a valid email address.";
}, 500);

const onPhoneUpdate = useDebounceFn((value) => {
  phoneTouched.value = true;
  formatPhone();
  if (value.trim()) {
    errors.value.phone = isValidPhone(phone.value)
      ? ""
      : "Phone number must be in (XXX) XXX-XXXX format.";
  } else {
    errors.value.phone = "";
  }
}, 500);

const validateAndProceed = () => {
  errors.value = {
    email: "",
    phone: "",
  };

  let valid = true;

  if (!firstName.value.trim()) {
    toast.error(
      "First Name is required. To proceed to the next step, please enter the information.",
    );
    valid = false;
  }

  if (!lastName.value.trim()) {
    toast.error(
      "Last Name is required. To proceed to the next step, please enter the information.",
    );
    valid = false;
  }

  if (!email.value.trim()) {
    errors.value.email = "Email is required.";
    toast.error(
      "Email Address is required. To proceed to the next step, please enter the information.",
    );
    valid = false;
  } else if (!isValidEmail(email.value)) {
    errors.value.email = "Please enter a valid email address.";
    toast.error(
      "Email Address is invalid. Please enter a valid email to continue.",
    );
    valid = false;
  }

  if (phone.value.trim() && !isValidPhone(phone.value)) {
    errors.value.phone = "Phone number must be in (XXX) XXX-XXXX format.";
  }

  if (valid) {
    router.push("/signupStep2");
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
  padding: 40px;
  border-radius: 12px;
  box-shadow: 0px 4px 6px rgba(0, 0, 0, 0.1);
  width: 420px;
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

.phone-wrapper {
  display: flex;
  align-items: center;
}

.country-code {
  background: #4caf50;
  color: white;
  padding: 10px;
  border-radius: 5px 0 0 5px;
  font-weight: bold;
}
</style>
