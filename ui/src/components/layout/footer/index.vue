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

    <div class="flex flex-wrap mt-3.5 gap-y-3">
      <div class="text-center">
        {{ config.appTitle }} is a service of the Indiana University

        <a href="https://sca.iu.edu" class="footer-link">
          Scalable Compute Archive (IU SCA)
        </a>
        group.
      </div>

      <div>
        <FooterMobile v-if="ui.isMobileView" />
        <FooterDesktop v-else />
      </div>
    </div>
  </footer>
</template>

<script setup>
import FooterDesktop from "@/components/layout/footer/FooterDesktop.vue";
import config from "@/config";
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
