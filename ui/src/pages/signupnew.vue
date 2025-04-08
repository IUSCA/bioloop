<template>
  <VaForm
    ref="form"
    @submit.prevent="submit"
    class="max-w-md mx-auto mt-20 px-4"
  >
    <h1 class="font-semibold text-4xl mb-4">Sign up</h1>
    <p class="text-base mb-4 leading-5">
      Have an account?
      <RouterLink :to="{ name: 'login' }" class="font-semibold text-primary">
        Login
      </RouterLink>
    </p>

    <!-- Full Name -->
    <VaInput v-model="formData.fullName" label="Full Name" class="mb-4" />

    <!-- Email (disabled) -->

    <VaInput
      v-model="formData.email"
      :rules="[
        (v) => !!v || 'Email field is required',
        (v) => /.+@.+\..+/.test(v) || 'Email should be valid',
      ]"
      class="mb-4"
      label="Email"
      placeholder="Email"
      type="email"
      disabled
    />

    <!-- Institution Type -->
    <VaSelect
      v-model="formData.institutionType"
      label="Institution Type"
      :options="[
        'Commercial',
        'External Academic',
        'Internal Academic',
        'Non-profit',
        'Other',
      ]"
      class="mb-4"
    />

    <!-- Institution Name -->
    <VaInput
      v-model="formData.organization"
      label="Institution Name"
      class="mb-4"
    />

    <!-- Username -->
    <VaInput v-model="formData.username" label="Username" class="mb-4" />

    <!-- Terms of Use -->
    <div class="text-sm text-left mb-4">
      <a
        href="#"
        class="text-primary underline"
        @click.prevent="showTermsModal = true"
      >
        View Terms of Use
      </a>
    </div>

    <div class="flex justify-center mt-4">
      <VaButton class="w-full" @click="submit"> Create account</VaButton>
    </div>

    <!-- Terms Modal -->
    <VaModal
      v-model="showTermsModal"
      title="Terms of Use"
      ok-text="Accept"
      cancel-text="Close"
      :ok-disabled="!agreedToTerms"
      @ok="acceptTerms"
    >
      <div
        ref="termsBox"
        class="max-h-64 overflow-y-auto pr-2 text-sm"
        @scroll="checkScroll"
      >
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
          that is unlawful, threatening, defamatory, or otherwise objectionable.
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
          time, without notice, for conduct that we believe violates these Terms
          of Use or is harmful to other users of the platform.
        </p>

        <p>
          <strong>7. Disclaimers</strong><br />
          The platform is provided "as is" and "as available" without warranties
          of any kind. We do not guarantee that the platform will be
          uninterrupted or error-free.
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
          these terms shall be resolved in the courts of the same jurisdiction.
        </p>

        <p>
          <strong>10. Contact Information</strong><br />
          If you have any questions about these Terms, please contact our
          support team.
        </p>

        <p>
          <strong>11. Entire Agreement</strong><br />
          These Terms of Use constitute the entire agreement between you and the
          platform with respect to your use of the service, superseding any
          prior agreements.
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

      <VaCheckbox
        class="mt-4"
        v-model="agreedToTerms"
        :disabled="!scrolledToBottom"
        label="I agree to the Terms of Use"
      />
    </VaModal>
  </VaForm>
</template>

<script setup>
import { reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { useToast } from "vuestic-ui";

const form = ref(null);
const { push } = useRouter();
const { init } = useToast();

const showTermsModal = ref(false);
const termsBox = ref(null);
const agreedToTerms = ref(false);
const scrolledToBottom = ref(false);

const checkScroll = () => {
  const el = termsBox.value;
  if (!el) return;
  scrolledToBottom.value = el.scrollTop + el.clientHeight >= el.scrollHeight;
};

const acceptTerms = () => {
  showTermsModal.value = false;
};

const formData = reactive({
  fullName: "",
  email: "",
  institutionType: "",
  organization: "",
  username: "",
});

const submit = () => {
  const requiredFields = [
    { label: "Full Name", value: formData.fullName },
    { label: "Email", value: formData.email },
    { label: "Institution Type", value: formData.institutionType },
    { label: "Institution Name", value: formData.organization },
    { label: "Username", value: formData.username },
  ];

  for (const field of requiredFields) {
    if (!field.value || !field.value.toString().trim()) {
      init({ message: `${field.label} is required.`, color: "danger" });
      return;
    }
  }

  if (!agreedToTerms.value) {
    init({ message: "You must agree to the Terms of Use.", color: "warning" });
    showTermsModal.value = true;
    return;
  }

  init({ message: "You've successfully completed signup!", color: "success" });
  push({ name: "dashboard" });
};
</script>

<route lang="yaml">
meta:
  layout: auth2
  title: Sign Up
  requiresAuth: false
</route>
