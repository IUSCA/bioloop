<template>
  <!-- Only shown if there is at least one dismissed alert -->
  <va-menu
    v-if="dismissedAlerts.length > 0"
    placement="left-bottom"
  >
    <template #anchor>
      <va-badge :offset="[-3, 10]" :text="activeAlerts.length" overlap>
        <va-button class="alert-bell" plain>
          <Icon icon="mdi-alert-outline" height="36px" width="36px" />
        </va-button>
      </va-badge>
    </template>

    <div class="max-w-md max-h-96 overflow-y-auto" style="min-width: 300px">
      <va-menu-item v-for="alert in activeAlerts" :key="alert.id">
        <Alert
          :key="alert.id"
          :alert="alert"
          :dismissable="false"
        />
      </va-menu-item>
    </div>
  </va-menu>
</template>

<script setup>
import { useAlertStore } from "@/stores/alert";

const alertStore = useAlertStore();

const { getDismissedAlerts } = alertStore;

const activeAlerts = computed(() => alertStore.alerts);
const dismissedAlerts = computed(() => getDismissedAlerts());
</script>

<style scoped>
.alert-bell {
  color: var(--va-text-primary) !important;
}
</style>
