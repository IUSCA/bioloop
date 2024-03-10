<template>
  <va-alert dense outline :color="alertColor" class="mb-3.5">
    {{ alertText }}
  </va-alert>
  <div class="flex flex-col gap-2">
    <div>
      Number of files in original dataset:
      <va-chip size="small" outline>{{ props.original_files_count }}</va-chip>
    </div>
    <div>
      Number of files in incoming duplicate dataset:
      <va-chip size="small" outline>{{ props.duplicate_files_count }}</va-chip>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  original_files_count: { type: Number, required: true },
  duplicate_files_count: { type: Number, required: true },
});

const alertColor = computed(() => {
  return props.original_files_count === props.duplicate_files_count
    ? "success"
    : "warning";
});

const alertText = computed(() => {
  return props.original_files_count === props.duplicate_files_count
    ? "Number of files in original dataset and incoming duplicate match"
    : "Number of files in original dataset and incoming duplicate do not match";
});
</script>

<style scoped></style>
