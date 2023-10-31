<!-- Adapted from and improved upon https://stevencotterill.com/articles/how-to-build-an-autocomplete-field-with-vue-3 -->
<template>
  <div class="relative">
    <OnClickOutside @trigger="closeResults">
      <va-form>
        <!--        <span>Model value prop: {{ props.modelValue }}</span>-->
        <!--        <br />-->
        <!--        <span>Test prop: {{ props.testProp }}</span>-->
        <!--        <br />-->
        <!--          v-model="text"-->
        <!--        <va-input placeholder="model val" :value="props.modelValue"></va-input>-->
        <!--        <va-input placeholder="test prop" :value="test_prop_ref"></va-input>-->
        <!--        <va-input-->
        <!--          placeholder="model val"-->
        <!--          v-model="model_value_prop_ref_computed"-->
        <!--        ></va-input>-->
        <!--        <va-input placeholder="test prop" v-model="test_prop_ref"></va-input>-->

        <va-input
          outline
          clearable
          type="text"
          :placeholder="props.placeholder"
          v-model="auto_complete_val"
          class="w-full autocomplete-input"
          @click="openResults"
          @clear="emit_event('clear')"
          @input="emit_event('input')"
          @blur="handle_blur"
          :rules="props.rules"
        />
      </va-form>

      <ul
        v-if="visible"
        class="absolute w-full bg-white dark:bg-gray-900 border border-solid border-slate-200 dark:border-slate-800 shadow-lg rounded rounded-t-none p-2 z-10 max-h-56 overflow-y-scroll overflow-x-hidden"
      >
        <li
          class="pb-2 text-sm border-solid border-b border-slate-200 dark:border-slate-800 text-right va-text-secondary"
          v-if="search_results.length"
        >
          Showing {{ search_results.length }} of {{ data.length }} results
        </li>
        <li
          v-for="(item, idx) in search_results"
          :key="idx"
          class="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 p-2 rounded"
          @click="handleSelect(item)"
        >
          <slot name="filtered" :item="item">
            {{ item[props.displayBy] }}
          </slot>
        </li>
        <li
          v-if="search_results.length === 0 && input !== ''"
          class="py-2 px-3"
        >
          <span
            class="flex gap-2 items-center justify-center va-text-secondary"
          >
            <i-mdi:magnify-remove-outline class="flex-none text-xl" />
            <span class="flex-none">None matched</span>
          </span>
        </li>
        <li
          class="cursor-pointer py-2 px-3 border-solid border-t border-slate-200 dark:border-slate-800 va-text-secondary"
          v-if="props.showAddNewButton"
          @click="emit('createNewElement')"
        >
          {{ props.addNewButtonText }}
          <va-icon name="add_circle_outline" class="ml-1"></va-icon>
        </li>
      </ul>
    </OnClickOutside>
  </div>
</template>

<script setup>
import { OnClickOutside } from "@vueuse/components";

const props = defineProps({
  // testProp: { type: String },
  modelValue: { type: String },
  placeholder: {
    type: String,
    default: "Type here",
  },
  data: {
    type: Array,
    default: () => [],
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
  rules: {
    type: Array,
  },
  showSelectedOption: {
    type: Boolean,
    default: () => false,
  },
  formatSelectedOption: {
    type: Function,
    default: (option) => option,
  },
  areOptionsEqual: {
    type: Function,
    default: (option1, option2) => option1 === option2,
  },
  getOptionValue: {
    type: Function,
    default: (option) => option,
  },
  showAddNewButton: {
    type: Boolean,
    default: () => false,
  },
  addNewButtonText: { type: String, default: () => "Add New" },
});

// const test_prop_ref = toRef(() => props.testProp);
// const test_prop_ref_computed = computed(() => test_prop_ref.value, {
//   onTrack(e) {
//     // triggered when count.value is tracked as a dependency
//     // debugger;
//   },
//   onTrigger(e) {
//     // triggered when count.value is mutated
//     // debugger;
//   },
// });

const _model_value = toRef(() => props.modelValue, {
  onTrack(e) {
    // triggered when count.value is tracked as a dependency
    // debugger;
  },
  onTrigger(e) {
    // triggered when count.value is mutated
    // debugger;
  },
});
// const model_value_prop_ref_computed = computed(
//   () => _model_value.value,
//   {
//     onTrack(e) {
//       // triggered when count.value is tracked as a dependency
//       // debugger;
//     },
//     onTrigger(e) {
//       // triggered when count.value is mutated
//       // debugger;
//     },
//   },
// );

const emit = defineEmits([
  "select",
  "createNewElement",
  "clear",
  "input",
  "change",
  "update",
]);

const emit_event = (event) => {
  // debugger;
  emit(event);
};

const handle_blur = () => {
  // debugger;

  // If AutoComplete is open, and an invalid value (i.e. one not present in the list of options)
  // is typed, clear AutoComplete's value upon blur
  // debugger;
  // if (input.value === "") {
  //   //   // close AutoComplete
  //   //   closeResults();
  //   debugger;
  //   // return;
  // } else {
  if (
    input.value &&
    (props.data.filter((e) => props.getOptionValue(e) === input.value) || [])
      .length === 0
  ) {
    // debugger;
    // // clear selected value
    // updateSelection("");

    // input.value = "";
    // selection.value = undefined;

    emit("clear");
  }
  // }
  // // close AutoComplete
  // closeResults();

  // emit("blur");
};

// User's text input. Also stores the currently selected value.
const input = ref("");
// If selected value has other attributes besides text, it is tracked as the `selection` reactive
// object
const selection = ref();

// Provided as v-model to the AutoComplete's <input>. Getter returns modelValue if modelValue is
// provided (indicating that the value is being set externally), and user-typed input otherwise.
// Setter is needed for the <input> to be writable.
const auto_complete_val = computed(
  {
    get() {
      let ret =
        _model_value.value && _model_value.value
          ? props.formatSelectedOption(_model_value.value)
          : input.value;
      // debugger;

      return ret;
    },
    set(newValue) {
      input.value = newValue;
    },
  },
  {
    onTrack(e) {
      // triggered when count.value is tracked as a dependency
      // debugger;
    },
    onTrigger(e) {
      // triggered when count.value is mutated
      // debugger;
    },
  },
);

const visible = ref(false);

// when clicked outside, hide the results ul
// when clicked on input show the results ul
// when clicked on a search result, clear text and hide the results ul

const search_results = computed(() => {
  if (input.value === "") return props.data;

  const filterFn =
    props.filterFn instanceof Function
      ? props.filterFn(input.value)
      : (item) =>
          (item[props.filterBy] || "")
            .toLowerCase()
            .includes(input.value.toLowerCase());

  return (props.data || []).filter(filterFn);
});

function closeResults() {
  visible.value = false;
}

function openResults() {
  visible.value = true;
}

const updateSelection = (item) => {
  // debugger;
  // allows AutoComplete value to be updated based on option selected by user
  input.value =
    props.showSelectedOption && item ? props.formatSelectedOption(item) : "";
  // track the entire `item` object as well, in case it has other attributes that may need to be
  // tracked
  selection.value = item || undefined;

  // emit event to indicate that selected option has changed
  emit_event("change");
};

function handleSelect(item) {
  // debugger;
  updateSelection(item);
  closeResults();
  emit("select", item);
}

// If client is attempting to set the value of AutoComplete externally, treat it as an option
// being selected.
watch(_model_value, () => {
  // debugger;
  if (_model_value.value) {
    updateSelection(_model_value.value);
  }
});
</script>

<style lang="scss">
.autocomplete-input {
  /* Clear icon is too big and its font size is set by element style tag in the vuestic library */
  .va-input-wrapper__field i.va-icon {
    font-size: 24px !important;
  }
}
</style>
