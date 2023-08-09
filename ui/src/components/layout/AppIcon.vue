<template>
  <img
    :class="`w-${props.size} h-${props.size}`"
    :src="currentPresetName === 'dark' ? '/dark-logo.svg' : '/logo.svg'"
  />
</template>

<script setup>
import { useColors } from "vuestic-ui";
const { currentPresetName } = useColors();

const props = defineProps({
  size: {
    type: String,
    default: "8",
  },
});

/**
 * :class="
                  'title-text ' + (ui.isMobileView ? 'w-10 h10' : 'w-12 h-12')
                "

                import { useUIStore } from "@/stores/ui";
                const ui = useUIStore();
 */
</script>
