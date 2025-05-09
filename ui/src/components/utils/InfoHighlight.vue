<!--class="border-t-4 border-indigo-500"-->
<template>
  <div
    class="flex items-center"
    :class="[`va-text-${props.color}`, borderClass, , paddingClass]"
  >
    <va-icon name="info" class="mr-2" />
    <!--    Slot for text-->
    <span class="text-sm"><slot></slot></span>
    <!--    text-->
  </div>
</template>

<script setup>
const props = defineProps({
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
});

const borderClass = computed(() => {
  if (props.border === "none") return "";
  return `border-${props.border}`;
});

const paddingClass = computed(() => {
  switch (props.padding) {
    case "left":
      return "pl-2";
    case "right":
      return "pr-2";
    case "top":
      return "pt-2";
    case "bottom":
      return "pb-2";
    case "all":
      return "p-2";
    case "none":
      return "";
    default:
      return "p-2";
  }
});
</script>

<style lang="scss" scoped>
//.info-highlight {
//  --border-width: 0.25rem; /* 4px equivalent */
//  padding: 0.5rem;
//}

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
