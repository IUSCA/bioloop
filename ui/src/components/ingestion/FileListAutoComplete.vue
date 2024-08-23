<template>
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
    <!--      @update:search="emit('update:search', $event)"-->
    <va-select
      v-model="selected"
      v-model:search="autoCompleteSearchValue"
      label="File select"
      placeholder="Start to write..."
      :options="props.options"
      autocomplete
      highlight-matched-text
      :messages="`Search text: ${autoCompleteSearchValue}`"
      track-by="path"
      text-by="path"
    />
    <!--      value-by="path"-->
  </div>
</template>

<script setup>
const props = defineProps({
  options: {
    type: Array,
    default: () => [],
  },
  modelValue: {
    type: Object,
  },
  search: {
    type: String,
    default: "",
  },
});

// const search = defineModel("search");

const propsSearchText = toRef(props, "search");
//
const emit = defineEmits(["update:modelValue", "update:search"]);
//
const selected = computed({
  get: () => {
    console.log("computed getter: props.modelValue", props.modelValue);
    return props.modelValue;
  },
  set: (value) => {
    console.log("emitting update:modelValue, new value: ", value);
    emit("update:modelValue", value);
    // autoCompleteSearchValue.value = value;
  },
});
// // const

const autoCompleteSearchValue = computed({
  get: () => {
    console.log("computed getter: props.search:", props.search);
    return props.search;
  },
  set: (value) => {
    console.log("emitting update:search value: ", value);
    emit("update:search", value);
  },
});
// const search = ref("");

onMounted(() => {
  // console.log("options on mount");
  // console.dir(props.options);
  console.log("search on mount", propsSearchText.value);
});

watch(propsSearchText, (newValue) => {
  console.log("prop search on change", newValue);
  // autoCompleteSearchValue.value = newValue;
});
</script>
