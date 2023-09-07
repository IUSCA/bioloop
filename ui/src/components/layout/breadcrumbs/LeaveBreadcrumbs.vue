<template>
  <!-- min height prevents the vertical layout shift-->

  <va-breadcrumbs class="text-lg breadcrumbs min-h-[1.75rem]">
    <va-breadcrumbs-item
      v-for="(item, index) in nav.breadcrumbs"
      :key="`${item}-${index}`"
      :label="item.label"
      :to="item.to"
      :disabled="index === nav.breadcrumbs.length - 1"
    >
      <Icon :icon="item.icon" v-if="!!item.icon" />
    </va-breadcrumbs-item>
  </va-breadcrumbs>
</template>

<script setup>
import { useNavStore } from "@/stores/nav";

const router = useRouter();
const nav = useNavStore();

router.beforeEach((to) => {
  if (to?.meta?.nav) {
    nav.setNavItems(to.meta.nav);
  } else {
    nav.resetNavItems();
  }
});
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
