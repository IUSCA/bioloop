<template>
  <h2 class="text-4xl font-bold">Sequencing Runs</h2>

  <div>
    <va-data-table
      :items="row_items"
      :columns="columns"
      :hoverable="true"
      v-model:sort-by="sortBy"
      v-model:sorting-order="sortingOrder"
    >
      <template #cell(id)="{ value }">
        <router-link to="/workflow" class="va-link">{{ value }}</router-link>
      </template>
      <template #cell(status)="{ value }">
        <va-progress-circle
          class="mb-2"
          :thickness="0.1"
          :modelValue="JSON.parse(value)['progress']"
        >
          {{ JSON.parse(value)["completed"] }} /
          {{ JSON.parse(value)["steps"] }}
        </va-progress-circle>
      </template>
    </va-data-table>
  </div>
</template>

<script setup>
const workflows = [
  {
    _id: "1fc94ad2-ee78-4f6e-8757-2475c36d6950",
    start_date: "2023-01-11",
    last_updated: "2023-01-11",
    data_files: "182",
    size: "347 GB",
    steps: 5,
    completed: 5,
  },
];

const row_items = ref(
  workflows.map((p) => {
    return {
      id: p["_id"],
      start_date: p["start_date"],
      last_updated: p["last_updated"],
      data_files: p["data_files"],
      size: p["size"],
      status: JSON.stringify({
        progress: (100 * p["completed"]) / p["steps"],
        steps: p["steps"],
        completed: p["completed"],
      }),
    };
  })
);

const columns = ref([
  { key: "id", sortable: true, sortingOptions: ["desc", "asc", null] },
  {
    key: "start_date",
    sortable: true,
    sortingOptions: ["desc", "asc", null],
  },
  {
    key: "last_updated",
    sortable: true,
    sortingOptions: ["desc", "asc", null],
  },
  { key: "status", sortable: false },
  { key: "data_files", sortable: true, sortingOptions: ["desc", "asc", null] },
  {
    key: "size",
    sortable: true,
    sortingOptions: ["desc", "asc", null],
    width: 80,
  },
]);

// initial sorting order
const sortBy = ref("start_date");
const sortingOrder = ref("desc");
</script>
