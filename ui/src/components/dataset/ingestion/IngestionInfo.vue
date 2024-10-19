<template>
  <va-card>
    <va-card-title>Dataset Ingestion</va-card-title>
    <va-card-content>
      <div class="va-table-responsive">
        <table class="va-table">
          <tbody>
            <tr>
              <td>Dataset Name</td>
              <td>{{ props.ingestionDir.name }}</td>
            </tr>
            <tr>
              <td>Ingestion Source Directory</td>
              <td><CopyText :text="props.ingestionDir.path" /></td>
            </tr>
            <tr v-if="props.ingestionSpace">
              <td>Ingestion Source Space</td>
              <td>{{ props.ingestionSpace }}</td>
            </tr>
            <tr>
              <td>Dataset Type</td>
              <td>
                <va-chip size="small">{{
                  config.dataset.types.DATA_PRODUCT.label
                }}</va-chip>
              </td>
            </tr>
            <tr v-if="props.sourceRawData">
              <td>Source Raw Data</td>
              <td>
                <a :href="`/datasets/${props.sourceRawData.id}`">{{
                  props.sourceRawData.name
                }}</a>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </va-card-content>
  </va-card>
</template>

<script setup>
import config from "@/config";

const props = defineProps({
  ingestionSpace: {
    type: String,
  },
  ingestionDir: {
    type: Object,
    required: true,
  },
  sourceRawData: {
    type: Object,
  },
});
</script>

<style scoped></style>
