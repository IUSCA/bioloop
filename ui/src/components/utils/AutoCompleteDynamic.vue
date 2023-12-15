<template>
  <va-form>
    <va-select
      v-model="selectedOption"
      class="w-full autocomplete"
      clearable
      :placeholder="props.placeholder"
      autocomplete
      :options="props.data"
      :text-by="props.textBy"
      :track-by="props.trackBy"
      @updateSearch="updateSearch"
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
  placeholder: {
    type: String,
    default: "Type here",
  },
  data: {
    type: Array,
    default: () => [],
  },
  textBy: {
    type: [String, Function],
  },
  trackBy: {
    type: [String, Function],
  },
  // filterBy: {
  //   type: String,
  //   default: "value",
  // },
  // filterFn: {
  //   type: Function,
  //   default: null,
  // },
  // displayBy: {
  //   type: String,
  //   default: "name",
  // },
});

const emit = defineEmits(["select", "update-search"]);

const updateSearch = (updatedSearchText) => {
  debugger;
  console.log(`updatedSearchText`);
  console.log(`${updatedSearchText}`);
  emit("update-search", updatedSearchText);
};

const selectedOption = ref({});
</script>

<style lang="scss">
.autocomplete {
  // todo - does not work
  //--va-select-dropdown-background: #ff13;
}
</style>
