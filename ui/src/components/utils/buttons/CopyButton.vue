<template>
  <div v-if="isSupported">
    <va-popover :message="copied ? 'Copied' : 'Copy'">
      <va-button
        @click="copy(props.text)"
        :preset="props.preset"
        :border-color="copied ? 'success' : ''"
      >
        <i-mdi-check-bold style="color: var(--va-success)" v-if="copied" />
        <i-mdi-content-copy v-else />
      </va-button>
    </va-popover>
  </div>
</template>

<script setup>
import { useClipboard } from "@vueuse/core";

const props = defineProps({
  text: String,
  preset: {
    type: String,
    default: "primary",
  },
});

const { copy, copied, isSupported } = useClipboard({
  copiedDuring: 3000,
});
</script>
