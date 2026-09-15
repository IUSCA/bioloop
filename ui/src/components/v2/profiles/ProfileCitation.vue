<template>
  <VaCard v-if="props.citation">
    <VaCardContent>
      <div class="flex items-center justify-between mb-3">
        <h2 class="text-sm font-semibold">
          HOW TO CITE THIS
          {{ props.kind === "collection" ? "COLLECTION" : "GROUP" }}
        </h2>
        <VaButton preset="secondary" size="small" @click="copy">
          <i-mdi-content-copy class="mr-1" />
          {{ copied ? "Copied" : "Copy" }}
        </VaButton>
      </div>

      <!--
        A citation ends in a URL with no spaces in it, so it needs `break-all` rather than
        `break-words`: the latter keeps an unbroken token whole and lets it run out of the
        card. The type is a step down from body text because the block is reference matter
        that is copied rather than read.
      -->
      <p
        class="font-mono text-[0.71875rem] leading-relaxed break-all rounded-md px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-solid border-gray-200 dark:border-gray-700"
      >
        {{ props.citation }}
      </p>

      <p class="text-xs mt-2" style="color: var(--va-secondary)">
        {{
          props.kind === "collection"
            ? "The citation covers the whole collection, including datasets you cannot see."
            : "Acknowledge this group in publications that use data produced here. Individual datasets carry their own citation."
        }}
      </p>
    </VaCardContent>
  </VaCard>
</template>

<script setup>
/**
 * The citation line, with a copy button.
 *
 * The API resolves the line — a stored one when an admin wrote it, a generated one
 * otherwise — so this component never builds a citation of its own.
 *
 * @see docs/design/groups/profiles.md — Schema
 */
const props = defineProps({
  citation: { type: String, default: "" },
  /** "group" or "collection". Changes the heading and the note underneath. */
  kind: { type: String, default: "group" },
});

const copied = ref(false);
let resetTimer = null;

async function copy() {
  try {
    await navigator.clipboard.writeText(props.citation);
    copied.value = true;
    clearTimeout(resetTimer);
    resetTimer = setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch {
    // A browser that refuses clipboard access leaves the text on screen to select by hand,
    // which is why this failure is silent rather than a toast.
  }
}

onUnmounted(() => clearTimeout(resetTimer));
</script>
