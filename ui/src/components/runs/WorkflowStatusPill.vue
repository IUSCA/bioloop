<template>
  <va-chip size="small" :color="status_to_color(props.status)">
    {{ props.status }}
  </va-chip>
</template>

<script setup>
const props = defineProps({
  status: String,
});

function status_to_color(status) {
  if (status == "PENDING") {
    return "primary";
  } else if (status == "STARTED") {
    return "warning";
  } else if (status == "SUCCESS") {
    return "success";
  } else if (status == "FAILURE") {
    return "danger";
  } else if (status == "REVOKED") {
    return "rgb(102, 102, 102)";
  } else {
    return "";
  }
}
</script>
