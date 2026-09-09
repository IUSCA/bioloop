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
    class="flex items-center justify-center shrink-0 rounded-lg font-semibold bg-blue-50 dark:bg-blue-900/30 border border-solid border-blue-100 dark:border-blue-800"
    :style="{
      width: `${props.size}px`,
      height: `${props.size}px`,
      fontSize: `${Math.round(props.size / 2.6)}px`,
      color: 'var(--va-primary)',
    }"
  >
    {{ monogram }}
  </div>
</template>

<script setup>
/**
 * A group's profile picture, or a monogram when it has none.
 *
 * The image URL is a public route, so the browser fetches it without a bearer token. A
 * signed-in admin looking at a private profile is authorized from the `jwt` cookie their
 * session already carries; an anonymous reader is authorized by the group's visibility.
 *
 * @see docs/design/groups/profiles.md — The UI
 */
const props = defineProps({
  name: { type: String, default: "" },
  /** Null renders the monogram instead. */
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

/** Up to two initials from the name, so a group with no picture still has an identity. */
const monogram = computed(() => {
  const words = (props.name || "?").trim().split(/\s+/).slice(0, 2);
  return words.map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
});
</script>
