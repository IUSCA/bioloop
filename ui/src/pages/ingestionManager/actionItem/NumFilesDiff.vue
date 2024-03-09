<template>
  <div class="flex gap-2">
    <div>
      Number of files in original dataset:
      {{ props.original_files_count }}
    </div>
    <va-divider vertical></va-divider>
    <div>
      Number of files in incoming duplicate dataset:
      {{ props.duplicate_files_count }}
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  original_files_count: { type: Number, required: true },
  duplicate_files_count: { type: Number, required: true },
});
</script>

<style scoped></style>
