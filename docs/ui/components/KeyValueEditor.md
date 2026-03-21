# KeyValueEditor Component

The `KeyValueEditor` is a Vue component for editing key-value pairs in a user-friendly table-like interface. It supports inline editing, adding, and removing key-value pairs, and emits updates to the parent component.

## Features

- Inline editing of keys and values
- Add new key-value pairs
- Remove existing pairs
- Prevents duplicate keys
- Customizable input widths and placeholders
- Emits changes via `update:modelValue`

## Props

| Prop               | Type     | Default    | Description                                 |
|--------------------|----------|------------|---------------------------------------------|
| `modelValue`       | Object   | —          | The object to edit (required, v-model)      |
| `keyWidth`         | String   | `150px`    | Width of the key input column               |
| `valueWidth`       | String   | `250px`    | Width of the value input column             |
| `keyPlaceholder`   | String   | `New Key`  | Placeholder for new key input               |
| `valuePlaceholder` | String   | `Value`    | Placeholder for new value input             |
| `emptyMessage`     | String   | `No key-value pairs. Add one below to get started.` | Message to show when there are no items     |

## Events

| Event                | Payload         | Description                        |
|----------------------|----------------|------------------------------------|
| `update:modelValue`  | `{...object}`  | Emitted when the object is updated |

## Usage

```vue
<template>
  <KeyValueEditor
    v-model="myObject"
    key-width="120px"
    value-width="200px"
    key-placeholder="Key"
    value-placeholder="Value"
  />
</template>

<script setup>
import KeyValueEditor from '@/components/utils/KeyValueEditor.vue'
import { ref } from 'vue'

const myObject = ref({
  foo: 'bar',
  hello: 'world'
})
</script>
```

## Notes

- Editing a key to an existing key will be prevented.
- All changes are reactive and immediately emitted to the parent.
- Clicking outside the editor will close any open edit fields.

