<template>
  <va-data-table :columns="columns" :items="rows" :loading="loading">
    <template #cell(sourceCollection)="{ rowData }">
      <a
        :href="`${config.globus.collection_base_url}/${rowData?.sourceCollection?.id}`"
        :target="logRowData(rowData)"
        >{{ rowData?.sourceCollection?.display_name }}</a
      ></template
    >
    <template #cell(destinationCollection)="{ rowData }">
      <a
        :href="`${config.globus.collection_base_url}/${rowData?.destinationCollection?.id}`"
        target="_blank"
        >{{ rowData?.destinationCollection?.display_name }}</a
      ></template
    >
  </va-data-table>
</template>

<script setup>
import config from "@/config";
import globusTransferService from "@/services/globus/transfer";

const logRowData = (rowData) => {
  console.log("row:", rowData);
  return "_blank";
};

const props = defineProps({
  globusShare: {
    type: Object,
    required: true,
  },
  sourceFilePath: {
    type: String,
    required: true,
  },
  destinationFilePath: {
    type: String,
    required: true,
  },
});

const rows = ref([]);
const loading = ref(false);
const sourceCollection = ref(null);
const destinationCollection = ref(null);

const columns = [
  {
    label: "Source Collection",
    key: "sourceCollection",
    width: "300px",
    thAlign: "left",
    tdAlign: "left",
  },
  {
    label: "Source File Path",
    key: "sourceFilePath",
    width: "300",
    thAlign: "center",
    tdAlign: "center",
    tdStyle:
      "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
  },
  {
    label: "Destination Collection",
    key: "destinationCollection",
    width: "300px",
    thAlign: "center",
    tdAlign: "center",
  },
  {
    label: "Destination File Path",
    key: "destinationFilePath",
    width: "300px",
    thAlign: "center",
    tdAlign: "center",
    tdStyle:
      "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
  },
];

onMounted(() => {
  const sourceCollectionPromise = globusTransferService.getEndpointById(
    props.globusShare.source_collection_id,
  );
  const destinationCollectionPromise = globusTransferService.getEndpointById(
    props.globusShare.destination_collection_id,
  );

  loading.value = true;
  Promise.all([sourceCollectionPromise, destinationCollectionPromise])
    .then(([res1, res2]) => {
      sourceCollection.value = res1.data;
      destinationCollection.value = res2.data;

      rows.value = [
        {
          sourceCollection: sourceCollection.value,
          sourceFilePath: props.sourceFilePath,
          destinationCollection: destinationCollection.value,
          destinationFilePath: props.destinationFilePath,
        },
      ];
    })
    .catch((err) => {
      console.error(err);
    })
    .finally(() => {
      loading.value = false;
    });
});
</script>

<style scoped></style>
