<template>
  <va-breadcrumbs v-if="showBreadcrumbNav">
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

const route = useRoute();
const breadcrumbsStore = useBreadcrumbsStore();
let showBreadcrumbNav = ref(true);

const breadcrumbs = computed(() => {
  return breadcrumbsStore.breadcrumbsToRender;
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
