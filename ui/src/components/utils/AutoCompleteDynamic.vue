<template>
  <va-form>
    <va-select
      v-model="selectedOption"
      class="w-full"
      clearable
      :placeholder="props.placeholder"
      autocomplete
      :options="props.data"
      :text-by="props.textBy"
      :track-by="props.trackBy"
    >
      <template #option="{ option, selectOption }">
        <va-button @click="selectOption(option)">
          <div class="flex flex-row">
            <div>{{ option.name }}</div>
            <div>{{ option.type }}</div>
            <div>{{ formatBytes(option.size) }}</div>
          </div>
        </va-button>
      </template>
    </va-select></va-form
  >
</template>

<script setup>
import { formatBytes } from "../../services/utils";

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

// const search = ref("");
const selectedOption = ref({});
</script>

<style scoped></style>
