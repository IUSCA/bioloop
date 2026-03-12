<template>
  <span
    :class="[
      'inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium border border-solid',
      colorClasses[props.color] || colorClasses.primary,
    ]"
  >
    <slot />
  </span>
</template>

<script setup>
const props = defineProps({
  color: { type: String, default: "primary" },
});

const colorClasses = {
  primary:
    "bg-gradient-to-r from-indigo-100 to-purple-100 text-indigo-800 border-indigo-200 dark:from-indigo-900/40 dark:to-purple-900/40 dark:text-indigo-200 dark:border-indigo-700",
  secondary:
    "bg-gradient-to-r from-slate-100 to-stone-100 text-slate-700 border-slate-300 dark:from-slate-800/40 dark:to-stone-800/40 dark:text-slate-300 dark:border-slate-600",
  success:
    "bg-gradient-to-r from-emerald-100 to-cyan-100 text-emerald-800 border-emerald-300 dark:from-emerald-900/40 dark:to-cyan-900/40 dark:text-emerald-300 dark:border-emerald-700",
  accent:
    "bg-gradient-to-r from-rose-100 to-orange-100 text-rose-700 border-rose-300 dark:from-rose-900/40 dark:to-orange-900/40 dark:text-rose-300 dark:border-rose-700",
};
</script>
