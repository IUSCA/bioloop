<template>
  <footer
    id="footer-v1"
    itemScope="itemscope"
    itemType="http://schema.org/CollegeOrUniversity"
    class="text-sm pb-3.5"
  >
    <!-- Primary divider -->
    <va-divider class="my-0" />

    <div class="mt-5">
      <FooterMobile v-if="ui.isMobileView" />
      <FooterDesktop v-else />
    </div>
  </footer>
</template>

<script setup>
import FooterDesktop from "@/components/layout/footer/FooterDesktop.vue";
import { useUIStore } from "@/stores/ui";

const ui = useUIStore();
</script>

<style lang="scss" scoped>
#footer-v1 * {
  -webkit-box-sizing: border-box;
  -moz-box-sizing: border-box;
  box-sizing: border-box;
}

#footer-v1 {
  font-family: "BentonSansRegular", Arial, Helvetica, sans-serif;
  padding-left: 12.8px;
  padding-right: 12.8px;
  padding-bottom: 22px;
}
</style>
