<template>
  <AutoComplete
    v-model:search-text="searchText"
    :placeholder="`Search directories in ${basePath}`"
    :data="props.options"
    :async="true"
    :display-by="'path'"
    @clear="emit('clear')"
    @select="
      (file) => {
        onFileSelect(file);
      }
    "
    :disabled="disabled"
    :label="'Dataset Path'"
    :loading="props.loading"
    @open="emit('open')"
    @close="emit('close')"
  >
    <template #prependInner>
      <va-badge
        v-if="props.basePath"
        class="base-path-badge"
        :text="basePath"
        color="secondary"
      />
    </template>

    <template #appendInner>
      <va-icon
        v-if="props.validating"
        name="loop"
        spin="clockwise"
        color="primary"
      />
    </template>
  </AutoComplete>
</template>

<script setup>
const props = defineProps({
  disabled: { type: Boolean, default: false },
  basePath: { type: String },
  selected: { type: [String, Object] },
  searchText: { type: String, default: "" },
  options: { type: Array, default: () => [] },
  error: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  validating: { type: Boolean, default: false },
});

const emit = defineEmits([
  "update:selected",
  "update:searchText",
  "clear",
  "open",
  "close",
]);

const searchText = computed({
  get: () => {
    return props.searchText;
  },
  set: (value) => {
    emit("update:searchText", value);
  },
});

const basePath = computed(() => {
  return props.basePath
    ? props.basePath.endsWith("/")
      ? props.basePath
      : props.basePath + "/"
    : "";
});

const onFileSelect = (file) => {
  emit(
    "update:searchText",
    file.path.slice(file.path.indexOf(basePath.value) + basePath.value.length),
  );
  emit("update:selected", file);
};
</script>

<style lang="scss" scoped>
.base-path-badge {
  --va-badge-font-size: 0.8em;
  --va-badge-line-height: 1.8;
}
</style>
