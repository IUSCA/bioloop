<script setup>
import { computed } from "vue";

const props = defineProps({
  label: {
    type: String,
    default: "",
  },
  modelValue: {
    type: [Object, String, Number, Boolean],
    default: null,
  },
  options: {
    type: Array,
    required: true,
  },
  textBy: {
    type: String,
    default: "label",
  },
  valueBy: {
    type: String,
    default: null,
  },
  /**
   * What the selected segment means, never a raw hue. A control uses `primary` where a
   * message uses `info`; both are blue.
   * @see docs/contributing/v2-design-system.md - Semantic meaning is fixed
   */
  color: {
    type: String,
    default: "primary",
    validator: (v) =>
      ["primary", "success", "warning", "danger", "neutral"].includes(v),
  },
  size: {
    type: String,
    default: "base",
    validator: (v) => ["sm", "base", "lg"].includes(v),
  },
});

const emit = defineEmits(["update:modelValue"]);

// Resolve display text for an option
const getText = (option) => {
  if (typeof option === "object" && option !== null) {
    return option[props.textBy] ?? String(option);
  }
  return String(option);
};

// Resolve emitted value for an option
const getValue = (option) => {
  if (props.valueBy && typeof option === "object" && option !== null) {
    return option[props.valueBy];
  }
  return option;
};

// Check if an option is the currently active one
const isActive = (option) => {
  const val = getValue(option);
  if (props.valueBy) {
    return props.modelValue === val;
  }
  // Compare objects by valueBy key or by reference
  if (
    typeof props.modelValue === "object" &&
    props.modelValue !== null &&
    typeof option === "object"
  ) {
    return JSON.stringify(props.modelValue) === JSON.stringify(option);
  }
  return props.modelValue === val;
};

const select = (option) => {
  emit("update:modelValue", getValue(option));
};

// ─── Size tokens ─────────────────────────────────────────────
const sizeMap = {
  sm: {
    wrap: "p-0.5 gap-0.5",
    btn: "px-2.5 py-1 text-xs rounded-[5px]",
    label: "text-xs",
  },
  base: {
    wrap: "p-[3px] gap-[2px]",
    btn: "px-3 py-[5px] text-sm rounded-[7px]",
    label: "text-xs",
  },
  lg: {
    wrap: "p-1 gap-1",
    btn: "px-4 py-2 text-base rounded-[9px]",
    label: "text-sm.5",
  },
};

// ─── Color tokens ─────────────────────────────────────────────
// Active button background and text, plus the focus ring. Class strings are complete
// literals so Tailwind's scanner can see them.
const colorMap = {
  primary: {
    active: "bg-blue-600 text-white dark:bg-blue-500",
    ring: "focus-visible:ring-blue-500/50",
  },
  success: {
    active: "bg-emerald-600 text-white dark:bg-emerald-500",
    ring: "focus-visible:ring-emerald-500/50",
  },
  warning: {
    active: "bg-amber-500 text-white dark:bg-amber-400 dark:text-amber-950",
    ring: "focus-visible:ring-amber-500/50",
  },
  danger: {
    active: "bg-red-600 text-white dark:bg-red-500",
    ring: "focus-visible:ring-red-500/50",
  },
  neutral: {
    active: "bg-gray-700 text-white dark:bg-gray-500",
    ring: "focus-visible:ring-gray-500/50",
  },
};

const tokens = computed(() => ({
  size: sizeMap[props.size],
  color: colorMap[props.color],
}));
</script>

<template>
  <div class="inline-flex items-center gap-2">
    <!-- Optional label left of the group -->
    <span
      v-if="label"
      :class="[
        tokens.size.label,
        'font-medium tracking-wide uppercase text-slate-700 dark:text-slate-300 select-none',
      ]"
    >
      {{ label }}
    </span>

    <!-- Segmented control track -->
    <div
      role="group"
      :aria-label="label || 'Toggle group'"
      :class="[
        tokens.size.wrap,
        'inline-flex items-center',
        'bg-slate-100 dark:bg-slate-800',
        'border border-solid border-slate-200 dark:border-slate-700',
        'rounded-[10px]',
      ]"
    >
      <button
        v-for="option in options"
        :key="getText(option)"
        type="button"
        :aria-pressed="isActive(option)"
        :class="[
          tokens.size.btn,
          tokens.color.ring,
          'relative font-medium leading-none whitespace-nowrap select-none',
          'transition-all duration-150 ease-out',
          'outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
          'focus-visible:ring-offset-slate-100 dark:focus-visible:ring-offset-slate-800',
          isActive(option)
            ? [tokens.color.active, 'shadow-sm']
            : [
                'text-slate-600 dark:text-slate-300',
                'hover:text-slate-900 dark:hover:text-white',
                'hover:bg-slate-200/60 dark:hover:bg-slate-700/60',
              ],
        ]"
        @click="select(option)"
      >
        {{ getText(option) }}
      </button>
    </div>
  </div>
</template>
