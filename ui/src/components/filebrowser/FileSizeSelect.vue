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
      class="h-[42px] w-32"
      :disabled="props.disabled"
    />
  </div>
</template>

<script setup>
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

const fileSizeOptions = [
  "Bytes",
  "KB",
  "MB",
  "GB",
  "TB",
  "PB",
  // "EB",
  // "ZB",
  // "YB",
];
const k = 1024;
const size = ref(null);
const units = ref(fileSizeOptions[0]);

function encodeBytes(bytes) {
  // 1024 -> (1, "KB")
  if (bytes === 0) {
    size.value = 0;
    units.value = fileSizeOptions[0];
  } else {
    const dm = 2;
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    size.value = parseFloat((bytes / Math.pow(k, i)).toFixed(dm));
    units.value = fileSizeOptions[i];
  }
}

watch(
  () => props.modelValue,
  () => {
    if (props.modelValue === null || props.modelValue === undefined)
      encodeBytes(0);
    else if (!isFinite(props.modelValue))
      encodeBytes(Math.pow(k, fileSizeOptions.length - 1));
    else encodeBytes(props.modelValue);
  },
  { immediate: true },
);

watch([size, units], () => {
  if (size.value) {
    const sizeNumeric = parseInt(size.value);
    const unitPower = fileSizeOptions.indexOf(units.value);
    emit("update:modelValue", sizeNumeric * Math.pow(k, unitPower));
  } else {
    emit("update:modelValue", 0);
  }
});
</script>
