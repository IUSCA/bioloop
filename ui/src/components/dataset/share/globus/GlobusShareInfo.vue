<template>
  <div class="">
    <a
      :href="`${config.globus.collection_base_url}/${props.share?.source_collection_id}`"
      target="_blank"
      >{{ props.share?.source_collection_id }}</a
    >
  </div>
</template>

<script setup>
import GlobusShareIcon from "@/components/dataset/share/globus/GlobusShareIcon.vue";
import config from "@/config";

const props = defineProps({
  share: {
    type: Object,
    required: true,
  },
});

onMounted(() => {
  console.log("Share Info mounted:", props.share);
});
</script>

<style scoped></style>
