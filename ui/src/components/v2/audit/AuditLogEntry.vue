<template>
  <component :is="eventComponent" :record="record" />
</template>

<script setup>
import { registry } from "./templates";
import FallbackEvent from "./utils/FallbackEvent.vue";

const props = defineProps({ record: Object });
const eventComponent = computed(
  () => registry[props.record.event_type] ?? FallbackEvent,
);
</script>
