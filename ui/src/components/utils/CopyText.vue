<template>
  <div class="flex">
    <va-input type="text" readonly :model-value="text" class="flex-auto">
      <template #appendInner>
        <CopyButton :text="text" preset="plain" />
      </template>
    </va-input>
  </div>
</template>

<script setup>
const props = defineProps({
  text: {
    type: String,
  },
});

const emit = defineEmits(["update:text"]);

const text = computed({
  get() {
    return props.text;
  },
  set(value) {
    emit("update:text", value);
  },
});
</script>
