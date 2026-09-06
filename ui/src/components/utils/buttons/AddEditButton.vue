<template>
  <va-button
    :color="color"
    round
    v-if="props.showText"
    preset="primary"
    :border-color="color"
    class="shadow"
  >
    <Icon :icon="icon_name" class="mr-2 text-xl" />
    {{ text }}
  </va-button>
  <va-button
    :color="color"
    round
    preset="secondary"
    :border-color="color"
    class="shadow"
    :aria-label="text"
    v-else
  >
    <Icon :icon="icon_name" class="text-xl" />
  </va-button>
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
  return props.edit ? "material-symbols:edit" : "material-symbols:add";
});
const color = computed(() => {
  return props.edit ? "primary" : "success";
});
const text = computed(() => {
  return props.edit ? "Edit" : "Add";
});
</script>
