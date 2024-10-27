<template>
  <div class="flex">
    <va-input
      type="text"
      readonly
      :v-model="text"
      class="flex-auto"
      :error="true"
      :error-messages="['props.errorMessages']"
    >
      <template #appendInner>
        <CopyButton :text="text" preset="plain" />
      </template>
    </va-input>
  </div>

  <div>CopyText props.text : {{ props.text }}</div>
  <div>text : {{ text }}</div>
  <div>error : {{ `${props.error}` }}</div>
  <div>errorMessages : {{ props.errorMessages }}</div>
</template>

<script setup>
const props = defineProps(
  {
    text: String,
  },
  {
    error: {
      type: { Boolean, default: false },
    },
    errorMessages: {
      type: Array,
      default: () => [],
    },
  },
);

const emit = defineEmits(["update:text"]);

const text = computed({
  get() {
    return props.text;
  },
  set(value) {
    emit("update:text", value);
  },
});

onMounted(() => {
  console.log("CopyText onMonted");
  console.log("props.errorMessages");
  console.log(props.errorMessages);
  console.log("props.error");
  console.log(props.error);
});

watch([() => props.errorMessages, () => props.error], (newVals, oldVals) => {
  console.log("    () => props.errorMessages,\n" + "    () => props.error,\n");
  console.log("oldVals");
  console.log(oldVals[0], oldVals[1]);
  console.log("newVals");
  console.log(newVals[0], newVals[1]);
});
</script>
