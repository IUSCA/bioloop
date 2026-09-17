<template>
  <div
    class="flex items-center justify-center shrink-0 rounded-lg bg-blue-50 dark:bg-blue-900/30 border border-solid border-blue-100 dark:border-blue-800"
    :style="{
      width: `${props.size}px`,
      height: `${props.size}px`,
      color: 'var(--va-primary)',
    }"
    :aria-label="props.name"
  >
    <Icon :icon="kindIcon" :style="{ fontSize: `${iconSize}px` }" />
  </div>
</template>

<script setup>
import { getIcon } from "@/services/v2/icons";

/**
 * The identity mark of a group or a collection: the icon for its kind.
 *
 * The mark is an icon rather than initials. A monogram is what `UserAvatar` draws for a
 * person, so a lettered square beside a group name reads as a user.
 *
 * @see docs/design/groups/profiles.md — The UI
 */
const props = defineProps({
  name: { type: String, default: "" },
  /** "group" or "collection" — decides which icon is drawn. */
  kind: {
    type: String,
    default: "group",
    validator: (v) => ["group", "collection"].includes(v),
  },
  size: { type: Number, default: 56 },
});

const kindIcon = computed(() => getIcon(props.kind, { outlined: true }));

/** Roughly half the square, which is where a Material icon stops looking cramped. */
const iconSize = computed(() => Math.round(props.size / 2));
</script>
