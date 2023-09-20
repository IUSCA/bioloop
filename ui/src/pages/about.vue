<template>
  <div class="grid grid-cols-1 gap-5">
    <div class="banner flex items-end">
      <h1 class="heading_text p-[20px] text-center text-gray-800">
        Bioloop
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
            <div class="text-lg">
              This instance of <a href="https://github.com/IUSCA/bioloop/issues">Bioloop</a> is being run by:  
          </div>
            <div class="text-lg">
              For questions or support, please contact the primary operator:  
          </div>
          <div class="text-lg">
              Bioloop is a web-based portal to simplify the management of large-scale datasets shared among research teams in scientific domains. This platform optimizes data handling by effectively utilizing both cold and hot storage solutions, like tape and disk storage, to reduce overall storage costs.
            </div>
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
