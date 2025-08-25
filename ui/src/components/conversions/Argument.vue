<template>
  <!-- eslint-disable-next-line vuejs-accessibility/label-has-for -->
  <label class="flex items-center gap-3 argument">
    <!-- Argument Name and description -->
    <div class="flex flex-col w-[200px]">
      <span class="font-semibold">
        {{ props.argument.name }}
        <span v-if="is_required_argument(props.argument)" class="text-red-500">
          *
        </span>
      </span>
      <span class="text-sm text-gray-500 mt-[-3px] truncate">
        {{ props.argument.description }}
      </span>
    </div>

    <div class="flex-1">
      <!-- Selectable (from among multiple options) argument -->
      <div v-if="props.argument.allowed_values.length > 0" class="flex items-center gap-3">
        <!-- Checkbox to enable/disable the argument's dropdown -->
        <va-checkbox
          v-model="isSelectableArgumentEnabled"
          @update:modelValue="handleArgumentSelectionCheckboxChange"
        />
        
        <!-- Dropdown (disabled when checkbox is unchecked) -->
        <va-select
          v-model="model"
          :options="getArgumentAllowedValues(props.argument)"
          placeholder="Select a value"
          searchable
          :highlight-matched-text="false"
          preset="solid"
          :disabled="!isSelectableArgumentEnabled"
        />
      </div>

      <!-- Boolean argument (flags) -->
      <va-checkbox
        v-else-if="is_checkbox(props.argument)"
        v-model="model"
      />

      <!-- String or number argument -->
      <va-input
        v-else-if="
          (props.argument.value_type === 'STRING' || props.argument.value_type === 'NUMBER')
          && !is_textarea(props.argument)
        "
        v-model="model"
        preset="bordered"
        :disabled="props.argument.dynamic_variable_name != null"
      >
        <template
          #prependInner
          v-if="props.argument.dynamic_variable_name != null"
        >
          <i-mdi-function />
        </template>
      </va-input>

             <!-- Textarea for long text fields -->
      <va-textarea      
        v-else-if="is_textarea(props.argument)"
        v-model="model"
        preset="bordered"
        :min-rows="3"
        :max-rows="8"
        :placeholder="props.argument.description"
        class="w-full"
      />

      <!-- Dynamic variable -->
      <va-popover
        v-if="props.argument.dynamic_variable_name != null"
        placement="right"
      >
        <template #title>
          <i>Dynamic Variable</i>
        </template>
        <template #body>
          <p class="max-w-48">
            The value will be determined at runtime based on the dataset
            properties.
          </p>
        </template>
        <i-mdi-information-outline class="text-blue-500" />
      </va-popover>
    </div>
  </label>
</template>

<script setup>
// value_type: STRING, NUMBER, BOOLEAN
// if allowed_values is not empty, then it is a select
// if is_flag is true, then it is a checkbox
// if value_type is STRING, then it is a text input
// if value_type is NUMBER, then it is a number input
// if value_type is BOOLEAN, then it is a checkbox
// function getArgComponent(argument) {
//   if (argument.allowed_values.length > 0) {
//     return "VaSelect";
//   } else if (argument.is_flag || argument.value_type === "BOOLEAN") {
//     return "VaCheckbox";
//   } else if (argument.value_type === "STRING") {
//     return "VaInput";
//   } else if (argument.value_type === "NUMBER") {
//     return "VaInput";
//   }
// }

// populate the default value
// show error if is_required is true and the value is empty

/**
 * Example argument:
 * {
					"id": 1,
					"name": "Path to config file",
					"value_type": "STRING",
					"allowed_values": [],
					"is_required": false,
					"default_value": "config_TAMS_test.sh",
					"is_array": false,
					"is_flag": false,
					"description": "Path to config file",
					"min_value": null,
					"max_value": null,
					"min_length": null,
					"max_length": null,
					"position": 1,
					"dynamic_variable_name": null,
					"program_id": 1
				},
 */
const model = defineModel("modelValue");

const props = defineProps({
  argument: {
    type: Object,
    required: true,
  },
});

onMounted(() => {
  if (props.argument.default_value != null) {
    model.value = getArgumentTypedValue(props.argument.default_value);
  }
});

function is_required_argument(arg) {
  return arg.is_required || arg.position != null;
}

function is_checkbox(argument) {
  return argument.is_flag || argument.value_type === "BOOLEAN";
}

function is_textarea(argument) {
  return argument.value_type === "STRING" && argument.max_length != null && argument.max_length >= 200;
}

function getArgumentTypedValue(value) {
  if (props.argument.value_type === "NUMBER") {
    return Number(value);
  } else if (props.argument.value_type === "BOOLEAN") {
    return Boolean(value);
  } else {
    return value;
  }
}

function getArgumentAllowedValues(argument) {
  return argument.allowed_values.map(value => getArgumentTypedValue(value));
}

// For selectable (dropdown) arguments, track whether the argument is enabled
const isSelectableArgumentEnabled = ref(false);

function handleArgumentSelectionCheckboxChange(enabled) {
  if (!enabled) {
    // If checkbox is unchecked, clear the dropdown value
    model.value = null;
  }
}
</script>

<style scoped lang="scss">
.argument {
  --va-input-line-height: 10px;
  --va-input-font-size: 0.85rem;
}
:deep(.va-input-wrapper__field) {
  --va-input-wrapper-min-height: 28px;
}
</style>
