<template>
  <va-select
    :class="props.class"
    :model-value="props.modelValue"
    @update:model-value="emitNewModelValue"
    label="File Type"
    placeholder="Select File Type"
    :options="props.fileTypeList"
    :text-by="(option) => option.name"
    :track-by="(option) => option"
    :rules="[
      (value) => {
        return (value && value.name.length > 0) || 'File Type is required';
      },
    ]"
  >
    <template #append>
      <va-popover message="Create New File Type">
        <va-button
          class="ml-3"
          icon="add"
          color="success"
          @click="emit('createNewFileType')"
        >
          Create New File Type
        </va-button>
      </va-popover>
    </template>
  </va-select>
</template>

<script setup>
const props = defineProps({
  modelValue: {
    type: Object,
  },
  class: {
    type: String,
  },
  fileTypeList: {
    type: Array,
    default: () => [],
  },
});

const emitNewModelValue = (val) => {
  // debugger;
  emit("update:modelValue", val);
};

const emit = defineEmits(["update:modelValue", "createNewFileType"]);
</script>
