<template>
  <div class="flex flex-col">
    <div class="flex justify-center mb-4">
      <FooterLogo />
    </div>

    <div class="mb-1"><FooterAccessibility /></div>

    <div class="my-1"><FooterPrivacy /></div>

    <div class="mt-1"><FooterCopyright /></div>
  </div>
</template>

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
</style>
