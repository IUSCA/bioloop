<template>
  <div>
    <va-alert
      v-for="(item, i) in props.dataset.action_items"
      :key="i"
      color="warning"
      icon="warning"
    >
      <template #title>
        <div v-if="item.title" class="va-title">
          {{ item.title }}
        </div>
      </template>

      <div class="flex items-center">
        <div class="flex-auto">
          {{ item.text }}
        </div>
        <va-button
          @click="
            router.push(`/datasets/${props.dataset.id}/actionItems/${item.id}`)
          "
        >
          Accept/Reject duplicate <i-mdi-arrow-right-bold-box-outline />
        </va-button>
      </div>
    </va-alert>
  </div>
</template>

<script setup>
const router = useRouter();

const props = defineProps({
  dataset: {
    type: Object,
    required: true,
  },
});
</script>

<style scoped></style>
