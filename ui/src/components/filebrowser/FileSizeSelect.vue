<template>
  <div class="flex gap-2">
    <va-input
      :label="props.label"
      v-model="size"
      inputmode="numeric"
      class="col-span-2"
      :disabled="props.disabled"
    />
    <va-select
      v-model="units"
      :options="fileSizeOptions"
      class="w-32 mt-auto"
      :disabled="props.disabled"
    />
  </div>
</template>

<script setup>
import {
  decodeFileSize,
  encodeFileSize,
  FILE_SIZE_UNITS,
} from "./fileBrowserUtils";

const props = defineProps({
  label: {
    type: String,
    default: "Size",
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  modelValue: {
    type: Number,
    default: 0,
  },
});
const emit = defineEmits(["update:modelValue"]);

const fileSizeOptions = FILE_SIZE_UNITS;
const size = ref(null);
const units = ref(fileSizeOptions[0]);

function encodeBytes(bytes) {
  const encoded = encodeFileSize(bytes);
  size.value = encoded.size;
  units.value = encoded.units;
}

onMounted(() => {
  encodeBytes(props.modelValue);
});

watch([size, units], () => {
  emit("update:modelValue", decodeFileSize(size.value, units.value));
});
</script>
