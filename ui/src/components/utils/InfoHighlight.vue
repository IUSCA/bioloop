<!--class="border-t-4 border-indigo-500"-->
<template>
  <div
    class="flex items-center"
    :class="{
      [`va-text-${props.color}`]: true,
      'border-left': props.border === 'left',
      'border-right': props.border === 'right',
      'border-top': props.border === 'top',
      'border-bottom': props.border === 'bottom',
      'border-all': props.border === 'all',
    }"
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
