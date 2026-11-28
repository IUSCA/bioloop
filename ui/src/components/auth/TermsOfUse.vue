<template>
  <div
    ref="termsBox"
    class="max-h-80 overflow-y-auto p-2 text-sm border border-gray-300 dark:border-gray-600 border-solid rounded space-y-2"
    @scroll="checkScroll"
  >
    <p>
      <strong>1. Acceptance of Terms</strong><br />
      By accessing or using this platform, you agree to comply with and be bound
      by these Terms of Use. If you do not agree to these terms, please do not
      use this application.
    </p>

    <p>
      <strong>2. User Responsibilities</strong><br />
      You agree to use the system for lawful purposes only. You are prohibited
      from using the platform to post or transmit any material that is unlawful,
      threatening, defamatory, or otherwise objectionable.
    </p>

    <p>
      <strong>3. Account Security</strong><br />
      You are responsible for maintaining the confidentiality of your account
      credentials. You agree to notify us immediately of any unauthorized use of
      your account or any other breach of security.
    </p>

    <p>
      <strong>4. Intellectual Property</strong><br />
      All content, including but not limited to text, graphics, logos, images,
      and software, is the property of the platform or its content suppliers and
      is protected by applicable intellectual property laws.
    </p>

    <p>
      <strong>5. Prohibited Conduct</strong><br />
      You agree not to engage in any activity that interferes with or disrupts
      the platform or the servers and networks connected to the platform.
    </p>

    <p>
      <strong>6. Termination</strong><br />
      We reserve the right to terminate your access to the platform at any time,
      without notice, for conduct that we believe violates these Terms of Use or
      is harmful to other users of the platform.
    </p>

    <p>
      <strong>7. Disclaimers</strong><br />
      The platform is provided "as is" and "as available" without warranties of
      any kind. We do not guarantee that the platform will be uninterrupted or
      error-free.
    </p>

    <p>
      <strong>8. Limitation of Liability</strong><br />
      In no event shall the platform or its affiliates be liable for any damages
      arising out of or related to your use of the platform.
    </p>

    <p>
      <strong>9. Governing Law</strong><br />
      These Terms shall be governed by and interpreted in accordance with the
      laws of the applicable jurisdiction. Any disputes arising from these terms
      shall be resolved in the courts of the same jurisdiction.
    </p>

    <p>
      <strong>10. Contact Information</strong><br />
      If you have any questions about these Terms, please contact our support
      team.
    </p>

    <p>
      <strong>11. Entire Agreement</strong><br />
      These Terms of Use constitute the entire agreement between you and the
      platform with respect to your use of the service, superseding any prior
      agreements.
    </p>

    <p>
      <strong
        >By scrolling to the bottom and clicking "Accept", you acknowledge that
        you have read, understood, and agreed to be bound by these Terms of
        Use.</strong
      >
    </p>

    <p>Thank you for using our platform responsibly!</p>
  </div>
  <VaCheckbox
    class="mt-4"
    v-model="agreedToTerms"
    :disabled="!scrolledToBottom && !agreedToTerms"
    label="I Agree to the Terms of Use"
  />
</template>

<script setup>
const agreedToTerms = defineModel();
// const props = defineProps({});

const termsBox = ref(null);
// const agreedToTerms = ref(false);
const scrolledToBottom = ref(false);

const checkScroll = () => {
  const el = termsBox.value;
  if (!el) return;
  // If user has scrolled within 10 pixels of end of the scroll div.
  scrolledToBottom.value =
    scrolledToBottom.value ||
    el.scrollTop + el.clientHeight + 10 >= el.scrollHeight;
};
</script>
