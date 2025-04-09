<template>
  <div>
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
          :rules="[(value) => !!value || 'Username is required']"
        />

        <!-- Institution Name -->
        <VaInput
          v-model="formData.institution"
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
      <VaButton @click="step = 1" preset="plain" class="mb-4" icon="arrow_back">
        Previous
      </VaButton>

      <TermsOfUse v-model="has_agreed_to_terms" />

      <div class="flex justify-center mt-4">
        <VaButton class="w-full" :disabled="!has_agreed_to_terms">
          Create Account
        </VaButton>
      </div>
    </div>
  </div>
</template>

<script setup>
import TermsOfUse from "@/components/auth/TermsOfUse.vue";
import { useRouter } from "vue-router";
import { useForm, useToast } from "vuestic-ui";

const { isValid, validate } = useForm("form");
const { push } = useRouter();
const { init } = useToast();

const formData = ref({
  email: "user@example.com",
  full_name: "",
  username: "",
  institution_type: "",
  institution: "",
});
const has_agreed_to_terms = ref(false);

const institution_types = [
  "Commercial",
  "External Academic",
  "Internal Academic",
  "Non-profit",
  "Other",
];

const step = ref(1);

const submit = () => {
  if (validate()) {
    init({
      message: "You've successfully signed up",
      color: "success",
    });
    push({ name: "dashboard" });
  }
};
</script>

<route lang="yaml">
meta:
  layout: auth2
  title: Sign Up
  requiresAuth: false
</route>
