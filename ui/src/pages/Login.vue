<template>
  <div class="login-container">
    <div class="login-box">
      <h2 class="text-center mb-4">Sign In</h2>

      <!-- Email Input -->
      <div class="field-wrapper">
        <label class="form-label">EMAIL ADDRESS</label>
        <va-input
          v-model="email"
          placeholder="Enter your email"
          class="mb-3"
          type="email"
        />
      </div>

      <!-- Password Input -->
      <div class="field-wrapper">
        <label class="form-label">PASSWORD</label>
        <va-input
          v-model="password"
          placeholder="Enter your password"
          class="mb-3"
          type="password"
        />
      </div>

      <!-- Remember Me & Forgot Password -->
      <div class="options mb-3">
        <va-checkbox
          v-model="rememberMe"
          class="remember-me"
          label="Remember me"
        />
        <router-link to="/forgot-password" class="forgot-password">
          Forgot password?
        </router-link>
      </div>

      <!-- Sign In Button -->
      <va-button class="w-full login-btn" color="success" @click="handleLogin">
        Sign In
      </va-button>

      <!-- Signup Link -->
      <p class="register-link mt-3">
        Not a member?
        <router-link to="/signup">Signup</router-link>
      </p>
    </div>
  </div>
</template>

<script setup>
import toast from "@/services/toast"; // from your project
import { ref } from "vue";
import { useRouter } from "vue-router";

const email = ref("");
const password = ref("");
const rememberMe = ref(false);
const router = useRouter();

const handleLogin = () => {
  if (!email.value && !password.value) {
    toast.error("Email and Password are required");
    return;
  }

  if (!email.value) {
    toast.error("Email is required");
    return;
  }

  if (!password.value) {
    toast.error("Password is required");
    return;
  }

  console.log("Logging in with:", {
    email: email.value,
    password: password.value,
    rememberMe: rememberMe.value,
  });

  toast.success("Login functionality to be implemented!");
};
</script>

<style scoped>
.login-container {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
  background: #f9f9f9;
}

.login-box {
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
  margin-bottom: 6px;
  color: #2c3e50;
}

.options {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.forgot-password {
  color: #007bff;
  text-decoration: none;
  font-size: 0.9rem;
}

.forgot-password:hover {
  text-decoration: underline;
}

.register-link {
  font-size: 0.9rem;
}

.register-link a {
  color: #007bff;
  text-decoration: none;
}

.register-link a:hover {
  text-decoration: underline;
}

.login-btn:hover {
  filter: brightness(0.95);
}
</style>
