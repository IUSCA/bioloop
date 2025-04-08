<template>
  <P class="text-3xl">Biobank</P>
</template>

<script setup>
import { computed } from "vue";
import { useColors } from "vuestic-ui";

const { getColor } = useColors();

const props = defineProps({
  height: {
    type: Number,
    default: 18,
  },
  start: {
    type: String,
    default: "primary",
  },
  end: {
    type: String,
  },
});

const colorsComputed = computed(() => {
  return {
    start: getColor(props.start),
    end: getColor(props.end || props.start),
  };
});
</script>
