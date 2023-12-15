<template>
  <va-form>
    <va-select
      v-model="selectedOption"
      @update:model-value="handleSelect"
      class="w-full autocomplete"
      clearable
      :placeholder="props.placeholder"
      autocomplete
      :options="props.async ? props.data : filteredData"
      :track-by="props.trackBy"
      @update-search="updateSearch"
    >
      <template #option="{ option, selectOption }">
        <div
          class="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 p-2 rounded"
          @click="selectOption(option)"
        >
          <slot name="filtered" :item="option"> </slot>
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

// onMounted(() => {
//   console.log(`onMounted: searchText: ${searchText.value}`);
// });

// watch(
//   searchText,
//   () => {
//     console.log(`watch: searchText: ${searchText.value}`);
//   },
//   {
//     onTrack(e) {
//       console.log(e);
//     },
//     onTrigger(e) {
//       console.log(e);
//     },
//   },
// );

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

<style lang="scss">
.autocomplete {
  // todo - does not work
  //--va-select-dropdown-background: #ff13;
}
</style>
