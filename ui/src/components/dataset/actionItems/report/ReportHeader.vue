<template>
  <va-card>
    <va-card-content>
      <div class="flex flex-col gap-3">
        <div>
          Original Dataset:
          <router-link
            :to="`/datasets/${props.actionItem.metadata.original_dataset_id}`"
            class="va-link"
            >#{{ props.actionItem.metadata.original_dataset_id }}</router-link
          >
        </div>
        <div>
          Incoming Duplicate:
          <router-link
            :to="`/datasets/${props.actionItem.dataset_id}`"
            class="va-link"
            >#{{ props.actionItem.dataset_id }}</router-link
          >
        </div>
      </div>
    </va-card-content>
  </va-card>
</template>

<script setup>
const props = defineProps({
  actionItem: { type: Object, required: true },
});
</script>

<style scoped></style>
