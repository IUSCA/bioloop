<template>
  <div class="flex gap-3">
    <va-input
      v-model="path"
      label="Path"
      placeholder="Full path to the dataset"
      class="flex-1"
    />

    <va-button @click="loadFiles" class=""> Load </va-button>
  </div>

  <div>
    <div class="text-xl font-semibold my-3">
      Size: {{ formatBytes(size * 1024) }}
    </div>

    <ul>
      <li v-for="f in files" :key="f.name">
        {{ f.isDir ? "Directory" : "File" }} - {{ f.name }}
      </li>
    </ul>
  </div>
</template>

<script setup>
import dataImportService from "@/services/dataImport";
import { formatBytes } from "@/services/utils";

const path = ref("");
const files = ref([]);
const size = ref(0);

function loadFiles() {
  files.value = [];
  size.value = 0;

  dataImportService.listDir(path.value).then((res) => {
    files.value = res.data;
  });
  dataImportService.dirSize(path.value).then((res) => {
    console.log(res);
    size.value = res.data?.size;
  });
}
</script>

<route lang="yaml">
meta:
  title: Import Dataset
  nav: [{ label: "Import Dataset" }]
  requiresRoles: ["operator", "admin"]
</route>
