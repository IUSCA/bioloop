<template>
  <span
    v-if="props.roleName"
    :class="[
      roleColor,
      sizeClasses,
      props.border ? 'border border-solid border-current' : '',
    ]"
    class="shrink-0 inline-flex items-center gap-1 font-semibold uppercase tracking-wide"
  >
    <Icon :icon="roleIcon" :class="iconSize" />
    {{ roleText }}
  </span>
</template>

<script setup>
const props = defineProps({
  roleName: {
    type: String,
    required: true,
  },
  size: {
    type: String,
    default: "small",
  },
  border: {
    type: Boolean,
    default: false,
  },
});

const roleColor = computed(() => {
  switch (props.roleName) {
    case "PLATFORM_ADMIN":
      return "text-red-700 bg-red-500/10 dark:text-red-400 dark:bg-red-400/10";
    case "ADMIN":
      return "text-amber-700 bg-amber-500/10 dark:text-amber-400 dark:bg-amber-400/10";
    case "MEMBER":
      return "text-sky-700 bg-sky-500/10 dark:text-sky-400 dark:bg-sky-400/10";
    case "TRANSITIVE_MEMBER":
      return "text-indigo-700 bg-indigo-500/10 dark:text-indigo-400 dark:bg-indigo-400/10";
    case "OVERSIGHT":
      return "text-emerald-600 bg-emerald-600/10 dark:text-emerald-400 dark:bg-emerald-400/10";
    default:
      return "text-slate-500 bg-slate-500/10 dark:text-slate-400 dark:bg-slate-400/10";
  }
});

const sizeClasses = computed(() => {
  switch (props.size) {
    case "small":
      return "text-[11px] px-1.5 py-0.5 rounded-md";
    case "medium":
      return "text-sm px-2 py-1 rounded-md";
    case "large":
      return "text-base px-3 py-1.5 rounded-lg";
    default:
      return "text-[11px] px-1.5 py-0.5 rounded-md";
  }
});

const iconSize = computed(() => {
  switch (props.size) {
    case "small":
      return "text-sm";
    case "medium":
      return "text-base";
    case "large":
      return "text-lg";
    default:
      return "text-sm";
  }
});

const roleIcon = computed(() => {
  switch (props.roleName) {
    case "PLATFORM_ADMIN":
      return "mdi-crown-outline";
    case "ADMIN":
      return "mdi-shield-crown-outline";
    case "MEMBER":
      return "mdi-account-outline";
    case "OVERSIGHT":
      return "mdi-eye-outline";
    case "TRANSITIVE_MEMBER":
      return "mdi-account-arrow-right-outline";
    default:
      return "mdi-account-outline";
  }
});

const roleText = computed(() => {
  switch (props.roleName) {
    case "PLATFORM_ADMIN":
      return "Platform Admin";
    case "ADMIN":
      return "Admin";
    case "MEMBER":
      return "Member";
    case "OVERSIGHT":
      return "Oversight";
    case "TRANSITIVE_MEMBER":
      return "Member (Transitive)";
    default:
      return props.roleName;
  }
});
</script>
