<template>
  <va-button
    :color="color"
    :icon="icon_name"
    round
    v-if="props.showText"
    preset="primary"
    :border-color="color"
    class="shadow"
  >
    {{ text }}
  </va-button>
  <va-button
    :color="color"
    :icon="icon_name"
    round
    preset="secondary"
    :border-color="color"
    class="shadow"
    v-else
  />
</template>

<script setup>
const props = defineProps({
  edit: {
    type: Boolean,
    default: false,
  },
  showText: {
    type: Boolean,
    default: false,
  },
});

const icon_name = computed(() => {
  return props.edit ? "edit" : "add";
});
const color = computed(() => {
  return props.edit ? "primary" : "success";
});
const text = computed(() => {
  return props.edit ? "Edit" : "Add";
});
</script>
