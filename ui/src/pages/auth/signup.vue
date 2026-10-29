<template>
  <div>
    <VaInnerLoading :loading="loading">
      <h1 class="font-semibold text-4xl mb-4">Sign up</h1>
      <div v-show="step == 1">
        <VaForm ref="form" @submit.prevent="submit" class="">
          <p class="text-base mb-4 leading-5">
            Have an account?
            <RouterLink to="/auth" class="font-semibold text-primary"
              >Login</RouterLink
            >
          </p>

          <!-- Email (disabled) -->
          <VaInput
            v-model="formData.email"
            class="mb-4 w-full"
            label="Email"
            placeholder="Email"
            type="email"
            readonly=""
            preset="solid"
          />

          <!-- Full Name -->
          <VaInput
            v-model="formData.full_name"
            label="Full Name"
            placeholder="Full name"
            class="mb-4 w-full"
            :rules="[(value) => !!value || 'Full name is required']"
          />

          <!-- Username -->
          <VaInput
            v-model="formData.username"
            label="Username"
            placeholder="Username"
            class="mb-4 w-full"
            :rules="[
              (value) => !!value || 'Username is required',
              (value) =>
                (value.length >= 3 && value.length <= 30) ||
                'Username must be at between 3 to 30 characters long',
              (value) =>
                usernameRegex().test(value) ||
                'Username may only contain alphanumeric characters and only single hyphens, and cannot begin or end with a hyphen',
              (value) =>
                usernameBlacklist.validate(value) || 'Username is not allowed',
            ]"
          />

          <!-- Institution Name -->
          <VaInput
            v-model="formData.institution_name"
            label="Institution Name"
            placeholder="Institution Name"
            class="mb-4 w-full"
            :rules="[(value) => !!value || 'Institution name is required']"
          />

          <!-- Institution Type -->
          <VaSelect
            v-model="formData.institution_type"
            label="Institution Type"
            :options="institution_types"
            placeholder="Select Institution Type"
            class="mb-4 w-full"
            :rules="[(value) => !!value || 'Institution type is required']"
          />

          <div class="flex justify-center mt-4">
            <VaButton
              class="w-full"
              @click="
                () => {
                  if (validate()) step = 2;
                }
              "
              :disabled="!isValid"
            >
              Next
            </VaButton>
          </div>
        </VaForm>
      </div>

      <div v-show="step == 2" class="w-full h-full">
        <VaButton
          @click="step = 1"
          preset="plain"
          class="mb-4"
          icon="arrow_back"
        >
          Previous
        </VaButton>

        <TermsOfUse v-model="has_agreed_to_terms" />

        <div class="flex justify-center mt-4">
          <VaButton
            class="w-full"
            :disabled="!has_agreed_to_terms"
            :loading="loading"
            @click="submit"
          >
            Create Account
          </VaButton>
        </div>
      </div>
    </VaInnerLoading>
  </div>
</template>

<script setup>
import authService from "@/services/auth";
import toast from "@/services/toast";
import { useAuthStore } from "@/stores/auth";
import usernameRegex from "regex-username";
import usernameBlacklist from "the-big-username-blacklist";
import { useRouter } from "vue-router";
import { useForm } from "vuestic-ui";

const auth = useAuthStore();
const { isValid, validate } = useForm("form");
const router = useRouter();

const formData = ref({
  email: auth.signupEmail,
  full_name: "",
  username: "",
  institution_type: "",
  institution_name: "",
});
const has_agreed_to_terms = ref(false);
const step = ref(1);
const loading = ref(false);

const institution_types = [
  "Commercial",
  "External Academic",
  "Internal Academic",
  "Non-profit",
  "Other",
];
console.log(usernameRegex());

onMounted(() => {
  // if auth.signupEmail is not set,
  // or signupToken is not set,
  // redirect to auth page
  if (!auth.signupEmail || !auth.signupToken) {
    router.push("/auth");
  }
});

const submit = () => {
  if (validate()) {
    loading.value = true;
    authService
      .signup({
        ...formData.value,
        has_agreed_to_terms: has_agreed_to_terms.value,
      })
      .then((res) => {
        if (res.data?.status === "success") {
          auth.onLogin(res.data);
          auth.clearSignupData();
          router.push("/");
          return;
        } else {
          console.error("Signup response status is not success");
          return Promise.reject();
        }
      })
      .catch((error) => {
        console.error(error);
        // clear signup email and token
        auth.clearSignupData();
        toast.error(error?.response?.data?.message || "Failed to sign up");
        router.push({
          path: "/auth",
        });
      })
      .finally(() => {
        loading.value = false;
      });
  }
};
</script>

<route lang="yaml">
meta:
  layout: auth2
  title: Sign Up
  requiresAuth: false
</route>
