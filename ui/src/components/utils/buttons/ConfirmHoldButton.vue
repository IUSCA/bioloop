<template>
  <div class="holdbtn rounded">
    <va-button ref="longBtn" :color="props.color" preset="primary">
      <Icon :icon="props.icon" class="mr-3 text-xl" />

      <span>
        {{ (isHovered ? "Hold to " : "") + props.action }}
      </span>
    </va-button>
  </div>
</template>

<script setup>
import { onLongPress, useElementHover } from "@vueuse/core";
const props = defineProps({
  icon: String,
  action: String,
  color: String,
});

const emit = defineEmits(["click"]);

// https://stackblitz.com/edit/vitejs-vite-zf2ma3?file=src%2FApp.vue
const longBtn = ref(null);
onLongPress(
  longBtn,
  () => {
    emit("click");
  },
  {
    delay: 3000,
  },
);
const isHovered = useElementHover(longBtn);
</script>

<style scoped>
/* https://stackoverflow.com/questions/17212094/fill-background-color-left-to-right-css */
/* https://jsfiddle.net/75Umu/3/ */
div.holdbtn {
  background: linear-gradient(
    to right,
    rgba(175, 175, 175, 0.4) 50%,
    rgba(0, 0, 0, 0) 50%
  );
  background-size: 200% 100%;
  background-position: right bottom;
  transition: all 3s ease;
}
div.holdbtn:active {
  background-position: left bottom;
}
</style>
