<template>
  <va-card>
    <va-card-title>Ingestion Details</va-card-title>
    <va-card-content>
      <div class="va-table-responsive">
        <table class="va-table w-full">
          <tbody>
            <tr>
              <td>Dataset Name</td>
              <td>
                <a
                  :href="`/datasets/${props.datasetId}`"
                  v-if="props.datasetId"
                >
                  {{ props.ingestionDir?.name }}
                </a>
                <span v-else>{{ props.ingestionDir?.name }}</span>
              </td>
            </tr>

            <tr>
              <td>Dataset Type</td>
              <td>
                <va-chip size="small" outline>
                  {{ props.selectedDatasetType }}
                </va-chip>
              </td>
            </tr>

            <tr>
              <td>Source Raw Data</td>
              <td class="metadata">
                <router-link
                  :to="`/datasets/${props.sourceRawData?.id}`"
                  target="_blank"
                >
                  {{ props.sourceRawData?.name }}
                </router-link>
              </td>
            </tr>

            <tr>
              <td>Project</td>
              <td class="metadata">
                <router-link
                  :to="`/projects/${props.project?.id}`"
                  target="_blank"
                >
                  {{ props.project?.name }}
                </router-link>
              </td>
            </tr>

            <tr>
              <td>Source Instrument</td>
              <td class="metadata">
                {{ props.sourceInstrument?.name }}
              </td>
            </tr>

            <tr>
              <td>Source Directory</td>
              <td>
                <CopyText :text="props.ingestionDir?.path" />
              </td>
            </tr>

            <tr>
              <td>Ingested from</td>
              <td>
                <va-chip size="small">{{ props.ingestionSpace }}</va-chip>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </va-card-content>
  </va-card>
</template>

<script setup>
const props = defineProps({
  datasetId: {
    type: [String, Number],
  },
  ingestionSpace: {
    type: String,
  },
  ingestionDir: {
    type: Object,
    required: true,
  },
  selectedDatasetType: {
    type: String,
    required: true,
  },
  sourceInstrument: {
    type: Object,
  },
  sourceRawData: {
    type: Object,
  },
  project: {
    type: Object,
  },
});
</script>

<style scoped>
.metadata {
  white-space: pre-wrap;
  word-wrap: break-word;
  word-break: break-word;
}
</style>
