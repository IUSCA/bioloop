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
        <va-inner-loading :loading="loading">
          <!--          <div class="p-3">-->
          <span v-html="currentAboutHTML"></span>
          <!--          </div>-->
        </va-inner-loading>
      </va-card-content>
    </va-card>

    <va-button class="flex-none" @click="showModal = true">Edit</va-button>

    <div class="max-h-screen">
      <va-form ref="aboutForm">
        <va-modal
          size="medium"
          title="Edit About"
          v-model="showModal"
          ok-text="Save"
          @ok="submit"
          @before-close="reset"
          no-dismiss
        >
          <va-inner-loading :loading="loading">
            <div class="flex gap-2">
              <div class="flex-1">
                <va-textarea
                  class="w-full h-full"
                  v-model="updatedText"
                  :rules="[(v) => (v && v.length > 0) || 'Required']"
                ></va-textarea>
              </div>
              <va-divider class="flex-none" vertical />
              <div class="flex-1 break-words">
                <div v-html="updatedAboutHTML"></div>
              </div>
            </div>
          </va-inner-loading>
        </va-modal>
      </va-form>
    </div>
  </div>
</template>

<script setup>
import { useNavStore } from "@/stores/nav";
import aboutService from "@/services/about";
import MarkdownIt from "markdown-it";
import { useForm } from "vuestic-ui";
import DOMPurify from "dompurify";
import toast from "@/services/toast";

const md = new MarkdownIt();

const nav = useNavStore();
nav.setNavItems([], false);

const { validate } = useForm("aboutForm");
// const aboutModal = ref(null);

const showModal = ref(false);
const currentText = ref("");
const updatedText = ref("");
const aboutRecords = ref([]);
const loading = ref(false);
// const updateSucceeded = ref(true);

const currentAboutHTML = computed(() => {
  // return DOMPurify.sanitize(marked.parse(currentText.value));
  return DOMPurify.sanitize(md.render(currentText.value));
});
const updatedAboutHTML = computed(() => {
  let ret = DOMPurify.sanitize(md.render(updatedText.value));
  // debugger;
  return ret;
});

// const beforeOk = (hide) => {
//   console.log("beforeOk");
//   debugger;
//   validate();
//   console.log(`isValid.value: ${isValid.value}`);
//   if (isValid.value) {
//     aboutModal.value.hide();
//   }
// };

const submit = () => {
  if (!validate()) {
    return;
  }

  // console.log(`isValid: ${isValid.value}`);

  loading.value = true;
  aboutService
    .create({ text: updatedText.value })
    .then((res) => {
      console.log(res);
      updatedText.value = res.data.text;
      currentText.value = res.data.text;
      loading.value = false;
      showModal.value = false;
      toast.success("Update About!");
    })
    .catch((err) => {
      console.log(err);
      toast.error("Failed to update About");
    });
};

const reset = () => {
  updatedText.value = currentText.value;
};

// const isFormValid = () => {
//   // validate();
//   debugger;
//   return isValid.value;
// };

// watch(showModal, (val) => {
//   debugger;
//   console.log(showModal.value);
// });

onMounted(() => {
  loading.value = true;
  aboutService.getAll().then((res) => {
    const latestAboutText =
      res.data.length > 0 ? res.data[res.data.length - 1].text : "";
    currentText.value = latestAboutText;
    updatedText.value = latestAboutText;
    aboutRecords.value = res.data;
    loading.value = false;
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
</route>
