<template>
  <AutoComplete
    :data="datasets"
    filter-by="name"
    placeholder="Search datasets by name"
  >
    <template #filtered="{ item }">
      <div class="flex flex-auto">
        <div>
          <span> {{ item.name }} </span>
          <span class="va-text-secondary p-1"> &VerticalLine; </span>
          <span class="va-text-secondary text-sm"> {{ item.type }} </span>
        </div>

        <!-- size; place it to right -->
        <div class="text-right flex-auto">
          <span class="text-sm">
            {{ formatBytes(item.du_size) }}
          </span>
        </div>
      </div>
    </template>
  </AutoComplete>
</template>

<script setup>
import datasetService from "@/services/dataset";
import { formatBytes } from "@/services/utils";

const datasets = ref([]);

datasetService.getAll().then((res) => {
  datasets.value = res.data.datasets;
});
</script>
