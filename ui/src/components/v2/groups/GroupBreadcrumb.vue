<template>
  <nav class="flex items-center flex-wrap gap-1 text-sm" aria-label="Group hierarchy breadcrumb">
    <template v-for="(ancestor, idx) in props.ancestors" :key="ancestor.id">
      <!-- Ancestor link -->
      <RouterLink
        :to="`/v2/groups/${ancestor.id}`"
        class="hover:underline truncate max-w-[160px]"
        style="color: var(--va-primary)"
        :title="ancestor.name"
      >
        {{ ancestor.name }}
      </RouterLink>
      <!-- Separator -->
      <i-mdi-chevron-right
        v-if="idx < props.ancestors.length - 1 || props.currentName"
        class="text-base shrink-0"
        style="color: var(--va-secondary)"
      />
    </template>

    <!-- Current group (non-linked) -->
    <span
      v-if="props.currentName"
      class="font-semibold text-gray-800 dark:text-gray-200 truncate max-w-[200px]"
      :title="props.currentName"
    >
      {{ props.currentName }}
    </span>
  </nav>
</template>

<script setup>
const props = defineProps({
  /**
   * Ordered array of ancestor groups from root → nearest parent.
   * Each item should have `{ id, name }`.
   */
  ancestors: { type: Array, default: () => [] },
  /** Name of the current (leaf) group — shown as the last non-linked crumb. */
  currentName: { type: String, default: '' },
})
</script>
