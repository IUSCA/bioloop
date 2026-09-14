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
  <ModernAlert :title="message" color="warning"></ModernAlert>
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

// Read by the person asking and by the admin granting, so it avoids words only one of them
// uses. @see docs/design/groups/ui-information-architecture.md — Access types in forms
const MESSAGES = {
  USER: {
    DATASET: "Applies to this person only, and to this dataset only.",
    COLLECTION:
      "Applies to this person only, and to every dataset in this collection, including datasets added later.",
  },
  GROUP: {
    DATASET:
      "Applies to everyone in this group, including members of its subgroups and people who join later, and to this dataset only.",
    COLLECTION:
      "Applies to everyone in this group, including members of its subgroups and people who join later, and to every dataset in this collection, including datasets added later.",
  },
};

const message = computed(() => MESSAGES[props.subjectType][props.resourceType]);
</script>
