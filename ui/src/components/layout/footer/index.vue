<template>
  <footer
    id="footer-v1"
    role="contentinfo"
    itemScope="itemscope"
    itemType="http://schema.org/CollegeOrUniversity"
    class="text-sm mb-10"
  >
    <va-divider />

    <div class="flex flex-col text-center">
      <div class="max-w-max flex flex-col content mb-1">
        <div class="max-w-max py-2.5">
          <p class="max-w-max">
            {{ config.appTitle }} is a service of the Indiana University
            <a href="https://sca.iu.edu" class="footer-link"
              >Scalable Compute Archive (IU SCA)</a
            >
            group.
          </p>
        </div>
        <div
          class="divider-secondary"
          role="separator"
          aria-orientation="horizontal"
          aria-hidden="true"
        />
      </div>

      <FooterMobile v-if="ui.isMobileView" />
      <div v-else class="large-container">
        <FooterLarge />
      </div>
    </div>
  </footer>
</template>

<script setup>
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
  /* Force a default size for ems */
  font-family: "BentonSansRegular", Arial, Helvetica, sans-serif;
  padding-left: 12.8px;
  padding-right: 12.8px;
}

.content {
  margin: auto;
}

.divider-secondary {
  border-top-width: var(--va-divider-line-width);
  border-top-color: var(--va-background-border);
  border-style: solid;
  margin-top: var(--va-divider-margin);
  margin-bottom: 1rem;
}
</style>
