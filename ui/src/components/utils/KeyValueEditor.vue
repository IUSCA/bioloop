<template>
  <div class="" ref="tableRef">
    <!-- Show message if localObject is empty -->
    <div
      v-if="Object.keys(localObject).length === 0"
      class="va-text-secondary text-sm italic"
    >
      {{ props.emptyMessage }}
    </div>
    <div
      v-for="(val, key, i) in localObject"
      :key="key"
      class="flex items-center gap-1 row-separator"
      style="min-height: 32px"
    >
      <!-- Editable Key -->
      <VaValue v-slot="vKey">
        <VaInput
          v-if="isEditing.type === 'key' && isEditing.index === i"
          v-model="editableKeys[i]"
          class="border rounded px-1 py-0.5 key-input key-col-separator"
          @blur="toggleKeyEdit(i, key, vKey)"
          @keyup.enter="toggleKeyEdit(i, key, vKey)"
          ref="keyInputs"
        />
        <span
          v-else
          class="key-input truncate cursor-pointer key-col-separator pl-1"
          role="button"
          @keydown.enter="startEdit('key', i, vKey)"
          tabindex="0"
          @click="startEdit('key', i, vKey)"
        >
          {{ key }}
        </span>
      </VaValue>

      <!-- Editable Value -->
      <VaValue v-slot="vVal">
        <VaInput
          v-if="isEditing.type === 'value' && isEditing.index === i"
          v-model="localObject[key]"
          class="border rounded px-1 py-0.5 value-input"
          @blur="stopEdit(vVal)"
          @keyup.enter="stopEdit(vVal)"
          ref="valueInputs"
        />
        <span
          v-else
          class="flex-1 truncate value-input cursor-pointer pl-1"
          role="button"
          @keydown.enter="startEdit('value', i, vVal)"
          tabindex="0"
          @click="startEdit('value', i, vVal)"
        >
          {{ localObject[key] }}
        </span>
      </VaValue>

      <VaButton
        icon="delete"
        color="danger"
        size="small"
        preset="primary"
        class="!p-0"
        @click="removeKey(key)"
      />
    </div>

    <!-- Add New KV -->
    <div class="flex items-center gap-1 row-separator pt-1">
      <VaInput
        v-model="newKey"
        :placeholder="props.keyPlaceholder"
        class="border rounded px-1 py-0.5 key-input key-col-separator"
      />
      <VaInput
        v-model="newValue"
        :placeholder="props.valuePlaceholder"
        class="border rounded px-1 py-0.5 value-input"
      />
      <VaButton
        icon="add"
        size="small"
        color="success"
        @click="addKeyValue"
        :disabled="!newKey || newKey in localObject"
        class="!p-0"
      />
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  modelValue: { type: Object, required: false, default: () => ({}) },
  keyWidth: { type: String, default: "150px" },
  valueWidth: { type: String, default: "250px" },
  keyPlaceholder: { type: String, default: "New Key" },
  valuePlaceholder: { type: String, default: "Value" },
  emptyMessage: {
    type: String,
    default: "No key-value pairs. Add one below to get started.",
  },
});
const emit = defineEmits(["update:modelValue"]);

const localObject = reactive({ ...props.modelValue });
const editableKeys = reactive(Object.keys(localObject));
const newKey = ref("");
const newValue = ref("");

// Track which field is being edited
const isEditing = reactive({ type: null, index: null });

// Helper to close any open edit
function closeEdit() {
  isEditing.type = null;
  isEditing.index = null;
}

// Start editing a field, close any previous edit
function startEdit(type, index, vSlot) {
  closeEdit();
  isEditing.type = type;
  isEditing.index = index;
  // For VaValue slot, set value to true to trigger input
  vSlot.value = true;
}

// Stop editing a value field
function stopEdit(vSlot) {
  closeEdit();
  vSlot.value = false;
}

// Modified toggleKeyEdit to close edit state
function toggleKeyEdit(index, oldKey, vKeySlot) {
  const newKeyVal = editableKeys[index];
  if (vKeySlot.value && newKeyVal !== oldKey) {
    if (newKeyVal in localObject) return; // avoid duplicates
    localObject[newKeyVal] = localObject[oldKey];
    delete localObject[oldKey];
    editableKeys[index] = newKeyVal;
  }
  closeEdit();
  vKeySlot.value = false;
}

function removeKey(key) {
  delete localObject[key];
  const idx = editableKeys.findIndex((k) => k === key);
  if (idx >= 0) editableKeys.splice(idx, 1);
  closeEdit();
}

function addKeyValue() {
  if (!newKey.value || newKey.value in localObject) return;
  localObject[newKey.value] = newValue.value;
  editableKeys.push(newKey.value);
  newKey.value = "";
  newValue.value = "";
  closeEdit();
}

watch(
  localObject,
  () => {
    emit("update:modelValue", { ...localObject });
  },
  { deep: true },
);

// Optional: Close edit if user clicks outside the table
const tableRef = ref(null);
function handleClickOutside(event) {
  // Only close edit if click is outside the table container
  if (!tableRef.value) return;
  if (!tableRef.value.contains(event.target)) {
    closeEdit();
  }
}

onMounted(() => {
  document.addEventListener("mousedown", handleClickOutside);
});
onBeforeUnmount(() => {
  document.removeEventListener("mousedown", handleClickOutside);
});
</script>

<style scoped>
.key-input {
  width: v-bind("props.keyWidth");
  min-width: v-bind("props.keyWidth");
  max-width: v-bind("props.keyWidth");
  display: inline-block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.value-input {
  width: v-bind("props.valueWidth");
  min-width: v-bind("props.valueWidth");
  max-width: v-bind("props.valueWidth");
  display: inline-block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.row-separator {
  border-bottom: 0px solid #e5e7eb; /* subtle gray-200 */
}
.key-col-separator {
  border-right: 1px solid #e5e7eb;
  /* Add padding to separate from border */
  padding-right: 8px !important;
  margin-right: 4px;
}

/* Dark mode support */
:root.dark .row-separator {
  border-bottom-color: #374151; /* gray-700 */
}
:root.dark .key-col-separator {
  border-right-color: #374151; /* gray-700 */
}
</style>

<style scoped lang="scss">
:deep(.va-input-wrapper__field) {
  --va-input-wrapper-min-height: 20px;
}
</style>
