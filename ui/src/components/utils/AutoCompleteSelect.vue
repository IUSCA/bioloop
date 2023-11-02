<template>
  <va-select
    :class="props.class"
    v-model="selectedOption"
    :label="props.label"
    :placeholder="props.placeholder"
    :options="props.options"
    :text-by="props.textBy"
    :track-by="props.trackBy"
    :rules="props.rules"
    autocomplete
  >
    <template v-if="props.allowCreate" #append>
      <va-popover :message="props.allowCreateText">
        <va-button preset="plain" @click="emit('createNew')">
          <va-icon size="2rem" name="add_box" />
        </va-button>
      </va-popover>
    </template>
  </va-select>
</template>

<script setup>
const props = defineProps({
  class: {
    type: String,
  },
  selected: {
    type: Object,
  },
  label: String,
  placeholder: String,
  options: {
    type: Array,
    default: () => [],
  },
  textBy: {
    type: Function,
    default: (option) => option,
  },
  trackBy: {
    type: Function,
    default: (option) => option,
  },
  rules: {
    type: Array,
  },
  allowCreate: {
    type: Boolean,
    default: () => false,
  },
  allowCreateText: {
    type: String,
    default: () => "Create New",
  },
});
const emit = defineEmits(["update:selected", "createNew", "clear"]);

const selectedOption = ref();
</script>
