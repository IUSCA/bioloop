<template>
  <div class="flex flex-row">
    <div class="flex flex-row">
      <div
        class="col-span-2 lg:col-span-6 flex flex-nowrap items-center gap-3 lg:gap-5"
      >
        <GlobusShareIcon :status="props.share?.status" class="" />
        <div>Shared via: Globus</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import GlobusShareIcon from "@/components/dataset/share/globus/GlobusShareIcon.vue";

const props = defineProps({
  share: { type: Object, required: true },
});

// props.share.destination_share can be appended to `datasetShares` to include
// dataset's shares with multiple destination share
// const datasetShares = computed(() => [props.share.globus_share]);

onMounted(() => {
  console.log("Info Compact Mounted", props.share);
});
</script>

<style scoped></style>
