# Modal Component Pattern (Vuestic + Vue 3)

## 🎯 Goal
Offer a minimal, consistent modal pattern where the component owns its internal workflow (visibility, validation, network calls, loading/errors) and the parent only triggers opening and reacts to a generic `update` event.

---

## ✅ Key guidelines

- **Modal is responsible for everything**: network calls, loading state (`VaInnerLoading`), errors (`ErrorState`), toasts, and success events.
- **Expose only `show()` / `hide()`** via `defineExpose`.
- **Emit a generic event** (e.g. `update`) when the operation succeeds so the parent can refresh.
- Keep parent logic minimal: set props, call `show()`, and refresh on `@update`.

---

## 🔧 Example Pattern

```vue
<template>
  <VaModal v-model="visible" :title="modalTitle" hide-default-actions @cancel="hide">
    <template #footer>
      <div class="flex items-center justify-end gap-5">
        <VaButton preset="secondary" @click="hide">Cancel</VaButton>
        <VaButton :loading="loading" :disabled="!confirmationValid" :color="actionColor" @click="confirm">
          {{ actionLabel }}
        </VaButton>
      </div>
    </template>

    <VaInnerLoading :loading="loading">
      <!-- modal content -->
    </VaInnerLoading>
  </VaModal>
</template>

<script setup>
import toast from '@/services/toast';
import GroupService from '@/services/v2/groups';

const props = defineProps({
  groupId: String,
  unarchive: Boolean,
});
const emit = defineEmits(['update']);

const visible = ref(false);
const loading = ref(false);

function show() {
  visible.value = true;
}

function hide() {
  visible.value = false;
}

defineExpose({ show, hide });

async function confirm() {
  loading.value = true;
  try {
    await (props.unarchive ? GroupService.unarchive(props.groupId) : GroupService.archive(props.groupId));
    hide();
    toast.success(props.unarchive ? 'Unarchived' : 'Archived');
    emit('update');
  } catch (err) {
    toast.error(err?.response?.data?.message ?? 'Something went wrong.');
  } finally {
    loading.value = false;
  }
}
</script>
```

---

## 🧠 Parent usage (minimal)

- `ref` the modal
- call `show()`
- refresh on `@update`

```vue
<template>
  <MyModal ref="modal" @update="refresh" />
</template>

<script setup>
import { ref } from 'vue';

const modal = ref(null);

function open() {
  modal.value.show();
}

function refresh() {
  // re-fetch data
}
</script>
```
