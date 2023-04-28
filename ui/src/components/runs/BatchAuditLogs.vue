<template>
  <div>
    <table class="va-table">
      <thead>
        <tr>
          <th>Action</th>
          <th>Timestamp</th>
          <th>User</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="log in logs" :key="log.id">
          <td class="uppercase">{{ log.action }}</td>
          <td>{{ utc_date_to_local_tz(log.timestamp) }}</td>
          <td>
            <span class="">{{ log.user?.name }}</span>
            <span class="pl-1 va-text-secondary" v-if="log.user?.username">
              ({{ log.user?.username }})
            </span>
            <span>
              <va-chip
                class="ml-1"
                outline
                size="small"
                v-for="(role, i) in log.user?.roles || []"
                :key="i"
              >
                {{ role }}
              </va-chip>
            </span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
import { utc_date_to_local_tz } from "@/services/utils";
defineProps({
  logs: Object,
});
</script>
