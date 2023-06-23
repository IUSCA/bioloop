<template>
  <va-data-table :items="rows" :columns="columns">
    <template #cell(assigned_at)="{ value }">
      <span>{{ moment(value).utc().format("YYYY-MM-DD") }}</span>
    </template>
  </va-data-table>
</template>

<script setup>
import moment from "moment";
const props = defineProps({
  users: {
    type: Array,
    default: () => [],
  },
});

const rows = computed(() => {
  return props.users.map((obj) => ({
    id: obj.user.id,
    name: obj.user.name,
    username: obj.user.username,
    email: obj.user.email,
    assigned_at: obj.assigned_at,
  }));
});

const columns = [
  { key: "name", sortable: true },
  { key: "username", sortable: true },
  { key: "email", sortable: true },
  { key: "assigned_at", sortable: true, label: "assigned on" },
];
</script>
