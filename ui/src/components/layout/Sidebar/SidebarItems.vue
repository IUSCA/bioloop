<template>
  <va-accordion>
    <template v-for="item in props.items">
      <!-- This sidebar menu item has nested sidebar menu items, some of whose corresponding
       features are enabled -->
      <va-collapse
        v-model="collapsibleStates"
        :key="item.title + '-collapse'"
        v-if="item.children && someChildFeaturesEnabled(item.children)"
      >
        <template #header="{ value: isCollapsed }">
          <va-sidebar-item
            :active="
              props.isActive(item.path) ||
              item.children.some((child) => props.isActive(child.path))
            "
            :to="item.path"
            v-if="isFeatureEnabledForRole(item.feature_key)"
          >
            <va-sidebar-item-content>
              <Icon :icon="item.icon" class="text-2xl" />
              <!-- User can hide item with css if they want -->
              <va-sidebar-item-title :data-testid="item.test_id">
                {{ item.title }}
              </va-sidebar-item-title>
              <va-icon :name="isCollapsed ? 'va-arrow-up' : 'va-arrow-down'" />
            </va-sidebar-item-content>
          </va-sidebar-item>
        </template>

        <template #body>
          <div v-for="child in item.children" :key="child.title">
            <va-sidebar-item
              class="ml-5"
              v-if="isFeatureEnabledForRole(child.feature_key)"
              :to="child.path"
              :active="props.isActive(child.path)"
            >
              <va-sidebar-item-content>
                <Icon :icon="child.icon" class="text-2xl" />
                <va-sidebar-item-title>{{ child.title }}</va-sidebar-item-title>
              </va-sidebar-item-content>
            </va-sidebar-item>
          </div>
        </template>
      </va-collapse>

      <!-- This sidebar menu item does not have any nested sidebar menu items, and it's
       corresponding feature is enabled for certain roles -->
      <va-sidebar-item
        v-else-if="
          isFeatureEnabledForRole(item.feature_key) &&
          (item.children || []).length === 0
        "
        :key="item.title"
        :to="item.path"
        :active="props.isActive(item.path)"
      >
        <va-sidebar-item-content>
          <Icon :icon="item.icon" class="text-2xl" />
          <!-- User can hide item with css if they want -->
          <va-sidebar-item-title :data-testid="item.test_id">
            {{ item.title }}
          </va-sidebar-item-title>
        </va-sidebar-item-content>
      </va-sidebar-item>
    </template>
  </va-accordion>
</template>

<script setup>
import config from "@/config";
import { useAuthStore } from "@/stores/auth";

const props = defineProps({
  items: { type: Array, required: true },
  isActive: { type: Function, required: true },
});

const auth = useAuthStore();
const route = useRoute();

const { hasRole } = auth;

const collapsibleStates = computed({
  get() {
    return props.items.some((item) => {
      return (item.children || []).some((child) => {
        return route.path.startsWith(child.path);
      });
    });
  },
  // eslint-disable-next-line no-unused-vars
  set(value) {},
});

const isFeatureEnabledForRole = (featureKey) => {
  if (!featureKey) {
    return true;
  }

  const featureEnabled = config.enabledFeatures[featureKey];
  if (featureEnabled === undefined) {
    // feature's enabled status is not present in the config
    return true;
  } else if (typeof featureEnabled === "boolean") {
    // feature is either enabled or disabled for all roles
    return featureEnabled;
  } else if (
    Array.isArray(featureEnabled.enabledForRoles) &&
    featureEnabled.enabledForRoles.length > 0
  ) {
    // feature is enabled for certain roles
    return featureEnabled.enabledForRoles.some((role) => hasRole(role));
  } else {
    // invalid config found for feature's enabled status
    return false;
  }
};

const someChildFeaturesEnabled = (features) => {
  return features.some((feature) => {
    return isFeatureEnabledForRole(feature.feature_key);
  });
};
</script>

<style scoped></style>
