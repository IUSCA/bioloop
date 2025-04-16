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
                <a :href="`/datasets/${props.datasetId}`" v-if="props.datasetId">
                  {{ props.ingestionDir?.name }}</a
                >
                <span v-else>{{ props.ingestionDir?.name }}</span>
              </td>
            </tr>
            <tr>
              <td>Source Directory</td>
              <td><CopyText :text="props.ingestionDir?.path" /></td>
            </tr>
            <tr v-if="props.ingestionSpace">
              <td>Ingestion Source Space</td>
              <td>
                <va-chip size="small">{{ props.ingestionSpace }}</va-chip>
              </td>
            </tr>
            <tr>
              <td>Dataset Type</td>
              <td>
                <va-chip size="small" outline>{{
                  config.dataset.types.DATA_PRODUCT.label
                }}</va-chip>
              </td>
            </tr>

            <tr v-if="props.sourceRawData">
              <td>Source Raw Data</td>
              <td class="metadata">
                <router-link :to="`/datasets/${props.sourceRawData?.id}`" target="_blank">
                  {{ props.sourceRawData?.name }}
                </router-link>
              </td>
            </tr>

            <tr v-if="props.project">
              <td>Project</td>
              <td class="metadata">
                <router-link :to="`/projects/${props.project.id}`" target="_blank">
                  {{ props.project.name }}
                </router-link>
              </td>
            </tr>

            <tr v-if="props.sourceInstrument">
              <td>Source Instrument</td>
              <td class="metadata">
                {{ props.sourceInstrument.name }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </va-card-content>
  </va-card>
</template>

<script setup>
import config from '@/config'

const props = defineProps({
  ingestionSpace: {
    type: String,
  },
  ingestionDir: {
    type: Object,
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
  datasetId: {
    type: [String, Number],
  },
  // todo - get instrument from dataset
  instrument: {
    type: Object,
  },
})
</script>

<style scoped>
.metadata {
  white-space: pre-wrap;
  word-wrap: break-word;
  word-break: break-word;
}
</style>
