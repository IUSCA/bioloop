<template>
  <div class="grid grid-cols-6 lg:grid-cols-12 gap-1 lg:gap-3 items-center p-1">
    <div
      class="col-span-2 lg:col-span-6 flex flex-nowrap items-center gap-3 lg:gap-5"
    >
      <div class="flex flex-row items-center gap-4">
        <div class="md:mx-2">
          <GlobusShareStatusIcon
            :status="props.share?.globus_share.status"
            class="text-xl"
          />
        </div>

        <div class="flex flex-col">
          <span class="text-lg font-semibold capitalize"> Globus </span>
          <div class="flex text-sm gap-x-3">
            <div v-if="props.share?.user" class="grow">
              <span>
                Shared by: {{ props.share.user?.username }} ({{
                  props.share.user?.name
                }})
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
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
