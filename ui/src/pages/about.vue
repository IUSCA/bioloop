<template>
  <div class="grid grid-cols-1 gap-5">
    <div class="banner flex items-end">
      <h1 class="heading_text p-[20px] text-center text-gray-800">
        Center for Neuroimaging - Data Access Portal (CfN-DAP)
      </h1>
    </div>

    <div class="">
      <va-card>
        <va-card-content>
          <div class="p-3">
            <span class="text-lg">
              The Center for Neuroimaging (CfN) is dedicated to advancing the
              state of the art in research and clinical care of brain disorders
              through 1) utilizing advanced imaging technologies to understand
              brain structure and function, 2) investigating the influence of
              genetic variation on imaging phenotypes in health and illness as
              well as treatment response, 3) development, assessment, and
              validation of emerging imaging technologies and analytic
              approaches, and 4) provision of training and experience in
              structural, functional and molecular neuroimaging research. The
              CfN Data Access Portal (CfN-DAP) has been developed to facilitate
              this mission by enhancing data management capabilities using
              state-of-the-art web development tools.
            </span>
          </div>
        </va-card-content>
      </va-card>
    </div>
  </div>
</template>
<style scoped>
div.banner {
  height: 250px;
  background-image: linear-gradient(
      rgba(0, 0, 0, 0.3),
      rgba(255, 255, 255, 0.6)
    ),
    url("/cfndap.png");
  background-position: 30% 60%;
}
div.banner h1.heading_text {
  background-color: rgba(255, 255, 255, 0.5);
  font-weight: 500;
}
</style>

<route lang="yaml">
meta:
  title: Dashboard
  requiresAuth: false
</route>
