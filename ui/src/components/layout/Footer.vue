<template>
  <footer
    id="footer-v1"
    role="contentinfo"
    itemScope="itemscope"
    itemType="http://schema.org/CollegeOrUniversity"
    class="text-sm"
  >
    <div class="flex flex-row">
      <div class="flex align-center justify-end mr-2.5">
        <a class="max-w-max" href="https://www.iu.edu">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
          >
            <polygon
              fill="currentColor"
              points="15.3 3.19 15.3 5 16.55 5 16.55 15.07 13.9 15.07 13.9 1.81 15.31 1.81 15.31 0 8.72 0 8.72 1.81 10.12 1.81 10.12 15.07 7.45 15.07 7.45 5 8.7 5 8.7 3.19 2.5 3.19 2.5 5 3.9 5 3.9 16.66 6.18 18.98 10.12 18.98 10.12 21.67 8.72 21.67 8.72 24 15.3 24 15.3 21.67 13.9 21.67 13.9 18.98 17.82 18.98 20.09 16.66 20.09 5 21.5 5 21.5 3.19 15.3 3.19"
            />
          </svg>
        </a>
      </div>

      <div class="flex align-center max-w-max mx-2.5">
        <a
          id="accessibility-link"
          href="https://accessibility.iu.edu/assistance"
          title="Having trouble accessing this web page content? Please visit this page for assistance."
        >
          Accessibility
        </a>
      </div>

      <div class="flex align-center max-w-max mx-2.5">
        <a id="privacy-policy-link" href="https://www.iu.edu/privacy">
          Privacy Notice
        </a>
      </div>

      <div class="flex align-center max-w-max ml-2.5">
        <span>
          <a href="https://www.iu.edu/copyright/index.html">Copyright </a>
          ©{{ new Date().getFullYear() }} The Trustees of
          <a href="https://www.iu.edu/" itemprop="url">
            <span itemprop="name">Indiana University</span>
          </a>
        </span>
      </div>

      <!--        <p class="copyright">-->
      <!--          {{ config.appTitle }} is a service of the Indiana University-->
      <!--          <a href="https://sca.iu.edu">Scalable Compute Archive (IU SCA)</a>-->
      <!--          group.-->
      <!--        </p>-->
    </div>
  </footer>
</template>

<style scoped>
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

#footer-v1 div {
  height: 57px;
}

#footer-v1 p {
  font-size: 0.6875em;
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

@media screen and (min-width: 40em) {
  #footer-v1 {
    border-top: 1px solid #7a1705;
  }
}
</style>
