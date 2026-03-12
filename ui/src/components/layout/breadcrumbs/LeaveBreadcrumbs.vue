<template>
  <!-- min height prevents the vertical layout shift-->
  <!-- min-h-[1.75rem] removed because  -->
  <!-- As breadcrumbs are not reset between page transitions, there is no vertical layout shift -->
  <va-breadcrumbs class="text-lg breadcrumbs">
    <va-breadcrumbs-item
      v-for="(item, index) in displayedBreadcrumbs"
      :key="`${item}-${index}`"
      :label="item.label"
      :to="item.to"
      :disabled="item.isEllipsis || index === displayedBreadcrumbs.length - 1"
      :title="item.originalLabel"
      class="flex items-center justify-center"
      :class="{
        'va-link':
          !item.isEllipsis && index !== displayedBreadcrumbs.length - 1,
      }"
    >
      <div v-if="!!item.icon">
        <Icon :icon="item.icon" class="text-xl" :aria-label="item.to" />
        <span class="sr-only">{{ item.to }}</span>
      </div>
    </va-breadcrumbs-item>
  </va-breadcrumbs>
</template>

<script setup>
import { useNavStore } from "@/stores/nav";
import { computed } from "vue";
import { useBreakpoint } from "vuestic-ui";

// const router = useRouter();
const nav = useNavStore();
const breakpoint = useBreakpoint();

// How many breadcrumb items to show per breakpoint (before collapsing)
const BREAKPOINT_MAX_BREADCRUMBS = {
  xs: 3,
  sm: 3,
  md: 4,
  lg: 5,
  xl: 6,
};

const maxBreadcrumbs = computed(
  () => BREAKPOINT_MAX_BREADCRUMBS[breakpoint.current] ?? 3,
);

const displayedBreadcrumbs = computed(() => {
  const crumbs = nav.breadcrumbs;
  const mapped = crumbs.map((item) => ({
    ...item,
    originalLabel: item.label,
  }));
  if (crumbs.length <= maxBreadcrumbs.value) return mapped;
  return [
    mapped[0],
    { label: "…", isEllipsis: true },
    mapped[crumbs.length - 2],
    mapped[crumbs.length - 1],
  ];
});

// router.beforeEach((to) => {
//   if (to?.meta?.nav) {
//     nav.setNavItems(to.meta.nav);
//   } else {
//     nav.resetNavItems();
//   }
// });
</script>

<style>
@media all and (max-width: 639px) {
  .breadcrumbs {
    padding-top: 0.25rem;
  }
}

.va-breadcrumbs__item:not(:last-child) {
  color: rgb(118, 124, 136);
}
</style>
