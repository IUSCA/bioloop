<template>
  <va-select
    v-model="multiSelect"
    :label="props.label"
    :placeholder="props.placeholder"
    :options="props.options"
    multiple
    autocomplete
    highlight-matched-text
  >
    <template #content="{ value }">
      <va-chip
        v-for="(chip, idx) in value"
        :key="idx"
        class="mr-1"
        size="small"
        closeable
        @update:modelValue="deselect(idx)"
      >
        {{ chip }}
      </va-chip>
    </template>
  </va-select>
</template>

<script setup>
const props = defineProps({
  selected: {
    type: Array,
    default: () => [],
  },
  label: String,
  placeholder: String,
  options: {
    type: Array,
    default: () => [],
  },
});
const emit = defineEmits(["update:selected"]);

const multiSelect = ref(props.selected);

watch(multiSelect, () => {
  emit("update:selected", multiSelect.value);
});

function deselect(idx) {
  const sel = multiSelect.value;
  multiSelect.value = sel.slice(0, idx).concat(sel.slice(idx + 1));
}
</script>
