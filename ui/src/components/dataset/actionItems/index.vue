<template>
  <collapsible
    v-for="item in props.actionItems"
    :key="item.id"
    v-model="item.collapse"
  >
    <template #header-content>
      <action-item-header :item="item" />
    </template>

    <action-item-checks-report :item="item" />
  </collapsible>
</template>

<script setup>
// import ActionItemHeader from "@/components/dataset/actionItems/ActionItemHeader.vue";
// import ActionItemCheckReport from "@/components/dataset/actionItems/ActionItemChecksReport.vue";

const props = defineProps({
  actionItems: {
    type: Array,
    required: true,
  },
});
</script>

<style scoped></style>
