<template>
  <!-- <div
    class="flex items-start gap-2.5 rounded-lg border border-solid border-amber-200 bg-amber-50 px-3.5 py-3 dark:border-amber-800 dark:bg-amber-950"
  >
    <i-mdi-information-outline
      class="mt-px shrink-0 text-base text-amber-600 dark:text-amber-400"
    />
    <p class="text-sm leading-relaxed text-amber-800 dark:text-amber-200">
      {{ message }}
    </p>
  </div> -->
  <ModernAlert :title="message" color="amber"></ModernAlert>
</template>

<script setup>
const props = defineProps({
  subjectType: {
    type: String,
    required: true,
    validator: (v) => ["USER", "GROUP"].includes(v),
  },
  resourceType: {
    type: String,
    required: true,
    validator: (v) => ["DATASET", "COLLECTION"].includes(v),
  },
});

const MESSAGES = {
  USER: {
    DATASET:
      "This grant applies to the selected user only and covers this dataset exclusively.",
    COLLECTION:
      "This grant applies to the selected user only and extends to all datasets currently in this collection, as well as any added in the future.",
  },
  GROUP: {
    DATASET:
      "This grant applies to all current and future members of this group, including members inherited through subgroups, and covers this dataset exclusively.",
    COLLECTION:
      "This grant applies to all current and future members of this group, including members inherited through subgroups, and extends to all datasets currently in this collection, as well as any added in the future.",
  },
};

const message = computed(() => MESSAGES[props.subjectType][props.resourceType]);
</script>
