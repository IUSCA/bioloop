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
    default: "sm",
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
    case "OVERSIGHT":
      return "text-emerald-700 bg-emerald-600/10 dark:text-emerald-400 dark:bg-emerald-400/10";
    case "GRANT_HOLDER":
      return "text-violet-700 bg-violet-500/10 dark:text-violet-400 dark:bg-violet-400/10";
    default:
      return "text-slate-500 bg-slate-500/10 dark:text-slate-400 dark:bg-slate-400/10";
  }
});

const sizeClasses = computed(() => {
  switch (props.size) {
    case "sm":
      return "text-[11px] px-1.5 py-0.5 rounded-md";
    case "base":
      return "text-sm px-2 py-1 rounded-md";
    case "lg":
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
    case "OVERSIGHT":
      return "mdi-eye-outline";
    case "GRANT_HOLDER":
      return "mdi-certificate-outline";
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
    case "OVERSIGHT":
      return "Oversight";
    case "GRANT_HOLDER":
      return "Grant Holder";
    default:
      return props.roleName;
  }
});
</script>
