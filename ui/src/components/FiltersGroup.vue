<template>
  <va-button-dropdown label="Filters" :close-on-content-click="false">
    <div class="flex flex-col gap-1">
      <va-checkbox
        v-model="checkboxes.deleted"
        label="Deleted"
        @update:model-value="handle_filters"
      />
      <va-checkbox
        v-model="checkboxes.saved"
        label="Saved"
        @update:model-value="handle_filters"
      />
      <va-checkbox
        v-model="checkboxes.processed"
        label="Processed"
        @update:model-value="handle_filters"
      />
      <va-checkbox
        v-model="checkboxes.unprocessed"
        label="Unprocessed"
        @update:model-value="handle_filters"
      />
    </div>
  </va-button-dropdown>
</template>

<script setup>
import { lxor } from "@/services/utils";

const emit = defineEmits(["update"]);

const checkboxes = ref({
  deleted: false,
  saved: false,
  unprocessed: false,
  processed: false,
});

function handle_filters() {
  const opts = checkboxes.value;
  const query = {
    deleted: lxor(opts.deleted, opts.saved) ? opts.deleted : null,
    processed: lxor(opts.unprocessed, opts.processed) ? opts.processed : null,
  };
  emit("update", query);
}
</script>
