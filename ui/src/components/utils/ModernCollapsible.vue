<template>
  <div
    class="rounded-lg border border-solid border-gray-200 dark:border-gray-700 bg-gray-100/50 dark:bg-gray-900/30 shadow-sm overflow-hidden"
  >
    <button
      type="button"
      class="w-full flex items-center justify-between gap-3 text-left cursor-pointer select-none bg-transparent hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors duration-200"
      :aria-expanded="isExpanded"
      @click="toggleExpanded"
    >
      <div class="min-w-0 flex-1">
        <slot name="header" />
      </div>

      <div class="mr-3">
        <i-mdi-chevron-down
          class="text-base text-gray-500 dark:text-gray-400 transform transition-transform duration-200"
          :class="isExpanded ? 'rotate-180' : ''"
        />
      </div>
    </button>

    <transition
      enter-active-class="transition-[max-height,opacity] duration-300 ease-out"
      enter-from-class="opacity-0 max-h-0"
      enter-to-class="opacity-100 max-h-[900px]"
      leave-active-class="transition-[max-height,opacity] duration-250 ease-in"
      leave-from-class="opacity-100 max-h-[900px]"
      leave-to-class="opacity-0 max-h-0"
    >
      <div
        v-show="isExpanded"
        class="border-t border-solid border-gray-200 dark:border-gray-700 px-4 py-3 overflow-hidden"
      >
        <slot />
      </div>
    </transition>
  </div>
</template>

<script setup>
const isExpanded = defineModel("isExpanded", {
  type: Boolean,
  default: false,
});

function toggleExpanded() {
  isExpanded.value = !isExpanded.value;
}
</script>
