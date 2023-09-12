<template>
  <div class="collapsible-container rounded shadow">
    <div
      class="collapsible-header bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 rounded"
      @click="toggleCollapsible"
    >
      <div class="flex-grow">
        <slot name="header-content"></slot>
      </div>

      <Icon
        :icon="isCollapsed ? 'mdi-chevron-up' : 'mdi-chevron-down'"
        class="text-xl collapse_icon flex-none"
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
  },
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
  padding: 5px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
}

.collapse_icon {
  margin-left: 5px;
  transition: transform 0.3s ease-in-out;
}
</style>
