<template>
  <img
    v-if="props.avatarUrl && !failed"
    :src="props.avatarUrl"
    :alt="`${props.name} profile picture`"
    class="object-cover shrink-0 rounded-lg border border-solid border-gray-200 dark:border-gray-700"
    :style="{ width: `${props.size}px`, height: `${props.size}px` }"
    @error="failed = true"
  />
  <div
    v-else
    class="flex items-center justify-center shrink-0 rounded-lg bg-blue-50 dark:bg-blue-900/30 border border-solid border-blue-100 dark:border-blue-800"
    :style="{
      width: `${props.size}px`,
      height: `${props.size}px`,
      color: 'var(--va-primary)',
    }"
    :aria-label="`${props.name} has no profile picture`"
  >
    <Icon :icon="fallbackIcon" :style="{ fontSize: `${iconSize}px` }" />
  </div>
</template>

<script setup>
import { getIcon } from "@/services/v2/icons";

/**
 * A group's or collection's profile picture, or the icon for its kind when it has none.
 *
 * The image URL is a public route, so the browser fetches it without a bearer token. A
 * signed-in admin looking at a private profile is authorized from the `jwt` cookie their
 * session already carries; an anonymous reader is authorized by the group's visibility.
 *
 * The fallback is the kind's own icon rather than initials. A monogram is what `UserAvatar`
 * draws for a person, so a lettered square beside a group name reads as a user.
 *
 * @see docs/design/groups/profiles.md — The UI
 */
const props = defineProps({
  name: { type: String, default: "" },
  /** "group" or "collection" — decides which icon stands in for a missing picture. */
  kind: {
    type: String,
    default: "group",
    validator: (v) => ["group", "collection"].includes(v),
  },
  /** Null renders the kind's icon instead. */
  avatarUrl: { type: String, default: null },
  size: { type: Number, default: 56 },
});

const failed = ref(false);

watch(
  () => props.avatarUrl,
  () => {
    failed.value = false;
  },
);

const fallbackIcon = computed(() => getIcon(props.kind, { outlined: true }));

/** Roughly half the square, which is where a Material icon stops looking cramped. */
const iconSize = computed(() => Math.round(props.size / 2));
</script>
