<template>
  <!--    @update:search-text="searchFiles"-->
  <AutoComplete
    v-model:search-text="searchText"
    :placeholder="`Search directories in ${basePath}`"
    :data="props.options"
    :async="true"
    :display-by="'path'"
    @clear="emit('clear')"
    @select="
      (file) => {
        console.log('@select: selected file:', file);
        onFileSelect(file);
      }
    "
    :disabled="disabled"
    :label="'Dataset Path'"
    :error="props.error"
    @open="emit('open')"
    @close="emit('close')"
  >
    <va-badge
      v-if="props.basePath"
      class="base-path-badge"
      :text="basePath"
      color="secondary"
    >
    </va-badge>
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
});

const emit = defineEmits([
  // "select",
  "update:selected",
  "update:searchText",
  "filesRetrieved",
  "loading",
  "loaded",
  "clear",
  "open",
  "close",
]);

const searchText = computed({
  get: () => {
    console.log("getting searchText,", props.searchText);
    return props.searchText;
  },
  set: (value) => {
    // searchText.value = value;
    // const _searchText = +value.path;

    emit("update:searchText", value);
  },
});

const fileList = ref([]);
const loading = ref(false);
const basePath = computed(() => {
  return props.basePath.endsWith("/") ? props.basePath : props.basePath + "/";
});

const onFileSelect = (file) => {
  console.log("onFileSelect:", file);
  console.dir(file, { depth: null });
  emit(
    "update:searchText",
    file.path.slice(file.path.indexOf(basePath.value) + basePath.value.length),
  );
  console.log(
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
