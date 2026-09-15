<template>
  <Badge :color="tone.color">{{ tone.label }}</Badge>
</template>

<script setup>
/**
 * What `profile_visibility` means, said in words rather than in an enum value.
 *
 * @see docs/design/groups/implementation/profiles.md — Decisions
 */
const props = defineProps({
  visibility: { type: String, default: "PRIVATE" },
});

const TONES = {
  PUBLIC: { label: "Public profile", color: "primary" },
  AUTHENTICATED: { label: "Signed-in users", color: "sky" },
  PRIVATE: { label: "Private", color: "neutral" },
};

const tone = computed(() => TONES[props.visibility] ?? TONES.PRIVATE);
</script>
