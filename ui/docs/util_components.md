# Utility Components

## Auto Complete

### Basic Usage

```html
<template>
<AutoComplete
  :data="datasets"
  filter-by="name"
  placeholder="Search datasets"
  @select="handleDatasetSelect"
/>
</template>

<script setup>
  const datasets = [{name: 'dataset-1'},{name: 'dataset-2'},{name: 'dataset-3'}]
  function handleDatasetSelect(item) {
    console.log('selected', item)
  }
</script>
```

### Advanced Usage
```html
<template>
<AutoComplete
  :data="users"
  :filter-fn="filterFn"
  placeholder="Search users by name, username, or email"
  @select="handleUserSelect"
>
  <template #filtered="{ item }">
    <span> {{ item.name }} </span>
    <span class="va-text-secondary px-1 font-bold"> &centerdot; </span>
    <span class="va-text-secondary text-sm"> {{ item.email }} </span>
  </template>
</AutoComplete>
</template>

<script setup>
  const users = ref([]);
const selectedUser = ref();
const filterFn = (text) => (user) => {
  const _text = text.toLowerCase();
  return (
    user.name.toLowerCase().includes(_text) ||
    user.username.toLowerCase().includes(_text) ||
    user.email.toLowerCase().includes(_text)
  );
};

userService.getAll().then((data) => {
  users.value = data;
  console.log(users.value);
});
</script>
```

### Props
- placeholder: String - placeholder for the input element
- data: Array of Objects - data to search and display
- filter-by: String - property of data object to use with case-insensitive search
- display-by: String - property of data object to use to show search results
- filter-fn: Function (text: String) => (item: Object) => Bool: When provided used to filter the data based on enetered text value

### Events
- select - emitted when one of the search results is clicked

### Slots
- `#filtered={ item }`. Named slot (filtered) with props ({item}) to render a custom search result. This slot is in v-for and called for each search result.


## Maybe

Show data if it is neither null or undefined, else show default (provided it is also not null or undefined)

```html
<template>
  <Maybe :data="rowData?.metadata?.num_files" />
</template
```

### Props
- data: Any
- default: Any


## CopyText

- Show text in a read-only input attached with a copy to clipboard button. 
- Width is relative 100%.
- Input container is x-scrollable if the text overflows

```html
<template>
  <CopyText :text="dataset.archive_path" />
</template>
```

### props
- text: String

## BinaryStatusChip

Shows a chip with icon, text, color depending on status. Useful to on/off status

```html
<template>
  <BinaryStatusChip
    :status="!source"
    :icons="['mdi:account-off-outline', 'mdi:account-badge-outline']"
  />
</template>
```

### Props
- status: Boolean (0-off, 1-on)
- icons - Array of 2 elements (off icon, on icon)
- labels - Array of 2 element (off lable, on label)
  - default: `['disbaled', 'enabled']`


## useQueryPersistence Composable

This composition function helps you manage query parameters in the URL and keep them in sync with a reactive object in your component.

Usage:
1. Create a ref to hold the query parameters
2. Call this function on the ref.

```javascript
import useQueryPersistence from "@/composables/useQueryPersistence";

const default_query_params = () => ({
  status: null,
  page: 1,
  auto_refresh: 10,
});

const query_params = ref(default_query_params());

useQueryPersistence({
  refObject: query_params,
  defaultValue: default_query_params(),
  key: "wq",
  history_push: false,
});
```

It will update the URL query parameters by watching the refObject and it will update the refObject when URL query parameters change.