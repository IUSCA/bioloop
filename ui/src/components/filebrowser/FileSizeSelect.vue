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
  // "PB",
  // "EB",
  // "ZB",
  // "YB",
];
const k = 1024;
const size = ref(null);
const units = ref(fileSizeOptions[0]);

function encodeBytes(bytes) {
  // console.log("encodeBytes", bytes);
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

onMounted(() => {
  // console.log("FileSizeSelect mounted", props.modelValue);
  if (props.modelValue === null || props.modelValue === undefined)
    encodeBytes(0);
  else if (!isFinite(props.modelValue))
    // if modelValue is infinity, set size to 1023 and units to the largest unit
    encodeBytes(1023 * Math.pow(k, fileSizeOptions.length - 1));
  else encodeBytes(props.modelValue);
});

watch([size, units], () => {
  if (size.value) {
    const sizeNumeric = parseInt(size.value);
    const unitPower = fileSizeOptions.indexOf(units.value);

    // size >= 1023 and unit is the largest unit, return Infinity
    if (sizeNumeric >= 1023 && unitPower === fileSizeOptions.length - 1) {
      emit("update:modelValue", Infinity);
      return;
    }

    emit("update:modelValue", sizeNumeric * Math.pow(k, unitPower));
  } else {
    emit("update:modelValue", 0);
  }
});
</script>
