<template>
  <va-card>
    <va-card-title>Import Details</va-card-title>
    <va-card-content>
      <div class="va-table-responsive">
        <table class="va-table w-full">
          <tbody>
            <tr>
              <td>Dataset Name</td>
              <td>
                <div v-if="props.dataset">
                  <div v-if="!auth.canOperate">
                    {{ props.dataset.name }}
                  </div>
                  <a v-else :href="`/datasets/${props.dataset.id}`">
                    {{ props.dataset.name }}
                  </a>
                </div>
                <DatasetNameInput
                  v-else
                  v-model:populated-dataset-name="datasetNameInput"
                  class="w-full"
                  :input-disabled="props.inputDisabled"
                  :show-dataset-name-error="props.showCreatedDatasetError"
                  :dataset-name-error="props.createdDatasetError"
                />
              </td>
            </tr>

            <tr>
              <td>Dataset Type</td>
              <td>
                <va-chip size="small" outline>
                  {{ props.datasetType }}
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
                <CopyText :text="props.importDir?.path" />
              </td>
            </tr>

            <tr>
              <td>Imported from</td>
              <td>
                <va-chip size="small" outline>
                  {{ props.importSpace }}
                </va-chip>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </va-card-content>
  </va-card>
</template>

<script setup>
import { useAuthStore } from "@/stores/auth";

const props = defineProps({
  // `dataset`: Dataset to be created
  dataset: {
    type: Object,
  },
  populatedDatasetName: {
    type: String,
    default: "",
  },
  importSpace: {
    type: String,
  },
  importDir: {
    type: Object,
    required: true,
  },
  datasetType: {
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
  createdDatasetError: {
    type: String,
    default: "",
  },
  showCreatedDatasetError: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["update:populatedDatasetName"]);

const auth = useAuthStore();

const datasetNameInput = computed({
  get() {
    return props.populatedDatasetName;
  },
  set(value) {
    emit("update:populatedDatasetName", value);
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
