<template>
  <va-select
    v-model="multiSelect"
    label="select users"
    placeholder="search for users"
    :options="options"
    multiple
    autocomplete
    highlight-matched-text
    track-by="id"
    text-by="username"
  >
    <template #content="{ value }">
      <va-chip
        v-for="(chip, idx) in value"
        :key="idx"
        class="mr-1"
        size="small"
        closeable
        @update:modelValue="deselect(idx)"
      >
        {{ chip.username }}
      </va-chip>
    </template>
  </va-select>
</template>

<script setup>
import toast from "@/services/toast";
import userService from "@/services/user";

const props = defineProps({
  selected: {
    type: Array,
    default: () => [],
  },
});
const emit = defineEmits(["update:selected"]);

const options = ref([]);
const multiSelect = computed({
  get() {
    return props.selected;
  },
  set(value) {
    emit("update:selected", value);
  },
});

userService
  .getAll()
  .then((users) => {
    options.value = users.map((obj) => ({
      id: obj.id,
      username: obj.username,
    }));
  })
  .catch((err) => {
    toast.error("Unable to fetch users");
    console.error(err);
  });

function deselect(idx) {
  const sel = multiSelect.value;
  multiSelect.value = sel.slice(0, idx).concat(sel.slice(idx + 1));
}
</script>
