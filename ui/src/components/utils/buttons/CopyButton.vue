<template>
  <div v-if="isSupported" class="flex items-center justify-center">
    <va-popover
      :message="copied ? 'Copied' : 'Copy'"
      :hover-over-timeout="1000"
      class="flex-none"
    >
      <va-button @click="copy(props.text)" :preset="props.preset">
        <i-mdi-check-bold style="color: var(--va-success)" v-if="copied" />
        <i-mdi-content-copy v-else style="color: var(--va-primary)" />
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
