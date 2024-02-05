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
          <span v-html="currentAboutHTML"></span>
        </div>
      </va-card-content>
    </va-card>

    <va-button class="flex-none" @click="showModal = true">Edit</va-button>
    <va-modal v-model="showModal" ok-text="Save">
      <va-form ref="aboutForm"></va-form>
      <div class="flex gap-2">
        <va-textarea class="flex-1" v-model="updatedText" :rules></va-textarea>
        <va-divider vertical />
        <!--        <va-textarea class="flex-1" v-model="updatedText"></va-textarea>-->
        <span class="flex-1" v-html="updatedAboutHTML"></span>
      </div>
    </va-modal>
  </div>
</template>

<script setup>
import { useNavStore } from "@/stores/nav";
import aboutService from "@/services/about";
import { marked } from "https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js";
import { useForm } from "vuestic-ui";
import DOMPurify from "dompurify";

const nav = useNavStore();
nav.setNavItems([], false);

useForm("aboutForm");

const showModal = ref(false);
const currentText = ref("");
const updatedText = ref("");
const aboutRecords = ref([]);

const currentAboutHTML = computed(() => {
  return marked.parse(currentText.value);
});
const updatedAboutHTML = computed(() => {
  let ret = DOMPurify.sanitize(marked.parse(updatedText.value));
  // debugger;
  return ret;
});

onMounted(() => {
  aboutService.getAll().then((res) => {
    const latestAboutText = res.data[res.data.length - 1].text;
    currentText.value = latestAboutText;
    updatedText.value = latestAboutText;
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
