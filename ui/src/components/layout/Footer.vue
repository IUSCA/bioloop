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
            <a href="https://sca.iu.edu">Scalable Compute Archive (IU SCA)</a>
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
      <FooterLarge v-else />
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
  border-top-color: #3d4c58;
  border-style: solid;
  margin-top: var(--va-divider-margin);
  margin-bottom: 1rem;
}

#footer-v1 p {
  /* 11px (11/16) */
}

#footer-v1 a {
  color: #7d110c;
  font-family: inherit;
  text-decoration: none;
}

#footer-v1 a:hover {
  text-decoration: underline;
}

.icon_container__mobile {
  max-width: 24px;
}
</style>
