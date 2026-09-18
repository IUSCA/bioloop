<template>
  <div class="flex items-start justify-between flex-wrap gap-4">
    <div class="flex items-start gap-3.5 min-w-0">
      <ProfileAvatar :kind="props.kind" :name="props.name" :size="56" />
      <div class="flex flex-col gap-1.5 pt-0.5 min-w-0">
        <div class="flex items-center gap-2.5 flex-wrap">
          <h1 class="text-xl font-semibold">{{ props.name }}</h1>
          <Badge v-if="props.type" color="orange">{{ props.type }}</Badge>
          <Badge v-if="props.isArchived" color="neutral">Archived</Badge>
        </div>
        <p
          v-if="props.tagline"
          class="text-sm max-w-3xl"
          style="color: var(--va-secondary)"
        >
          {{ props.tagline }}
        </p>
        <p v-if="props.subtitle" class="text-sm">
          <slot name="subtitle">{{ props.subtitle }}</slot>
        </p>
      </div>
    </div>

    <div class="flex items-center gap-2.5 shrink-0">
      <slot name="actions" />
    </div>
  </div>
</template>

<script setup>
import ProfileAvatar from "@/components/v2/profiles/ProfileAvatar.vue";

/**
 * The identity block at the top of a profile: kind icon, name, and the one line under it.
 *
 * @see docs/design/groups/profiles.md — The UI
 */
const props = defineProps({
  name: { type: String, required: true },
  /** "group" or "collection" — picks the icon drawn beside the name. */
  kind: { type: String, default: "group" },
  tagline: { type: String, default: null },
  /** `metadata.type` — a short word such as "core" or "lab". */
  type: { type: String, default: null },
  isArchived: { type: Boolean, default: false },
  subtitle: { type: String, default: null },
});
</script>
