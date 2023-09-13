<template>
  <div class="grid grid-cols-1 gap-5">
    <div class="banner flex items-end">
      <h1 class="heading_text p-[20px] text-center text-gray-800">
        Diagnostic Genomics Laboratory
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
          <div class="p-3">
            <span class="text-lg">
              The Diagnostic Genomics Laboratory at Indiana University School of
              Medicine is a newly established genomics laboratory under the
              auspices of the Genetic Testing Laboratories in the Department of
              Medical and Molecular Genetics Division of Diagnostic Genomics.
              The Diagnostic Genomics Laboratory provides competitive clinical
              somatic (cancer) and germline genomics testing services to IU
              Health and state of Indiana. Enabled by state-of-the-art next
              generation sequencing (NGS) technology and advanced bioinformatic
              infrastructure, the lab currently offers a disease-targeted NGS
              panel testing (somatic/cancer) for plasma cell myeloma (also known
              as multiple myeloma), and will soon be offering clinical genome
              and clinical exome diagnostic testing.
            </span>
          </div>
        </va-card-content>
      </va-card>
    </div>
  </div>
</template>

<script setup>
import { useNavStore } from "@/stores/nav";

const nav = useNavStore();

nav.setNavItems([], false);
</script>

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
