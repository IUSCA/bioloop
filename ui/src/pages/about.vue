<template>
  <div class="grid grid-cols-1 gap-5">
    <div class="banner flex items-end">
      <h1 class="heading_text p-[20px] text-center text-gray-800">
        <a
          href="https://cm.medicine.iu.edu/service-cores/facilities/proteomics"
          target="_blank"
        >
          Center for Proteome Analysis
        </a>
      </h1>
    </div>
    <!-- <div class="flex justify-center mt-10">
      <div class="max-w-xl drop-shadow-xl rounded-xl">
        <img src="/colorful_helix.jpg" />
      </div>
    </div> -->
    <!--  -->

    <div class="">
      <va-card>
        <va-card-content>
          <div class="p-3 flex flex-col gap-3">
            <p>
              The Center for Proteome Analysis at Indiana University School of
              Medicine provides protein and proteomic analysis services for
              protein identification, characterization, and quantification. The
              center encourages collaborations that apply the tools of
              proteomics to cutting-edge biomedical research.
            </p>

            <p>
              The Center for Proteome Analysis's vision is to deliver value to
              the scientific community as a world-class proteomics core lab
              providing services and collaborations to meet the critical needs
              of biomedical researchers in life sciences.
            </p>

            <p>
              The center's mission is to provide analytical resources for
              qualitative and quantitative analysis of macromolecules and to
              foster critical collaborations in proteomics and biomarker
              development.
            </p>
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
    url("/colorful_helix.jpg");
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
