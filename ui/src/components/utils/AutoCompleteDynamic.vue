<template>
  <va-form>
    <va-select
      v-model="selectedOption"
      @update:model-value="handleSelect"
      class="w-full autocomplete-select"
      clearable
      :placeholder="props.placeholder"
      autocomplete
      :options="props.async ? props.data : filteredData"
      :track-by="props.trackBy"
      @update-search="updateSearch"
    >
      <template #option="{ option, selectOption }">
        <div
          class="va-select-option"
          role="option"
          @click="selectOption(option)"
        >
          <slot name="filtered" :item="option" />
        </div>
      </template>
    </va-select>
  </va-form>
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
  placeholder: {
    type: String,
    default: "Type here",
  },
  textBy: {
    type: [String, Function],
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

const handleSelect = (item) => {
  emit("select", item);
  resetAutoComplete();
};

const resetAutoComplete = () => {
  selectedOption.value = {};
  searchText.value = "";
};

watch(searchText, () => {
  if (props.async) {
    emit("update-search", searchText.value);
  }
});

const updateSearch = (updatedSearchText) => {
  searchText.value = updatedSearchText;
};

const filteredData = computed(() => {
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
});
</script>

<style scoped>
.va-select-option:hover {
  background-color: rgba(52, 114, 240, 0.2);
}
</style>
