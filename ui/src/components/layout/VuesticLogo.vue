<template>
  <div
    class="h-full w-full flex flex-col justify-center"
    :style="{ 'background-color': computedColors.background }"
  >
    <div
      class="flex flex-col items-center justify-center gap-5 transform -translate-y-5"
    >
      <AppIcon :size="`${height}rem`" v-show="props.view === 'lg'" />
      <p
        class="text-4xl tracking-wider uppercase font-[audiowide] whitespace-nowrap"
        :style="{ color: computedColors.text }"
      >
        Biobank
      </p>
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { useColors } from "vuestic-ui";
import AppIcon from "./AppIcon.vue";

const { getColor, colors } = useColors();

const props = defineProps({
  view: {
    type: String,
    default: "lg",
  },
});

const computedColors = computed(() => ({
  text: props.view === "sm" ? colors.primary : getColor("#FFF"),
  background: props.view === "sm" ? null : colors.primary,
}));
const height = computed(() => (props.view === "sm" ? 2 : 7));
</script>
