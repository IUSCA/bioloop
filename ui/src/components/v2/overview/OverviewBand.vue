<template>
  <VaCard>
    <div class="flex flex-col lg:flex-row lg:items-stretch">
      <div class="flex flex-col justify-center flex-1 min-w-0 p-4">
        <p
          ref="descEl"
          class="text-sm leading-relaxed"
          :class="{ 'line-clamp-3': !expanded }"
        >
          {{ props.description || "No description." }}
        </p>
        <button
          v-if="overflows"
          type="button"
          class="self-start mt-1 p-0 text-xs font-medium bg-transparent border-0 cursor-pointer"
          style="color: var(--va-primary)"
          @click="expanded = !expanded"
        >
          {{ expanded ? "Show less" : "Show more" }}
        </button>
      </div>

      <div
        class="w-full h-px lg:w-px lg:h-auto shrink-0 bg-gray-100 dark:bg-gray-800"
      ></div>

      <div class="flex flex-wrap shrink-0">
        <slot />
      </div>
    </div>
  </VaCard>
</template>

<script setup>
/**
 * The summary band at the top of an Overview tab: the description on the left, the facts
 * that matter to this reader in a row beside it.
 *
 * Which facts appear is the caller's decision, and on both detail pages it follows from
 * what the API's attribute filter returned rather than from a permission check in the UI.
 *
 * A long description is clamped to three lines, because a description nobody capped has
 * made the band taller than everything under it. The toggle appears only when there is
 * something hidden, which has to be measured rather than guessed from the text length.
 *
 * @see docs/design/groups/ui-information-architecture.md — The Overview tab
 */
const props = defineProps({
  description: { type: String, default: "" },
});

const descEl = ref(null);
const expanded = ref(false);
const overflows = ref(false);

/**
 * Whether the clamp is hiding anything. Skipped while expanded, because an expanded
 * paragraph always fits its own box and the toggle would remove itself.
 */
function measure() {
  if (expanded.value) return;
  const el = descEl.value;
  if (!el) return;
  overflows.value = el.scrollHeight > el.clientHeight + 1;
}

let observer = null;

onMounted(() => {
  nextTick(measure);
  if (typeof ResizeObserver !== "undefined" && descEl.value) {
    observer = new ResizeObserver(measure);
    observer.observe(descEl.value);
  }
});

onUnmounted(() => observer?.disconnect());

watch(
  () => props.description,
  () => {
    expanded.value = false;
    nextTick(measure);
  },
);
</script>
