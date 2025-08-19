<template>
  <!-- eslint-disable-next-line vuejs-accessibility/label-has-for -->
  <label class="flex items-center gap-3 argument">
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
    <va-select
      v-if="props.argument.allowed_values.length > 0"
      v-model="model"
      :options="argument.allowed_values"
      placeholder="Select a value"
      searchable
      :highlight-matched-text="false"
      :id="`arg-${props.argument.id}`"
      preset="solid"
    />
    <va-checkbox
      v-else-if="is_checkbox(props.argument)"
      v-model="model"
      :id="`arg-${props.argument.id}`"
    />
    <va-input
      v-else-if="
        props.argument.value_type === 'STRING' ||
        props.argument.value_type === 'NUMBER'
      "
      v-model="model"
      :id="`arg-${props.argument.id}`"
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
  </label>
</template>

<script setup>
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
const model = defineModel();

const props = defineProps({
  argument: {
    type: Object,
    required: true,
  },
});

onMounted(() => {
  if (props.argument.default_value != null)
    model.value = props.argument.default_value;
});

function is_required_argument(arg) {
  return arg.is_required || arg.position != null;
}

function is_checkbox(argument) {
  return argument.is_flag || argument.value_type === "BOOLEAN";
}

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
