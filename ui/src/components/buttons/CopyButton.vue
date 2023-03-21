<template>
  <div v-if="isSupported">
    <va-popover :message="copied ? 'Copied' : 'Copy'">
      <va-button
        @click="copy(props.text)"
        icon="content_copy"
        preset="primary"
        class="h-1"
      >
      </va-button>
    </va-popover>
  </div>
</template>

<script setup>
import { useClipboard } from "@vueuse/core";

const props = defineProps({
  text: String,
});

const { copy, copied, isSupported } = useClipboard({
  copiedDuring: 3000,
});
</script>
