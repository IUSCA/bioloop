<script setup>
import DatasetService from "@/services/dataset";
const { id } = defineProps({ id: Number });
const metadata = ref({});
const isModalOpen = ref(false);

onMounted(async () => {
  metadata.value = {};

  await getMetadata()
});

const getMetadata = async () => {
  const { data } = await DatasetService.get_metadata(id);
  metadata.value = data;
};

const updatedMetadata = async() => {
  await getMetadata()
  isModalOpen.value = false;
};

</script>

<template>
  <div class="w-full p-2">

    <!-- Edit button -->
    <div class="flex justify-end">
      <AddEditButton class="flex-none" :edit="Object.keys(metadata).length !== 0" :add="Object.keys(metadata).length > 0" @click="isModalOpen = true" />
    </div>

    <!-- Display key pair values as table -->
    <table class="table">
      <tbody>
        <tr v-for="data in metadata" :key="data.id">
          <td class="font-bold text-right pr-4">{{ data?.keyword?.name }}</td>
          <td>{{ data.value }}</td>
        </tr>
      </tbody>
    </table>

    <va-modal hide-default-actions v-model="isModalOpen" @close="isModalOpen = false">
      <template #default>
        <div class="p-4">
          <EditDatasetMetadata :metadata="metadata" :id="id" @update="updatedMetadata" />
        </div>
      </template>
    </va-modal>

  </div>

</template>