<template>
  <va-alert
    v-for="(item, i) in pendingActionItems"
    :key="i"
    color="warning"
    :title="item.title"
  >
    {{ item.text }} -
    <a :href="`/datasets/${props.dataset.id}/actionItems/${item.id}`"
      >#{{ item.id }}</a
    >
  </va-alert>
</template>

<script setup>
const props = defineProps({
  dataset: {
    type: Object,
    required: true,
  },
});

const pendingActionItems = computed(() => {
  return props.dataset.actionItems;
});
</script>

<style scoped></style>
