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
      <va-card-title>
        <div class="flex flex-nowrap items-center w-full">
          <span class="flex-auto text-lg">About</span>
          <AddEditButton
            class="flex-none"
            edit
            @click="showModal = true"
            v-if="auth.canAdmin"
          />
        </div>
      </va-card-title>
      <va-card-content>
        <va-inner-loading :loading="loading">
          <span v-html="currentAboutHTML"></span>
        </va-inner-loading>
      </va-card-content>
    </va-card>

    <!--    <va-button class="flex-none" @click="showModal = true">Edit</va-button>-->

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
          <div class="flex gap-2">
            <div class="flex-1 min-h-96">
              <va-textarea
                :resize="false"
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
import { useAuthStore } from "@/stores/auth";
import { htmlDecode } from "@/services/utils";

const md = new MarkdownIt();

const nav = useNavStore();
nav.setNavItems([], false);

const auth = useAuthStore();

const { validate } = useForm("aboutForm");

const showModal = ref(false);
const currentText = ref("");
const updatedText = ref("");
const aboutRecords = ref([]);
const latestRecord = ref({});
const loading = ref(false);

const currentAboutHTML = computed(() => {
  return DOMPurify.sanitize(md.render(currentText.value));
});
const updatedAboutHTML = computed(() => {
  return DOMPurify.sanitize(md.render(updatedText.value));
});

const submit = () => {
  if (!validate()) {
    return;
  }

  loading.value = true;
  aboutService
    .createOrUpdate({
      ...(latestRecord.value && { id: latestRecord.value.id }),
      data: { text: updatedText.value },
    })
    .then((res) => {
      latestRecord.value = res.data;
      showModal.value = false;
      toast.success("Updated About!");
    })
    .catch(() => {
      toast.error("Failed to update About");
    })
    .finally(() => {
      loading.value = false;
    });
};

const reset = () => {
  updatedText.value = currentText.value;
};

onMounted(() => {
  loading.value = true;
  aboutService
    .getAll()
    .then((res) => {
      aboutRecords.value = res.data;
      latestRecord.value =
        res.data.length > 0 ? res.data[res.data.length - 1] : undefined;
    })
    .catch(() => {
      toast.error("Failed to fetch About");
    })
    .finally(() => {
      loading.value = false;
    });
});

watch(latestRecord, () => {
  currentText.value = htmlDecode(latestRecord.value?.text || "");
  updatedText.value = htmlDecode(latestRecord.value?.text || "");
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
  title: About
</route>
