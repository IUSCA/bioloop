<template>
  <div class="grid grid-cols-1 gap-5">
    <div class="banner flex items-end">
      <h1 class="heading_text p-[20px] text-center text-gray-800">Bioloop</h1>
    </div>
    <!-- <div class="flex justify-center mt-10">
      <div class="max-w-xl drop-shadow-xl rounded-xl">
        <img src="/colorful_helix.jpg" />
      </div>
    </div> -->
    <!--  -->

    <va-card>
      <va-card-content>
        <div class="p-3">
          <span v-html="aboutHTML"></span>
        </div>
      </va-card-content>
    </va-card>

    <va-button class="flex-none" @click="showModal = true">Edit</va-button>
    <va-modal v-model="showModal" ok-text="Save">
      <div class="flex gap-2">
        <va-textarea class="flex-1" v-model="newText"></va-textarea>
        <va-textarea class="flex-1" />
      </div>
    </va-modal>
  </div>
</template>

<script setup>
import { useNavStore } from "@/stores/nav";
import aboutService from "@/services/about";
import { marked } from "https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js";

const nav = useNavStore();
nav.setNavItems([], false);

const showModal = ref(false);
const newText = ref("");
const currentText = ref("");
const aboutRecords = ref([]);

const aboutHTML = computed(() => {
  return marked.parse(currentText.value);
});

onMounted(() => {
  aboutService.getAll().then((res) => {
    currentText.value = res.data[res.data.length - 1].text;
    aboutRecords.value = res.data;
  });
});
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
