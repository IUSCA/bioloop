<template>
  <footer
    class="institution-footer mt-[40px]"
    id="footer-v1"
    role="contentinfo"
    itemScope="itemscope"
    itemType="http://schema.org/CollegeOrUniversity"
  >
    <div class="flex flex-row justify-around mx-20">
      <div cols="12" lg="3" class="signature text-center text-lg-left">
        <a
          href="https://www.iu.edu"
          class="signature-link signature-img external"
        >
          <img
            src="@/assets/iu-sig.2x.png"
            width="236"
            height="36"
            alt="Indiana University"
          />
        </a>
      </div>

      <div cols="12" lg="7" class="text-center text-lg-right">
        <p class="copyright">
          <span class="line-break">
            <a
              id="accessibility-link"
              href="https://accessibility.iu.edu/assistance"
              title="Having trouble accessing this web page content? Please visit this page for assistance."
              class="external"
            >
              Accessibility
            </a>
            |
            <a id="privacy-policy-link" href="https://www.iu.edu/privacy">
              Privacy Notice
            </a>
          </span>
          <span class="hide-on-mobile"> | </span>
          <a href="https://www.iu.edu/copyright/index.html" class="external">
            Copyright
          </a>

          ©{{ new Date().getFullYear() }}
          <span class="line-break-small">
            The Trustees of
            <a href="https://www.iu.edu/" itemprop="url" class="external">
              <span itemprop="name">Indiana University</span>
            </a>
          </span>
        </p>

        <p class="copyright">
          CMG-SCA is a service of the Indiana University
          <a href="https://sca.iu.edu">Scalable Compute Archive (IU SCA)</a>
          group.
        </p>
      </div>
    </div>
  </footer>
</template>

<style scoped>
#footer-v1 {
  clear: both;
}

#footer-v1 * {
  -webkit-box-sizing: border-box;
  -moz-box-sizing: border-box;
  box-sizing: border-box;
}

#footer-v1 {
  background: #fff;
  font-size: 16px;
  /* Force a default size for ems */
  font-family: "BentonSansRegular", Arial, Helvetica, sans-serif;
  margin: 0 0 0 0;
  padding: 0 0 20px 0;
  text-align: center;
}

#footer-v1 .wrapper {
  position: static;
  width: 100%;
}

#footer-v1 .wrapper:after {
  content: "";
  display: table;
  clear: both;
}

#footer-v1 .tagline {
  background: #7a1705;
  color: #fff;
  font-family: "BentonSansCondBold", "Arial Narrow", Arial, Helvetica,
    sans-serif;
  font-size: 1.125em;
  /* 18px (18/16) */
  letter-spacing: 0.2em;
  line-height: 1em;
  /* 18px (18/18) */
  margin: 0 auto 0.55558em auto;
  padding: 5px;
  text-align: center;
  text-transform: uppercase;
  vertical-align: bottom;
  width: 100%;
}

#footer-v1 .tagline span {
  font-family: GeorgiaProItalic, Georgia, serif;
  font-size: 0.7778em;
  /* 14px (14/18) */
  text-transform: lowercase;
  letter-spacing: 0;
  display: inline-block;
  margin-left: -4px;
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

#footer-v1 .internal {
  margin: 0 0 15px 0;
}

#footer-v1 .copyright {
  margin: 0;
}

#footer-v1 .block-iu {
  display: block;
  height: 26px;
  margin: 0 auto 5px auto;
  width: 22px;
}

/* 768px (768/16) */
@media screen and (min-width: 40em) {
  #footer-v1 {
    border-top: 6px solid #7a1705;
    padding: 40px 0 30px 0;
    position: relative;
    text-align: left;
    z-index: 1;
  }

  #footer-v1 .wrapper {
    position: absolute;
    width: 100%;
    top: -26px;
  }

  #footer-v1 .tagline {
    background: #7a1705;
    color: #fff;
    font-family: "BentonSansCondBold", "Arial Narrow", Arial, Helvetica,
      sans-serif;
    font-size: 1.5em;
    /* 18px (18/16) */
    letter-spacing: 0.2em;
    line-height: 1em;
    /* 18px (18/18) */
    margin: 0 auto;
    padding: 5px;
    text-transform: uppercase;
    vertical-align: bottom;
    text-align: center;
    /* Positioning */
    padding: 8px 20px 8px 24px;
    width: 15.85em;
  }

  #footer-v1 .tagline span {
    font-size: 0.6667em;
    /* 16px (16/14) */
  }

  #footer-v1 .copyright {
    overflow: hidden;
    padding: 7px 0 0 0;
    position: relative;
  }

  #footer-v1 .internal {
    position: absolute;
    right: 10px;
    top: 7px;
    z-index: 1;
  }

  #footer-v1 .block-iu {
    float: left;
    margin: -7px 9px 0 0;
  }
}
</style>
