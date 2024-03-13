<template>
  <va-card>
    <va-card-content>
      <div class="flex flex-col gap-3">
        <div>
          Original Dataset:
          <router-link
            :to="`/datasets/${props.actionItem.dataset_id}`"
            class="va-link"
            >#{{ props.actionItem.dataset_id }}</router-link
          >
        </div>
        <div>
          Incoming Duplicate:
          <router-link
            :to="`/datasets/${props.actionItem.metadata.duplicate_dataset_id}`"
            class="va-link"
            >#{{ props.actionItem.metadata.duplicate_dataset_id }}</router-link
          >
        </div>
      </div>
    </va-card-content>
  </va-card>
</template>

<script setup>
import * as datetime from "@/services/datetime";

const props = defineProps({
  actionItem: { type: Object, required: true },
});
</script>

<style scoped></style>
