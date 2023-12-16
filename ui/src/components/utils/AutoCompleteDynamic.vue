<template>
  <va-select
    v-model="selectedOption"
    @update:model-value="handleSelect"
    class="w-full autocomplete-select"
    clearable
    :placeholder="props.placeholder"
    autocomplete
    :options="optionsContent"
    :track-by="props.trackBy"
    :text-by="props.textBy"
    @update-search="updateSearch"
    :loading="props.loading"
    :highlight-matched-text="false"
    :no-options-text="statusText"
  >
    <template #option="{ option, selectOption }">
      <div class="va-select-option" role="option" @click="selectOption(option)">
        <slot name="filtered" :item="option" />
      </div>
    </template>
  </va-select>
</template>

<script setup>
const props = defineProps({
  async: {
    type: Boolean,
    default: () => false,
  },
  data: {
    type: Array,
    default: () => [],
  },
  loading: {
    type: Boolean,
    default: () => false,
  },
  placeholder: {
    type: String,
    default: "Type here",
  },
  textBy: {
    type: [String, Function],
    default: () => "name",
  },
  trackBy: {
    type: [String, Function],
    default: () => "id",
  },
  filterBy: {
    type: String,
    default: "value",
  },
  filterFn: {
    type: Function,
    default: null,
  },
  displayBy: {
    type: String,
    default: "name",
  },
});

const emit = defineEmits(["select", "update-search"]);

const selectedOption = ref({});
const searchText = ref("");

const _loading = toRef(() => props.loading);
const optionsContent = computed(() => {
  // Vuestic does not have a way of conditionally hiding the dropdown options (which might
  // be desired while results are being retrieved). It also does not provide a <slot> for
  // displaying status messages like 'Loading'. As a workaround, while results are being
  // retrieved, this component sets the `options` prop provided to <va-select /> to [],
  // which causes <va-select /> to render the `noOptionsText` prop instead of the results.
  // Additionally, `noOptionsText` is set to 'Loading' during this time, and updated again
  // later once results have been retrieved.
  return props.async ? (_loading.value ? [] : props.data) : getFilteredData();
});
const statusText = computed(() => {
  return _loading.value
    ? "Loading..."
    : optionsContent.value.length === 0
      ? "Items not found"
      : "";
});

const handleSelect = (item) => {
  emit("select", item);
  resetAutoComplete();
};

const resetAutoComplete = () => {
  selectedOption.value = {};
  searchText.value = "";
};

const updateSearch = (updatedSearchText) => {
  searchText.value = updatedSearchText;
};

const getFilteredData = () => {
  if (!searchText.value) return props.data;

  const filterFn =
    props.filterFn instanceof Function
      ? props.filterFn(searchText.value)
      : (item) => {
          return (item[props.filterBy] || "")
            .toLowerCase()
            .includes(searchText.value.toLowerCase());
        };

  return (props.data || []).filter(filterFn);
};

watch(searchText, () => {
  emit("update-search", searchText.value);
});
</script>

<style scoped>
.va-select-option:hover {
  background-color: rgba(52, 114, 240, 0.2);
}
</style>
