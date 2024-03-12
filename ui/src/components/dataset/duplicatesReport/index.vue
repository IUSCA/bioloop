<template>
  <collapsible
    v-for="item in props.reports"
    :key="item.id"
    v-model="item.collapse"
  >
    <template #header-content>
      <duplicate-checks-header :item="item" />
    </template>

    <duplicate-checks-report :item="item" />
  </collapsible>
</template>

<script setup>
import DuplicateChecksReport from "@/components/dataset/duplicatesReport/DuplicateChecksReport.vue";
import DuplicateChecksHeader from "@/components/dataset/duplicatesReport/DuplicateChecksHeader.vue";

const props = defineProps({
  reports: {
    type: Array,
    required: true,
  },
});
</script>

<style scoped></style>
