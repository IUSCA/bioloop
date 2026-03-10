<template>
  <div class="flex flex-col gap-4">
    <!-- Storage -->
    <div>
      <span class="text-xl font-bold block mb-1">RESOURCE USAGE</span>
      <Storage></Storage>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <!-- Raw Data Stats -->
      <div class="">
        <!-- <span class="text-xl font-bold block my-1">RAW DATA</span> -->
        <router-link to="/rawdata" class="va-link">
          <stats :data="raw_data_stats" title="RAW DATA"></stats>
        </router-link>
      </div>

      <!-- Data Product Stats -->
      <div class="">
        <!-- <span class="text-xl font-bold block my-1"> DATA PRODUCTS </span> -->
        <router-link to="/dataproducts" class="va-link">
          <stats :data="data_products_stats" title="DATA PRODUCTS"></stats>
        </router-link>
      </div>
    </div>
    <Tasks />
  </div>
</template>

<script setup>
import DatasetService from "@/services/dataset";
import toast from "@/services/toast";
import { useNavStore } from "@/stores/nav";

const nav = useNavStore();
nav.setNavItems([], false);

const raw_data_stats = ref({});
const data_products_stats = ref({});

DatasetService.getStats({ type: "RAW_DATA" })
  .then((res) => {
    raw_data_stats.value = res.data;
  })
  .catch((err) => {
    console.error(err);
    toast.error("Unable to fetch raw data stats");
  });

DatasetService.getStats({ type: "DATA_PRODUCT" })
  .then((res) => {
    data_products_stats.value = res.data;
  })
  .catch((err) => {
    console.error(err);
    toast.error("Unable to fetch data products stats");
  });
</script>

<route lang="yaml">
meta:
  title: Dashboard
</route>
