<template>
  <collapsible v-for="item in props.actionItems" :key="item.id">
    <!--    v-model="item.collapse"-->
    <template #header-content>
      <action-item-report-header :action-item="item" />
    </template>

    <va-button
      color="primary"
      plain
      size="small"
      @click="
        () => {
          router.push(`/datasetActionItems/${item.id}`);
        }
      "
      >Resolve</va-button
    >
  </collapsible>
</template>

<script setup>
import ActionItemReportHeader from "@/components/dataset/actionItems/report/ReportHeader.vue";

const props = defineProps({
  actionItems: {
    type: Array,
    required: true,
  },
});

const router = useRouter();
</script>

<style scoped></style>
