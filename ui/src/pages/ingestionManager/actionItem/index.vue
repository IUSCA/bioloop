<template>
  <collapsible
    v-for="item in props.actionItems"
    :key="item.id"
    v-model="item.collapse"
  >
    <template #header-content>
      <action-item-header :item="item" />
    </template>

    <action-item-check-report :item="item" />
  </collapsible>
</template>

<script setup>
import ActionItemHeader from "@/pages/ingestionManager/actionItem/ActionItemHeader.vue";
import ActionItemCheckReport from "@/pages/ingestionManager/actionItem/ActionItemChecksReport.vue";

const props = defineProps({
  actionItems: {
    type: Array,
    required: true,
  },
});
</script>

<style scoped></style>
