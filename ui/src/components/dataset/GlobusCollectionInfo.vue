<template>
  <div class="va-table-responsive">
    <table class="va-table">
      <tbody>
        <tr>
          <td>Collection ID</td>
          <td>{{ props.collection.id }}</td>
        </tr>
        <tr>
          <td>Organization</td>
          <td>{{ props.collection.organization }}</td>
        </tr>
        <tr>
          <td>Public Collection</td>
          <td>
            <i-mdi-check-circle-outline
              v-if="props.collection.public"
              class="text-green-700"
            />
            <i-mdi-close-circle-outline v-else class="text-red-700" />
          </td>
        </tr>
        <tr>
          <td>Description</td>
          <td>{{ props.collection.user_message }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
const props = defineProps({
  collection: {
    type: Object,
    required: true,
  },
});
</script>
<style scoped></style>
