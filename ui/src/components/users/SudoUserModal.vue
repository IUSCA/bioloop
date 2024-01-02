<template>
  <va-modal
    v-model="visible"
    title="Log in as this user?"
    no-outside-dismiss
    fixed-layout
    okText="Confirm"
    @ok="handleOk"
    @cancel="hide"
  >
    <va-inner-loading :loading="loading">
      <div class="flex flex-col gap-3">
        <span>
          Are you sure you want to log in as
          <span class="font-bold"> {{ props.user.name }} </span> ? You will need
          to completely log out to revert this change.
        </span>
      </div>
    </va-inner-loading>
  </va-modal>
</template>

<script setup>
import toast from "@/services/toast";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();

const props = defineProps(["user"]);

// parent component can invoke these methods through the template ref
defineExpose({
  show,
  hide,
});

const visible = ref(false);
const loading = ref(false);

function hide() {
  loading.value = false;
  visible.value = false;
}

function show() {
  visible.value = true;
}

function handleOk() {
  loading.value = true;
  const username = props.user.username;

  auth
    .spoof(username)
    .catch((err) => {
      console.error(err);
      toast.error("Unable to login as user");
    })
    .finally(() => {
      hide();
    });
}
</script>
