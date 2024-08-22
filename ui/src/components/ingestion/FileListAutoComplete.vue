<template>
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
    <va-select
      v-model="_searchText"
      v-model:search="autoCompleteSearchValue"
      class="col-span-1"
      label="Sigle select"
      placeholder="Start to write..."
      :options="props.options"
      autocomplete
      highlight-matched-text
      :messages="`Search value: ${autoCompleteSearchValue}`"
      track-by="path"
      value-by="path"
      text-by="path"
    />
  </div>
</template>

<script setup>
const props = defineProps({
  options: {
    type: Array,
    default: () => [],
  },
  searchText: {
    type: String,
    default: "",
  },
});
const { propsSearchText } = toRefs(props);

const emit = defineEmits(["update:searchText"]);

const _searchText = computed({
  get: () => {
    console.log("computed getter: props.searchText", props.searchText);
    return props.searchText;
  },
  set: (value) => {
    console.log("emitting update:searchText value: ", value);
    emit("update:searchText", value);
    // autoCompleteSearchValue.value = value;
  },
});
// const

const autoCompleteSearchValue = ref("");
// const searchText = ref("");

onMounted(() => {
  // console.log("options on mount");
  // console.dir(props.options);
  console.log("searchText on mount", _searchText.value);
});

watch(propsSearchText, (newValue) => {
  console.log("prop searchText on change", newValue);
  // autoCompleteSearchValue.value = newValue;
});
</script>
