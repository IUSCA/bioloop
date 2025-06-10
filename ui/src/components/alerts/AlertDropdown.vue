<template>
  <va-menu placement="left-bottom">
    <template #anchor>
      <va-badge
        :offset="[-3, 10]"
        :text="`${activeAlerts.length > 0 ? activeAlerts.length : ''}`"
        overlap
      >
        <va-button class="alert-bell" plain>
          <Icon icon="mdi-info-outline" height="36px" width="36px" />
        </va-button>
      </va-badge>
    </template>

    <div class="max-w-md max-h-96 overflow-y-auto" style="min-width: 300px">
      <va-menu-item v-if="activeAlerts.length === 0">
        No active alerts
      </va-menu-item>

      <template v-else>
        <va-menu-item v-for="alert in activeAlerts" :key="alert.id">
          <div class="flex items-center">
            <Icon
              :icon="'mdi-' + alertService.getAlertIcon(alert.type)"
              :color="alertService.getAlertColor(alert.type)"
              class="mr-2"
              height="24px"
              width="24px"
            />
            <div class="flex-grow">
              <div class="font-bold">{{ alert.label }}</div>
              <div class="text-sm">{{ alert.message }}</div>
            </div>
          </div>
        </va-menu-item>
      </template>
    </div>
  </va-menu>
</template>

<script setup>
import { useAlertStore } from "@/stores/alert";
import alertService from "@/services/alert";

const alertStore = useAlertStore();

const activeAlerts = computed(() => alertStore.alerts);

onMounted(() => {
  alertStore.fetchAlerts();
});
</script>

<style lang="scss" scoped>
.alert-bell {
  color: var(--va-text-primary) !important;
}
</style>
