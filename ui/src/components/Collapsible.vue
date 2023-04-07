<template>
  <div class="collapsible-container rounded shadow bg-slate-100 m-2">
    <div
      class="collapsible-header bg-slate-100 hover:bg-slate-300"
      @click="toggleCollapsible"
    >
      <slot name="header-content"></slot>
      <Icon
        :icon="isCollapsed ? 'mdi-chevron-up' : 'mdi-chevron-down'"
        class="text-xl collapse_icon"
      />
    </div>
    <div v-if="isCollapsed" class="collapsible-body">
      <slot></slot>
    </div>
  </div>
</template>

<script setup>
import { ref } from "vue";

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false,
  },
});
const emit = defineEmits(["update:modelValue"]);

const isCollapsed = ref(props.modelValue);

watch(
  () => props.modelValue,
  (newValue) => {
    isCollapsed.value = newValue;
  }
);

function toggleCollapsible() {
  isCollapsed.value = !isCollapsed.value;
  emit("update:modelValue", isCollapsed.value);
}
</script>

<style scoped>
.collapsible-container {
  /* border: 1px solid #ccc; */
  /* border-radius: 4px; */
  /* margin: 10px; */
  /* overflow: hidden; */
  transition: height 1s ease-in-out;
}

.collapsible-header {
  /* background-color: #f2f2f2; */
  padding: 10px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
}

.collapsible-header:hover {
  /* background-color: #e5e5e5; */
}

.collapsible-body {
  /* padding: 10px; */
}

.collapse_icon {
  margin-left: 5px;
  transition: transform 0.3s ease-in-out;
}
</style>
