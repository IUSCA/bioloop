<template>
  <div class="va-table-responsive">
    <table class="va-table">
      <tbody>
        <tr>
          <td>Name</td>
          <td>{{ props.group.name }}</td>
        </tr>
        <tr>
          <td>Parent Group</td>
          <td>
            <router-link
              v-if="props.group.parent"
              :to="`/groups/${props.group.parent.id}`"
              class="text-primary hover:underline"
            >
              {{ props.group.parent.name }}
            </router-link>
          </td>
        </tr>
        <tr v-if="props.group.children && props.group.children.length > 0">
          <td>Child Groups</td>
          <td>
            <div class="flex flex-col gap-1">
              <router-link
                v-for="child in props.group.children"
                :key="child.id"
                :to="`/groups/${child.id}`"
                class="text-primary hover:underline"
              >
                {{ child.name }}
              </router-link>
            </div>
          </td>
        </tr>
        <tr>
          <td>Owner</td>
          <td>
            <span v-if="props.group.owner">
              {{ props.group.owner.name }} ({{ props.group.owner.username }})
            </span>
          </td>
        </tr>
        <tr>
          <td>Created</td>
          <td>
            <span class="spacing-wider">
              {{ datetime.absolute(props.group.created_at) }}
            </span>
          </td>
        </tr>
        <tr>
          <td>Last Updated</td>
          <td>
            <span class="spacing-wider">
              {{ datetime.absolute(props.group.updated_at) }}
            </span>
          </td>
        </tr>
        <tr>
          <td>Description</td>
          <td>
            <div class="max-h-[11.5rem] overflow-y-scroll">
              {{ props.group.description }}
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
import * as datetime from "@/services/datetime";

const props = defineProps({
  group: {
    type: Object,
    required: true,
  },
});
</script>

<style lang="scss" scoped>
div.va-table-responsive {
  overflow: auto;
}
</style>
