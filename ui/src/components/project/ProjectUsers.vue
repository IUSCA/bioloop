<template>
  <va-list class="flex flex-col gap-3">
    <va-list-item v-for="(user, index) in data" :key="index" class="">
      <va-list-item-section avatar>
        <va-avatar :color="stringToRGB(user.name || '')" size="small">
          <span class="text-sm uppercase">{{ initials(user.name) }}</span>
        </va-avatar>
      </va-list-item-section>

      <va-list-item-section>
        <va-list-item-label>
          {{ user.name }}
        </va-list-item-label>

        <va-list-item-label caption>
          since {{ datetime.date(user.assigned_at) }}
        </va-list-item-label>
      </va-list-item-section>

      <va-list-item-section>
        <va-list-item-label>
          <span> {{ user.email }} </span>
        </va-list-item-label>
        <va-list-item-label caption> &nbsp; </va-list-item-label>
      </va-list-item-section>
    </va-list-item>
  </va-list>
</template>

<script setup>
import { stringToRGB } from "@/services/colors";
import * as datetime from "@/services/datetime";

const props = defineProps({
  users: {
    type: Array,
    default: () => [],
  },
});

const data = computed(() => {
  return props.users.map((obj) => ({
    ...obj.user,
    assigned_at: obj.assigned_at,
  }));
});

function initials(name) {
  const parts = (name || "").split(" ");
  if (parts.length == 1) return parts[0][0];
  else {
    console.log(parts);
    return `${parts[0][0]}${parts[parts.length - 1][0]}`;
  }
}
</script>
