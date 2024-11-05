<template>
  <va-list
    :class="['grid', 'gap-3', props.wrap ? 'grid-cols-2' : 'grid-cols-1']"
  >
    <va-list-item v-for="(user, index) in props.users" :key="index" class="">
      <va-list-item-section avatar>
        <UserAvatar :username="user?.username" :name="user?.name" />
      </va-list-item-section>

      <va-list-item-section>
        <va-list-item-label>
          {{ user.name }}
        </va-list-item-label>

        <va-list-item-label caption>
          {{ user.email }}
        </va-list-item-label>
      </va-list-item-section>

      <va-list-item-section v-if="user?.assigned_at && props.showAssignData">
        <va-list-item-label class="self-end">
          <span v-if="user?.assignor" class="text-sm">
            by
            <span class="font-semibold">
              {{ user.assignor.username }}
            </span>
          </span>
          <span v-else> Assigned </span>
        </va-list-item-label>

        <va-list-item-label caption class="self-end">
          <span> on {{ datetime.date(user.assigned_at) }} </span>
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
  showAssignData: {
    type: Boolean,
    default: false,
  },
  wrap: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["remove"]);
</script>
