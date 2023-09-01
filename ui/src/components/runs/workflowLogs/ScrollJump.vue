<template>
  <va-badge
    placement="top-left"
    :text="badgeText"
    overlap
    class="mr-6"
    style="--va-badge-text-wrapper-border-radius: 40px"
  >
    <va-button
      class="shadow-2xl"
      v-visible="props.numItems > props.itemsInView"
      @click="isNearBottom ? scrollToTop() : scrollToBottom()"
      :icon="
        isNearBottom ? 'keyboard_double_arrow_up' : 'keyboard_double_arrow_down'
      "
      round
    >
    </va-button>
  </va-badge>
</template>

<script setup>
const props = defineProps(["elemRef", "itemsInView", "numItems", "totalItems"]);

const { y } = useScroll(props.elemRef);
const isNearBottom = ref(false);
const newItems = ref(false);

watch(
  () => props.totalItems,
  (newVal, oldVal) => {
    if (oldVal !== 0 && newVal > oldVal) {
      newItems.value = true;
    }
  }
);

watch(isNearBottom, () => {
  if (isNearBottom.value) {
    newItems.value = false;
  }
});

const badgeText = computed(() => {
  return !isNearBottom.value && newItems.value ? "New" : "";
});

// we need to wait for the DOM update to measure the total scroll level (scrollHeight - clientHeight)
// nextTick does not wait till DOM update and scroll level is returned as 0
// setTimeout seems to run after the DOM update
watch([y, () => props.totalItems], () => {
  setTimeout(() => {
    const scrollcontainer = props.elemRef?.scrollContainer;
    if (scrollcontainer) {
      const scrollTotal =
        scrollcontainer.scrollHeight - scrollcontainer.clientHeight;
      isNearBottom.value = scrollTotal - y.value < 50;
    } else {
      isNearBottom.value = false;
    }
  });
});

function scrollToTop() {
  props.elemRef?.scrollContainer?.scrollTo(0, 0);
}

function scrollToBottom() {
  const scrollcontainer = props.elemRef?.scrollContainer;
  if (scrollcontainer) {
    const h = scrollcontainer.scrollHeight - scrollcontainer.clientHeight;
    scrollcontainer.scrollTo(0, h);
  }
}
</script>
