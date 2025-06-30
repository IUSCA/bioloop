<template>
  <div
    class="flex items-center"
    :class="[
      `va-text-${props.color}`,
      borderClass,
      paddingClass,
      fontSizeClass,
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
  iconSize: {
    type: String,
    default: "medium",
    validator: (value) => ["small", "medium", "large"].includes(value),
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
  paddingDirection: {
    type: String,
    default: "all",
    validator: (value) =>
      ["left", "right", "top", "bottom", "all", "none"].includes(value),
  },
  paddingAmount: {
    type: [String, Number],
    default: "default",
    validator: (value) =>
      ["none", "xs", "sm", "md", "lg", "xl", "2xl", "default"].includes(
        value,
      ) ||
      (typeof value === "number" && value >= 0),
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

/**
 * Example values of `paddingClass`:
 *  - paddingDirection: "all", paddingAmount: "xs" => "p-1"
 *  - paddingDirection: "left", paddingAmount: "md" => "pl-4"
 *  - paddingDirection: "bottom", paddingAmount: "default", size: "large" => "pb-6"
 *  - paddingDirection: "all", paddingAmount: 15 => "p-[15px]"
 *  - paddingDirection: "left", paddingAmount: "2.5rem" => "pl-[2.5rem]"
 */
const paddingClass = computed(() => {
  if (props.paddingDirection === "none") return "";

  const prefix = "p";
  const direction =
    props.paddingDirection === "all" ? "" : props.paddingDirection.charAt(0);

  let amount;
  switch (props.paddingAmount) {
    case "none":
      return "";
    case "xs":
      amount = "1"; // 0.25rem (4px)
      break;
    case "sm":
      amount = "2"; // 0.5rem (8px)
      break;
    case "md":
      amount = "4"; // 1rem (16px)
      break;
    case "lg":
      amount = "6"; // 1.5rem (24px)
      break;
    case "xl":
      amount = "8"; // 2rem (32px)
      break;
    case "2xl":
      amount = "10"; // 2.5rem (40px)
      break;
    case "default":
      amount =
        props.size === "small" ? "2" : props.size === "medium" ? "4" : "6";
      break;
    default:
      // For numeric values, assume measurement is in pixel. Otherwise, use the value as provided.
      return `${prefix}${direction}-[${props.paddingAmount}${typeof props.paddingAmount === "number" ? "px" : ""}]`;
  }

  return `${prefix}${direction}-${amount}`;
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
</script>

<style lang="scss" scoped>
.border-left {
  border-left: 2px solid var(--va-info);
}

.border-right {
  border-right: 2px solid var(--va-info);
}

.border-top {
  border-top: 2px solid var(--va-info);
}

.border-bottom {
  border-bottom: 2px solid var(--va-info);
}

.border-all {
  border: 2px solid var(--va-info);
}
</style>
