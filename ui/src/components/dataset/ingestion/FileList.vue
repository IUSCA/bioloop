<template>
  <va-list>
    <va-list-item v-for="(file, index) in props.selectedFiles" :key="index">
      <va-list-item-section>
        <va-list-item-label>
          {{ file.path }}
        </va-list-item-label>
      </va-list-item-section>
    </va-list-item>
  </va-list>
</template>

<script setup>
const props = defineProps({
  selectedFiles: {
    type: Array,
    default: () => [],
  },
});
</script>

<style scoped></style>
