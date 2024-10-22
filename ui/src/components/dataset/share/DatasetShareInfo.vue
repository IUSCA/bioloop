<template>
  <div class="flex flex-row">
    <div class="text-lg font-semibold capitalize">
      <!--          <a :href="`/test`" target="_blank">test</a>-->
      <a
        :href="`${config.globus.collection_base_url}/${props.share?.source_collection_id}`"
        target="_blank"
        >{{ props.share?.source_collection_id }}</a
      >
    </div>
  </div>
</template>

<script setup>
import config from "@/config";

const props = defineProps({
  share: {
    type: Object,
    required: true,
  },
});

// add different kinds of shares to `datasetShares` array
const datasetShares = computed(() => [props.share]);
</script>

<style scoped></style>
