<template>
  <div class="flex flex-col gap-2">
    <!-- derived dataset -->
    <div v-if="props.derived_datasets_meta?.length || 0 > 0">
      <va-card>
        <va-card-title>
          <span class="text-xl">Derived Datasets</span>
        </va-card-title>
        <va-card-content style="margin-top: -20px">
          <AssocDatasetList
            :dataset_ids="derived_datasets_meta.map((obj) => obj.derived_id)"
          ></AssocDatasetList>
        </va-card-content>
      </va-card>
    </div>

    <!-- source datasets -->
    <div v-if="props.source_datasets_meta?.length || 0 > 0">
      <va-card>
        <va-card-title>
          <span class="text-xl">Source Datasets</span>
        </va-card-title>
        <va-card-content style="margin-top: -20px">
          <AssocDatasetList
            :dataset_ids="source_datasets_meta.map((obj) => obj.source_id)"
          ></AssocDatasetList>
        </va-card-content>
      </va-card>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  source_datasets_meta: { type: Array, default: () => [] },
  derived_datasets_meta: { type: Array, default: () => [] },
});
</script>
