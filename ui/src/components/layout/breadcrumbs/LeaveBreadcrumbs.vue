<template>
  <!-- min height prevents the vertical layout shift-->
  <!-- min-h-[1.75rem] removed because  -->
  <!-- As breadcrumbs are not reset between page transitions, there is no vertical layout shift -->
  <va-breadcrumbs class="text-lg breadcrumbs">
    <va-breadcrumbs-item
      v-for="(item, index) in nav.breadcrumbs"
      :key="`${item}-${index}`"
      :label="item.label"
      :to="item.to"
      :disabled="index === nav.breadcrumbs.length - 1"
      class="flex items-center justify-center"
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

// const router = useRouter();
const nav = useNavStore();

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
