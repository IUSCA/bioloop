<template>
  <div class="flex flex-col text-sm">
    <div
      v-for="item in treeItems"
      :key="item.isCurrent ? 'current' : item.id"
      class="flex items-start leading-6"
      :style="{
        paddingLeft: item.level === 0 ? '0' : `${(item.level - 1) * 1.25}rem`,
      }"
    >
      <span
        v-if="item.level > 0"
        class="mr-1 select-none font-mono shrink-0"
        style="color: var(--va-secondary)"
        >└──</span
      >
      <RouterLink
        v-if="!item.isCurrent && props.linkAncestors"
        :to="`/v2/groups/${item.id}`"
        class="hover:underline truncate"
        style="color: var(--va-primary)"
      >
        {{ item.name }}
      </RouterLink>
      <span v-else-if="!item.isCurrent" class="truncate">{{ item.name }}</span>
      <span v-else class="font-semibold truncate">{{ item.name }}</span>
    </div>
  </div>
</template>

<script setup>
/**
 * The group's place in the hierarchy, drawn as a tree with the group itself as the leaf.
 *
 * A tree rather than a breadcrumb, because group names are long enough that a horizontal path
 * of three of them does not fit on one row.
 *
 * Shared by the group Overview and the hover card in the group pickers, so the two cannot
 * drift. The pickers pass `linkAncestors: false`: a link out of a dropdown loses whatever the
 * person was filling in.
 *
 * @see docs/design/groups/decisions.md — 20. Group names are unique among siblings
 */
const props = defineProps({
  // The group this lineage belongs to; only its name is read.
  group: { type: Object, required: true },
  // Ancestors in any order, each carrying name and depth. The component sorts them.
  ancestors: { type: Array, default: () => [] },
  linkAncestors: { type: Boolean, default: true },
});

// root (highest depth) first, which is the order the tree indents in
const sortedAncestors = computed(() =>
  [...props.ancestors].sort((a, b) => b.depth - a.depth),
);

const treeItems = computed(() => [
  ...sortedAncestors.value.map((ancestor, i) => ({
    ...ancestor,
    level: i,
    isCurrent: false,
  })),
  {
    id: null,
    name: props.group.name,
    level: sortedAncestors.value.length,
    isCurrent: true,
  },
]);
</script>
