<template>
  <div
    :class="`rounded-lg border border-solid px-4 py-3 flex gap-3 ${tone.surface} mt-3`"
    role="note"
  >
    <Icon :icon="resolvedIcon" :class="`flex-shrink-0 mt-1 ${tone.icon}`" />

    <div class="text-sm min-w-0 flex-1">
      <div v-if="hasTitle" :class="`${tone.title} font-medium`">
        <slot name="title">{{ props.title }}</slot>
      </div>

      <div v-if="hasBody" :class="`${tone.text} text-xs mt-1`">
        <slot>{{ props.description }}</slot>
      </div>

      <div v-if="slots.actions" class="mt-2 flex items-center gap-2">
        <slot name="actions" />
      </div>
    </div>

    <button
      v-if="props.closeable"
      type="button"
      class="flex-shrink-0 self-start rounded p-0.5 bg-transparent border-none cursor-pointer focus-ring"
      :class="tone.icon"
      aria-label="Dismiss message"
      @click="emit('close')"
    >
      <Icon icon="mdi-close" />
    </button>
  </div>
</template>

<script setup>
/**
 * ModernAlert
 *
 * Purpose:
 * An inline, non-blocking message block: an icon, an optional title, body content,
 * and optional actions, tinted by what the message means.
 *
 * Why it exists:
 * Governance screens explain consequences before an action is taken — who inherits
 * membership, who gains oversight, which request conflicts. Those explanations are
 * long enough to need a container and frequent enough that copying a class string
 * between forms is how they drift apart.
 *
 * Responsibilities:
 * - Own the tint, icon, and border for each meaning.
 * - Render caller content, including the default slot, unconditionally.
 * - Refuse an unrecognised `color` rather than resolving it to a fallback.
 *
 * Not responsible for:
 * - Transient feedback after an action completes. Use `services/toast` for that.
 * - Its own vertical placement beyond the `mt-3` it carries; callers add margin.
 *
 * @see docs/contributing/v2-design-system.md — The primitive set
 */
import { computed, useSlots } from "vue";

const props = defineProps({
  /** Overrides the default icon for the chosen meaning. */
  icon: {
    type: String,
    default: null,
  },
  /** Heading text. The `title` slot takes precedence when both are given. */
  title: {
    type: String,
    default: "",
  },
  /** Body text. The default slot takes precedence when both are given. */
  description: {
    type: String,
    default: "",
  },
  /**
   * What the message means, never a raw hue.
   * @see docs/contributing/v2-design-system.md — Semantic meaning is fixed
   */
  color: {
    type: String,
    default: "info",
    validator: (v) =>
      ["info", "success", "warning", "danger", "neutral"].includes(v),
  },
  /** Shows a dismiss button that emits `close`. The caller controls visibility. */
  closeable: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["close"]);

const slots = useSlots();

// Class strings are complete literals so Tailwind's scanner can see them.
const TONES = {
  info: {
    surface:
      "bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800",
    text: "text-blue-800 dark:text-blue-200",
    title: "text-blue-900 dark:text-blue-100",
    icon: "text-blue-600 dark:text-blue-400",
    icon_name: "mdi-information-outline",
  },
  success: {
    surface:
      "bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800",
    text: "text-emerald-800 dark:text-emerald-200",
    title: "text-emerald-900 dark:text-emerald-100",
    icon: "text-emerald-600 dark:text-emerald-400",
    icon_name: "mdi-check-circle-outline",
  },
  warning: {
    surface:
      "bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800",
    text: "text-amber-800 dark:text-amber-200",
    title: "text-amber-900 dark:text-amber-100",
    icon: "text-amber-600 dark:text-amber-400",
    icon_name: "mdi-alert-outline",
  },
  danger: {
    surface: "bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800",
    text: "text-red-800 dark:text-red-200",
    title: "text-red-900 dark:text-red-100",
    icon: "text-red-600 dark:text-red-400",
    icon_name: "mdi-alert-circle-outline",
  },
  neutral: {
    surface:
      "bg-gray-50 border-gray-200 dark:bg-gray-900/20 dark:border-gray-700",
    text: "text-gray-700 dark:text-gray-300",
    title: "text-gray-900 dark:text-gray-100",
    icon: "text-gray-600 dark:text-gray-400",
    icon_name: "mdi-information-outline",
  },
};

const tone = computed(() => TONES[props.color]);

const resolvedIcon = computed(() => props.icon ?? tone.value.icon_name);

const hasTitle = computed(() => !!slots.title || !!props.title);

const hasBody = computed(() => !!slots.default || !!props.description);
</script>
