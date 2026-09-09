<template>
  <VaCard v-if="props.aboutMd?.trim()">
    <VaCardContent>
      <h2 class="text-sm font-semibold mb-3">ABOUT</h2>
      <ProfileAboutBody :about-md="props.aboutMd" />
    </VaCardContent>
  </VaCard>
</template>

<script setup>
import ProfileAboutBody from "@/components/v2/profiles/ProfileAboutBody.vue";

/**
 * The About card on a profile. Renders nothing when there is nothing to say.
 *
 * @see docs/design/groups/profiles.md — The UI
 */
const props = defineProps({
  aboutMd: { type: String, default: "" },
});
</script>
