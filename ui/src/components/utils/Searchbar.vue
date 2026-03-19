<template>
  <va-input class="w-full" outline clearable :input-class="inputClass">
    <template #prependInner>
      <Icon icon="material-symbols:search" class="text-xl" />
    </template>

    <template #appendInner>
      <div class="w-14 text-right">
        <span
          class="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 rounded"
        >
          <span class="font-medium"> {{ shortcutLabel }} </span>
        </span>
      </div>
    </template>
  </va-input>
</template>

<script setup>
import useSearchKeyShortcut from "@/composables/useSearchKeyShortcut";
import { getCurrentInstance } from "vue";

// Generate a unique class name for the input to avoid conflicts if multiple search bars are used on the same page
// We use the component UID where possible so this is stable across SSR hydration.
const { uid } = getCurrentInstance() || {};
const inputClass = `search-input-${uid ?? Math.random().toString(36).slice(2, 10)}`;

// const props = defineProps({});

// useSearchKeyShortcut();

const isMac = () => {
  // Modern API (Chrome 90+, Edge 90+) — async but reliable
  if (navigator.userAgentData) {
    return navigator.userAgentData.platform === "macOS";
  }
  // Legacy fallback — covers Safari, Firefox
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform);
};

const shortcutLabel = computed(() => {
  const modifier = isMac() ? "⌘" : "Ctrl";
  return `${modifier} + K`;
});

onMounted(() => {
  if (isMac()) {
    console.log("detected Mac platform, using Meta key for shortcut");
    useSearchKeyShortcut({
      triggerKey: "k",
      targetElementClass: inputClass,
      metaKey: true,
    });
  } else {
    useSearchKeyShortcut({
      triggerKey: "k",
      targetElementClass: inputClass,
      ctrlKey: true,
    });
  }

  // auto focus the search input when the component is mounted
  const targetElement = document.getElementsByClassName(inputClass)[0];
  if (targetElement) {
    targetElement.focus();
  }
});
</script>
