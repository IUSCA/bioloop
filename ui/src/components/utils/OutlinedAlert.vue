<!--class="border-t-4 border-indigo-500"-->
<template>
  <div
    class="flex items-center"
    :class="[
      `va-text-${props.color}`,
      borderClass,
      paddingClass,
      fontSizeClass,
      iconSizeClass,
    ]"
  >
    <va-icon :name="props.icon" :size="props.iconSize" class="mr-2" />
    <span><slot></slot></span>
  </div>
</template>

<script setup>
const props = defineProps({
  icon: {
    type: String,
    default: "info",
  },
  border: {
    type: String,
    default: "all",
    validator: (value) =>
      ["left", "right", "top", "bottom", "all", "none"].includes(value),
  },
  color: {
    type: String,
    default: "primary",
  },
  padding: {
    type: String,
    default: "all",
    validator: (value) =>
      ["left", "right", "top", "bottom", "all", "none"].includes(value),
  },
  size: {
    type: String,
    default: "medium",
    validator: (value) => ["small", "medium", "large"].includes(value),
  },
});

const borderClass = computed(() => {
  if (props.border === "none") return "";
  return `border-${props.border}`;
});

const paddingClass = computed(() => {
  const base = props.padding === "none" ? "" : "p";
  const direction = props.padding === "all" ? "" : props.padding.charAt(0);
  const size =
    props.size === "small" ? "2" : props.size === "medium" ? "4" : "6";
  let ret = props.padding === "none" ? "" : `${base}${direction}-${size}`;
  console.log("padding", ret);
  return ret;
});

const fontSizeClass = computed(() => {
  switch (props.size) {
    case "small":
      return "text-xs";
    case "medium":
      return "text-sm";
    case "large":
      return "text-base";
  }
});

const iconSizeClass = computed(() => {
  switch (props.size) {
    case "small":
      return "small";
    case "medium":
      return "medium";
    case "large":
      return "large";
  }
});
</script>

<style lang="scss" scoped>
.border-left {
  border-left: 2px solid var(--va-primary);
}

.border-right {
  border-right: 2px solid var(--va-primary);
}

.border-top {
  border-top: 2px solid var(--va-primary);
}

.border-bottom {
  border-bottom: 2px solid var(--va-primary);
}

.border-all {
  border: 2px solid var(--va-primary);
}
</style>
