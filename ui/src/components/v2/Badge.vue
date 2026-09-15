<template>
  <span
    :class="[
      TONES[props.color],
      SIZES[props.size].chip,
      borderClass,
      props.uppercase ? 'uppercase tracking-wide' : '',
    ]"
    class="shrink-0 inline-flex items-center gap-1 font-semibold"
  >
    <Icon
      v-if="props.icon"
      :icon="props.icon"
      :class="SIZES[props.size].icon"
    />
    <slot />
  </span>
</template>

<script setup>
/**
 * Badge
 *
 * Purpose:
 * The one small tinted label in v2: a status, a role, a provenance marker, or any
 * short word that qualifies the row it sits on.
 *
 * Why it exists:
 * The same label was written three ways — a tinted-transparent span, a solid-tint
 * span, and a gradient chip — and the three appeared next to each other on the same
 * header. One component means one radius, one padding, one weight, and one decision
 * about how a tint behaves in dark mode.
 *
 * The recipe is tinted-transparent: a `/10` background of the tone's own hue. It reads
 * on a white card and on a `gray-800` card without a second color being chosen.
 *
 * Responsibilities:
 * - Own the recipe and the tone map.
 * - Refuse an unrecognised `color` or `size` rather than resolving it to a fallback.
 *
 * Not responsible for:
 * - Choosing a tone from data. A caller that maps a status to a tone keeps that map;
 *   `RoleBadge.vue` is the example.
 *
 * @see docs/contributing/v2-design-system.md - The primitive set
 */
import { computed } from "vue";

const props = defineProps({
  /**
   * A meaning, or one of the reserved identity tones. Never a raw hue chosen for looks.
   * @see docs/contributing/v2-design-system.md - Semantic meaning is fixed
   */
  color: {
    type: String,
    default: "neutral",
    validator: (v) =>
      [
        "primary",
        "success",
        "warning",
        "danger",
        "neutral",
        "violet",
        "sky",
        "indigo",
        "teal",
        "orange",
        "rose",
      ].includes(v),
  },
  size: {
    type: String,
    default: "sm",
    validator: (v) => ["sm", "base", "lg"].includes(v),
  },
  /** Optional leading icon, by Iconify name. */
  icon: {
    type: String,
    default: null,
  },
  /** Draws a hairline in the badge's own color, for use on an already tinted surface. */
  border: {
    type: Boolean,
    default: false,
  },
  /**
   * Uppercase the label. Turn this off only when the content is a proper noun, such as
   * a group or preset name, where capitals misrepresent the name itself.
   */
  uppercase: {
    type: Boolean,
    default: true,
  },
});

// Class strings are complete literals so Tailwind's scanner can see them.
const SIZES = {
  sm: { chip: "text-2xs px-1.5 py-0.5 rounded-md", icon: "text-sm" },
  base: { chip: "text-sm px-2 py-1 rounded-md", icon: "text-base" },
  lg: { chip: "text-base px-3 py-1.5 rounded-lg", icon: "text-lg" },
};

// The first five are meanings. The rest are the identity tones the design system
// reserves, and they must not be pressed into service as a meaning.
const TONES = {
  primary:
    "text-blue-700 bg-blue-500/10 dark:text-blue-400 dark:bg-blue-400/10",
  success:
    "text-emerald-700 bg-emerald-500/10 dark:text-emerald-400 dark:bg-emerald-400/10",
  warning:
    "text-amber-700 bg-amber-500/10 dark:text-amber-400 dark:bg-amber-400/10",
  danger: "text-red-700 bg-red-500/10 dark:text-red-400 dark:bg-red-400/10",
  neutral:
    "text-gray-700 bg-gray-500/10 dark:text-gray-300 dark:bg-gray-400/10",
  violet:
    "text-violet-700 bg-violet-500/10 dark:text-violet-400 dark:bg-violet-400/10",
  sky: "text-sky-700 bg-sky-500/10 dark:text-sky-400 dark:bg-sky-400/10",
  indigo:
    "text-indigo-700 bg-indigo-500/10 dark:text-indigo-400 dark:bg-indigo-400/10",
  teal: "text-teal-700 bg-teal-500/10 dark:text-teal-400 dark:bg-teal-400/10",
  orange:
    "text-orange-700 bg-orange-500/10 dark:text-orange-400 dark:bg-orange-400/10",
  rose: "text-rose-700 bg-rose-500/10 dark:text-rose-400 dark:bg-rose-400/10",
};

const borderClass = computed(() =>
  props.border ? "border border-solid border-current" : "",
);
</script>
