<template>
  <div :class="`rounded-lg px-4 py-3 flex gap-3 ${backgroundClass} mt-3`">
    <Icon :icon="props.icon" :class="`flex-shrink-0 mt-1 ${iconClass}`" />
    <div class="text-sm">
      <div :class="titleClass">
        {{ props.title }}
      </div>
      <div :class="textClass + ' text-xs mt-1'">
        <slot>
          {{ props.description }}
        </slot>
      </div>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  icon: {
    type: String,
    default: "mdi-information",
  },
  title: String,
  description: String,
  color: {
    type: String,
    default: "emerald",
  },
});

const classMap = {
  slate: {
    background:
      "bg-slate-50 dark:bg-slate-900/20 border-slate-200 dark:border-slate-800",
    text: "text-slate-800 dark:text-slate-200",
    title: "text-slate-800 dark:text-slate-200 font-medium",
    icon: "text-slate-500 dark:text-slate-500",
  },
  emerald: {
    background:
      "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800",
    text: "text-emerald-800 dark:text-emerald-200",
    title: "text-emerald-800 dark:text-emerald-200 font-medium",
    icon: "text-emerald-500 dark:text-emerald-500",
  },
  indigo: {
    background:
      "bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800",
    text: "text-indigo-800 dark:text-indigo-200",
    title: "text-indigo-800 dark:text-indigo-200 font-medium",
    icon: "text-indigo-500 dark:text-indigo-500",
  },
  rose: {
    background:
      "bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800",
    text: "text-rose-800 dark:text-rose-200",
    title: "text-rose-800 dark:text-rose-200 font-medium",
    icon: "text-rose-500 dark:text-rose-500",
  },
  amber: {
    background:
      "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800",
    text: "text-amber-800 dark:text-amber-200",
    title: "text-amber-900 dark:text-amber-100 font-medium",
    icon: "text-amber-600 dark:text-amber-500",
  },
};

const fallbackColor = "emerald";

const computedClasses = computed(
  () => classMap[props.color] || classMap[fallbackColor],
);

const backgroundClass = computed(() => computedClasses.value.background);
const textClass = computed(() => computedClasses.value.text);
const titleClass = computed(() => computedClasses.value.title);
const iconClass = computed(() => computedClasses.value.icon);
</script>
