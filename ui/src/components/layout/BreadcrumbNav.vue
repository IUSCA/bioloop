<template>
  <va-breadcrumbs
    v-if="showBreadcrumbNav"
    :class="ui.isMobileView ? 'text-sm' : 'text-xl'"
  >
    <va-breadcrumbs-item
      v-for="(item, index) in breadcrumbs"
      :key="`${item}-${index}`"
      :label="item.label"
      :to="item.to"
      :disabled="index === breadcrumbs.length - 1"
    >
      <Icon :icon="item.icon" v-if="!!item.icon" />
    </va-breadcrumbs-item>
  </va-breadcrumbs>
  <va-divider v-if="showBreadcrumbNav" />
</template>

<script setup>
import { useBreadcrumbsStore } from "@/stores/breadcrumbs";
import { useUIStore } from "@/stores/ui";

const route = useRoute();
const breadcrumbsStore = useBreadcrumbsStore();
const ui = useUIStore();

let showBreadcrumbNav = ref(true);

const breadcrumbs = computed(() => {
  return breadcrumbsStore.breadcrumbNavItems;
});

onMounted(() => {
  showBreadcrumbNav.value = shouldShowBreadcrumbs(route.path);
});

watch(
  () => route.path,
  () => {
    showBreadcrumbNav.value = shouldShowBreadcrumbs(route.path);
  }
);

const shouldShowBreadcrumbs = (path) => {
  return path !== "/dashboard";
};
</script>
