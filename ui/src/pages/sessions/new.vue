<template>
  <va-alert
    color="warning"
    icon="warning"
    v-if="
      !isFeatureEnabled({
        featureKey: 'sessions',
        hasRole: auth.hasRole,
      })
    "
  >
    This feature is currently disabled
  </va-alert>

  <div v-else class="w-full flex justify-center">
    <va-card class="flex-auto md:max-w-5xl md:h-[calc(85vh)]">
      <va-card-content class="h-full">
        <CreateSessionStepper />
      </va-card-content>
    </va-card>
  </div>
</template>

<script setup>
import CreateSessionStepper from "@/components/sessions/CreateSessionStepper.vue";
import { isFeatureEnabled } from "@/services/utils";
import { useAuthStore } from "@/stores/auth";
import { useNavStore } from "@/stores/nav";

const nav = useNavStore();
const auth = useAuthStore();

nav.setNavItems([
  {
    label: "Sessions",
    to: "/sessions",
  },
  {
    label: "Create Session",
  },
]);
</script>

<route lang="yaml">
meta:
  title: Create Session
  requiresRoles: ["operator", "admin"]
</route>

