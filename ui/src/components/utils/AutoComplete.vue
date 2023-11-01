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
          :name="props.name"
          outline
          clearable
          type="text"
          :placeholder="props.placeholder"
          v-model="input"
          class="w-full autocomplete-input"
          @click="openResults"
          @clear="emit_event('clear')"
          @input="emit_event('input')"
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
  // modelValue: { type: String },
  selectedOption: { type: Object },
  name: { type: String },
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

const _model_value = toRef(() => props.modelValue);

const emit = defineEmits([
  "select",
  "createNewElement",
  "clear",
  "input",
  // "change",
  "update:modelValue",
]);

// TODO: see below
// ensure client always maintains copy of the entire selected object
// uniquely identify selected object within AutoComplete
// try to not use a separate property for v-model, besides `input`
// handle onBlur
// select a value, then try typing something else. searchResults aren't filtered by updated input.

// Provided as v-model to the AutoComplete's <input>. This reactive property allows the
// AutoComplete's rendered value (which can be set by an option being selected, or by typing
// into the <input>) to be synced both ways between the client and this component.
const input = computed({
  get() {
    debugger;
    // if (typeof _model_value.value === "string") {
    //   return _model_value.value;
    // } else if (typeof _model_value.value === "object") {
    return props.selectedOption
      ? props.formatSelectedOption(props.selectedOption)
      : "";
    // } else {
    //   return "";
    // }
  },
  // Setter is needed for the <input> to be writable.
  set(newValue) {
    debugger;
    // when <input> is typed into, emit update event to allow the client to react to the update.
    // debugger;
    // emit("update:modelValue", newValue);
  },
});
// Used to track the selected option when it is an object, and tracking the text-representation
// of the selected option through `input` is not enough to uniquely identify it.
const _selected_option = ref(props.selectedOption);
// const _selected_option = computed({
//   get() {
//     return props.selectedOption;
//   },
//   // set(newVal) {},
// });

const visible = ref(false);

// when clicked outside, hide the results ul
// when clicked on input show the results ul
// when clicked on a search result, clear text and hide the results ul

const search_results = computed(() => {
  debugger;
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

const updateSelection = (item) => {
  debugger;
  // set selected option object
  _selected_option.value = item;
  // write selected option's text-representation to the v-model
  input.value = props.formatSelectedOption(item);
  // emit event to allow client to respond to the update
  emit("select", item);
};

function handleSelect(item) {
  updateSelection(item);
  closeResults();
}

const emit_event = (event) => {
  // debugger;
  emit(event);
};

function closeResults() {
  visible.value = false;
}

function openResults() {
  visible.value = true;
}

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
</script>

<style lang="scss">
.autocomplete-input {
  /* Clear icon is too big and its font size is set by element style tag in the vuestic library */
  .va-input-wrapper__field i.va-icon {
    font-size: 24px !important;
  }
}
</style>
