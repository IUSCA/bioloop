<template>
  <footer
    id="footer-v1"
    role="contentinfo"
    itemScope="itemscope"
    itemType="http://schema.org/CollegeOrUniversity"
    class="text-sm mb-10"
  >
    <!-- Primary divider -->
    <va-divider />

    <div class="flex flex-col text-center">
      <div class="max-w-max flex flex-col m-auto mb-5">
        <div class="max-w-max py-0">
          <p class="max-w-max">
            {{ config.appTitle }} is a service of the Indiana University
            <a href="https://sca.iu.edu" class="footer-link"
              >Scalable Compute Archive (IU SCA)</a
            >
            group.
          </p>
        </div>

        <!-- Secondary divider -->
        <va-divider />
      </div>

      <div>
        <FooterMobile v-if="ui.isMobileView" />
        <FooterDesktop v-else />
      </div>
    </div>
  </footer>
</template>

<script setup>
import config from "@/config";
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
