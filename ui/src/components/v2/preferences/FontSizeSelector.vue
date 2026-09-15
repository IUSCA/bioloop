<template>
  <VaCard>
    <VaCardContent class="flex flex-col gap-3">
      <div>
        <h2 class="v2-card-title">Text size</h2>
        <p class="mt-1 text-sm va-text-secondary">
          Control the text size - Only affects this browser.
        </p>
      </div>
      <ModernButtonToggle
        v-model="fontSize"
        :options="FONT_SIZES"
        text-by="label"
        value-by="value"
        color="primary"
      />
    </VaCardContent>
  </VaCard>
</template>

<script setup>
/**
 * Lets a user pick Small, Medium, or Large text for this browser.
 * @see docs/contributing/v2-design-system.md - Typography
 */
import { FONT_SIZES, useFontSize } from "@/composables/useFontSize";

const fontSize = useFontSize();
</script>
