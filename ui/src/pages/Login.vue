<template>
  <div class="login-container">
    <div class="login-box">
      <h2>Sign In</h2>

      <!-- Email Input -->
      <div class="input-group">
        <label for="email">Email Address</label>
        <input
          type="email"
          id="email"
          v-model="email"
          placeholder="Enter your email"
        />
      </div>

      <!-- Password Input -->
      <div class="input-group">
        <label for="password">Password</label>
        <input
          type="password"
          id="password"
          v-model="password"
          placeholder="Enter your password"
        />
      </div>

      <!-- Remember Me & Forgot Password -->
      <div class="options">
        <label class="remember-me">
          <input type="checkbox" v-model="rememberMe" />
          <span class="checkbox-custom"></span>
          Remember me
        </label>
        <router-link to="/forgot-password" class="forgot-password">
          Forgot password?
        </router-link>
      </div>

      <!-- Sign In Button -->
      <button class="login-btn" @click="handleLogin">Sign In</button>

      <!-- Signup Link (Navigates to Signup.vue) -->
      <p class="register-link">
        Not a member? <router-link to="/signup">Signup</router-link>
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref } from "vue";
import { useRouter } from "vue-router";

const email = ref("");
const password = ref("");
const rememberMe = ref(false);
const router = useRouter();

const handleLogin = () => {
  console.log("Logging in with:", {
    email: email.value,
    password: password.value,
    rememberMe: rememberMe.value,
  });

  // Future: Implement authentication logic here
  alert("Login functionality to be implemented!");
};
</script>

<style scoped>
/* Center the login box */
.login-container {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
  background: #f9f9f9;
}

/* Login box */
.login-box {
  background: white;
  padding: 30px;
  border-radius: 10px;
  box-shadow: 0px 4px 6px rgba(0, 0, 0, 0.1);
  width: 350px;
  text-align: center;
}

/* Input fields */
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

/* Remember me & forgot password */
.options {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

/* Custom checkbox */
.remember-me {
  display: flex;
  align-items: center;
  cursor: pointer;
}

.remember-me input {
  display: none;
}

.checkbox-custom {
  width: 18px;
  height: 18px;
  border-radius: 5px;
  background: #e0e0e0;
  display: inline-block;
  margin-right: 8px;
  transition: background 0.3s ease-in-out;
}

.remember-me input:checked + .checkbox-custom {
  background: #4caf50; /* ✅ Green highlight when checked */
}

/* Forgot password */
.forgot-password {
  color: #007bff;
  text-decoration: none;
  font-size: 0.9rem;
}

.forgot-password:hover {
  text-decoration: underline;
}

/* Sign-in button */
.login-btn {
  width: 100%;
  background-color: #4caf50; /* ✅ Green Sign-In button */
  color: white;
  border: none;
  border-radius: 5px;
  padding: 10px;
  font-size: 1rem;
  cursor: pointer;
}

.login-btn:hover {
  background-color: #45a049;
}

/* Register link */
.register-link {
  margin-top: 10px;
  font-size: 0.9rem;
}

.register-link a {
  color: #007bff;
  text-decoration: none;
}

.register-link a:hover {
  text-decoration: underline;
}
</style>
