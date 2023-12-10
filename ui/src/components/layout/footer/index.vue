<template>
  <footer
    id="footer-v1"
    role="contentinfo"
    itemScope="itemscope"
    itemType="http://schema.org/CollegeOrUniversity"
    class="text-sm pb-3.5"
  >
    <!-- Primary divider -->
    <va-divider />

    <div class="flex flex-col text-center mt-3.5">
      <div>
        <FooterMobile v-if="ui.isMobileView" />
        <FooterDesktop v-else />
      </div>
    </div>
  </footer>
</template>

<script setup>
import { useUIStore } from "@/stores/ui";
import FooterDesktop from "@/components/layout/footer/FooterDesktop.vue";

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
}
</style>
