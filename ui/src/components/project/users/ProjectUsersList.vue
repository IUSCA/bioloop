<template>
  <va-list class="flex flex-col gap-3">
    <va-list-item v-for="(user, index) in props.users" :key="index" class="">
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
          {{ user.email }}
        </va-list-item-label>
      </va-list-item-section>

      <va-list-item-section v-if="user?.assigned_at && props.showAssignedDate">
        <va-list-item-label class="self-end">
          {{ datetime.date(user.assigned_at) }}
        </va-list-item-label>

        <va-list-item-label caption class="self-end">
          Access granted
        </va-list-item-label>
      </va-list-item-section>

      <va-list-item-section v-if="props.showRemove" class="flex-none">
        <va-button
          preset="secondary"
          icon="person_remove"
          color="danger"
          round
          @click="emit('remove', user)"
          class="self-end"
        />
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
  showRemove: {
    type: Boolean,
    default: false,
  },
  showAssignedDate: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["remove"]);

function initials(name) {
  const parts = (name || "").split(" ");
  if (parts.length == 1) return parts[0][0];
  else {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`;
  }
}
</script>
