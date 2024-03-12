<template>
  <collapsible
    v-for="report in props.reports"
    :key="report.id"
    v-model="report.collapse"
  >
    <template #header-content>
      <duplicate-checks-report-header :report="report" />
    </template>
  </collapsible>
</template>

<script setup>
import DuplicateChecksReport from "@/components/dataset/duplicatesReport/DuplicateChecksReport.vue";
import DuplicateChecksReportHeader from "@/components/dataset/duplicatesReport/DuplicateChecksReportHeader.vue";

const props = defineProps({
  reports: {
    type: Array,
    required: true,
  },
});
</script>

<style scoped></style>
