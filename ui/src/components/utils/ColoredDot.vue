<template>
  <span class="h-2 w-2 flex-shrink-0 rounded-full" :class="dotClass" />
</template>

<script setup>
const props = defineProps({
  color: {
    type: String,
    default: "slate",
  },
});

// Compute a fixed color key and pass to ColoredDot so tailwind class names are all static.
// This avoids dynamic template class generation in dotClass, which can be missed by JIT/HMR scanning.
const classMap = {
  slate: "bg-slate-500 shadow-slate-500 shadow-[0_0_12px]",
  gray: "bg-gray-500 shadow-gray-500 shadow-[0_0_12px]",
  zinc: "bg-zinc-500 shadow-zinc-500 shadow-[0_0_12px]",
  neutral: "bg-neutral-500 shadow-neutral-500 shadow-[0_0_12px]",
  stone: "bg-stone-500 shadow-stone-500 shadow-[0_0_12px]",
  red: "bg-red-500 shadow-red-500 shadow-[0_0_12px]",
  orange: "bg-orange-500 shadow-orange-500 shadow-[0_0_12px]",
  amber: "bg-amber-500 shadow-amber-500 shadow-[0_0_12px]",
  yellow: "bg-yellow-500 shadow-yellow-500 shadow-[0_0_12px]",
  lime: "bg-lime-500 shadow-lime-500 shadow-[0_0_12px]",
  green: "bg-green-500 shadow-green-500 shadow-[0_0_12px]",
  emerald: "bg-emerald-500 shadow-emerald-500 shadow-[0_0_12px]",
  teal: "bg-teal-500 shadow-teal-500 shadow-[0_0_12px]",
  cyan: "bg-cyan-500 shadow-cyan-500 shadow-[0_0_12px]",
  sky: "bg-sky-500 shadow-sky-500 shadow-[0_0_12px]",
  blue: "bg-blue-500 shadow-blue-500 shadow-[0_0_12px]",
  indigo: "bg-indigo-500 shadow-indigo-500 shadow-[0_0_12px]",
  violet: "bg-violet-500 shadow-violet-500 shadow-[0_0_12px]",
  purple: "bg-purple-500 shadow-purple-500 shadow-[0_0_12px]",
  fuchsia: "bg-fuchsia-500 shadow-fuchsia-500 shadow-[0_0_12px]",
  pink: "bg-pink-500 shadow-pink-500 shadow-[0_0_12px]",
  rose: "bg-rose-500 shadow-rose-500 shadow-[0_0_12px]",
};

const dotClass = computed(() => {
  return classMap[props.color] || classMap.slate;
});
</script>
