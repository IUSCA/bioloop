<template>
  <div class="va-table-responsive">
    <table class="va-table">
      <tbody>
        <tr>
          <td>Source Collection ID</td>
          <td>{{ props.sourceCollection?.id }}</td>
        </tr>
        <tr>
          <td>Source Collection Name</td>
          <td>{{ props.sourceCollection?.display_name }}</td>
        </tr>
        <tr>
          <td>Destination Collection ID</td>
          <td>{{ props.destinationCollection?.id }}</td>
        </tr>
        <tr>
          <td>Destination Collection Name</td>
          <td>{{ props.destinationCollection?.display_name }}</td>
        </tr>
        <tr>
          <td>Source File Path</td>
          <td><CopyText :text="props.filePath" }} /></td>
        </tr>
        <tr>
          <td>Destination Collection Organization</td>
          <td>{{ props.destinationCollection?.organization }}</td>
        </tr>
        <tr>
          <td>Public Destination Collection</td>
          <td>
            <i-mdi-check-circle-outline
              v-if="props.destinationCollection?.public"
              class="text-green-700"
            />
            <i-mdi-close-circle-outline v-else class="text-red-700" />
          </td>
        </tr>
        <!--        <tr>-->
        <!--          <td>Description</td>-->
        <!--          <td>{{ props.destinationCollection?.user_message }}</td>-->
        <!--        </tr>-->
      </tbody>
    </table>
  </div>
</template>

<script setup>
const props = defineProps({
  sourceCollection: {
    type: Object,
    required: true,
  },
  destinationCollection: {
    type: Object,
    required: true,
  },
  filePath: {
    type: String,
    required: true,
  },
});
</script>
<style scoped></style>
