<template>
  <va-modal
    v-model="deleting"
    title="Delete user?"
    no-outside-dismiss
    fixed-layout
    okText="Confirm"
    @ok="confirmDelete"
    @cancel="close"
  >
    <va-inner-loading :loading="loading">
      <div class="flex flex-col gap-3">
        <span>
          Are you sure you want to delete the user record of
          <span class="font-bold"> {{ props.user.name }} </span> completely?
        </span>
      </div>
    </va-inner-loading>
  </va-modal>
</template>

<script setup>
import toast from "@/services/toast";
import UserService from "@/services/user";
import { defineEmits } from 'vue';

const emit = defineEmits(['user-deleted']);
const props = defineProps(["user"]);
const data_loading = ref(false);
const users = ref([]);
const deleting = ref(false);
const loading = ref(false);

defineExpose({
  show,
  close,
});

function close() {
  loading.value = false;
  deleting.value = false;
}

function show() {
  deleting.value = true;
  //data_loading.value = a;
  //users.value = b;
}

/*
function confirmDelete() {
  loading.value = true;
  const username = props.user.username;

  UserService.deleteUser(username)
    .then(() => {
      UserService.fetch_all_users(data_loading, users); // gets called but not working
      toast.success("User record deleted successfully"); 
    })
    .catch((err) => {
      console.error(err); 
      toast.error("Unable to delete user record"); 
    })
    .finally(() => {
      close();
    });
}
*/

async function confirmDelete() {
    loading.value = true;
    console.log('Starting deletion of user:', props.user.username);

    try {
        await UserService.deleteUser(props.user.username);
        console.log('Deletion successful, fetching all users');
        emit('user-deleted');
        toast.success("User record deleted successfully");
    } catch (error) {
        console.error('Error during user record deletion:', error);
        toast.error("Unable to delete user record");
    } finally {
        close();
    }
}
</script>
