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
  const datasets = [{name: 'dataset-1'}, {name: 'dataset-2'}, {name: 'dataset-3'}]

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
- filter-fn: Function (text: String) => (item: Object) => Bool: When provided used to filter the data based on enetered
  text value

### Events

- select - emitted when one of the search results is clicked

### Slots

- `#filtered={ item }`. Named slot (filtered) with props ({item}) to render a custom search result. This slot is in
  v-for and called for each search result.

## Auto Complete Async

`<AutoCompleteAsync />` allows for fetching results both synchronously and asynchronously.`

### Basic Usage

```html

<template>
  <AutoCompleteAsync
    Async
    :data="datasets"
    filter-by="name"
    placeholder="Search datasets"
    @select="handleDatasetSelect"
    text-by="name"
  />
</template>

<script setup>
  const datasets = [{name: 'dataset-1'}, {name: 'dataset-2'}, {name: 'dataset-3'}]

  function handleDatasetSelect(item) {
    console.log('selected', item)
  }
</script>
```

### Fetching options

```html

<template>
  <AutoCompleteAsync
    :data="users"
    :filter-fn="filterFn"
    placeholder="Search users by name, username, or email"
    @select="handleUserSelect"
    text-by="name"
  />
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

### Formatting options

Options can be formatted via the `filtered` slot.

```html

<template>
  <AutoCompleteAsync
    :data="users"
  >
    <template #filtered="{ item }">
      <span>
        <b>
          {{ item.name }}
        </b>
      </span>
    </template>
  </AutoCompleteAsync>
</template>

<script setup>
  const users = [
    {
      id: 1,
      name: "user-1",
    },
    {
      id: 2,
      name: "user-2",
    },
  ];
</script>
```

### Async

```html

<template>
  <AutoCompleteAsync
    `Async`
    :async="`true`"
    `:`data="datasets"
    @update-search="updateSearch"
    :loading="loading"
    :text-by="(dataset) => dataset.name"
  >
  </AutoCompleteAsync>
</template>

<script setup>
  const datasets = ref([])
  const loading = ref(false)
  const searchText = ref("")

  const updateSearch = (newText) => {
    searchText.value = newText;
  };

  watch(searchText, () => {
    loading.value = true;
    // retrieve updated results based on new `searchText.value`
    loading.value = false;
  })
</script>
```

### Props

- `async`: Boolean - determines if component should exhibit async behavior (like loading state)
- `placeholder`: String - placeholder for the input element
- `data`: Array of Objects - data to search and display
- `filter-by`: String - property of data object to use with case-insensitive search, if `async` is `false`.
- `filter-fn`: Function (text: String) => (item: Object) => Bool: When provided, used to filter the data based on
  entered
  text value, if `async` is `false`.
- `loading`: Boolean - determines if component should display loading state
- `track-by`: String | Function - acts same as Vuestic's `<va-select />`'s `track-by` prop
- `text-by`: String | Function - acts the same as Vuestic's `<va-select />`'s `text-by` prop.

### Events

- `select` - emitted when one of the search results is clicked
- `update-search` - emitted when the search term is updated

### Slots

- `#filtered={ item }`. Named slot (filtered) with props ({item}) to render a custom search result. This slot is
  displayed as a selectable option of the AutoComplete.

### Notes

- AutoComplete only handles passing the selected value to an external component, not showing selected values.
- Despite being configured to not show selected values, AutoComplete's `<va-select />` still uses the `textBy` prop to
  set its value internally upon selection.
  - The `textBy` prop defaults to `name`, but may need to be provided differently, depending on your `data`. For
    customizing `textBy`, see [Vuestic's <va-select />](https://ui.vuestic.dev/ui-elements/select#props).

## Advanced Search

The `SearchAndSelect` widget offers these features:

1. Searching for entities
2. Applying additional filters for the search
3. Fetching results in batches via infinite-scrolling (the ability to load more results once the user has scrolled past
   the currently retrieved results)
4. Selecting / unselecting individual or multiple entities.
5. Emitting events to make client aware of entities being selected/unselected, or of the search being reset.
6. Load the widget with certain results pre-selected

### Basic Usage

```html

<template>
  <SearchAndSelect
    :search-result-columns="searchColumnsConfig"
    :selected-result-columns="selectedColumnsConfig"
    :selected-results="selectedResults"
    :fetch-fn="fetchFn"
    search-field="text"
    track-by="text"
    @select="handleSelect"
    @remove="handleRemove"
    results-by="currentResults"
    count-by="totalResultCount"
  />
</template>

<script setup>
  import _ from "lodash";

  const selectedResults = ref([]);

  const handleSelect = (selections) => {
    selections.forEach((selection) => {
      if (!selectedResults.value.includes(selection)) {
        selectedResults.value.push(selection);
      }
    });
  };

  const handleRemove = (removals) => {
    removals.forEach((e) =>
      selectedResults.value.splice(selectedResults.value.indexOf(e), 1),
    );
  };

  const fetchFn = ({text, offset, limit}) => {
    return new Promise((resolve) => {
      resolve({
        data: {
          currentResults: mockResults(offset, offset + limit, text),
          totalResultCount: 50,
        },
      });
    });
  };

  const mockRow = (i, searchTerm) => {
    const filterSuffix = (searchTerm) => {
      return searchTerm ? `, for keyword '${searchTerm}'` : "";
    };

    let text = (i) => `Result ${i + 1}` + filterSuffix(searchTerm);

    const other = (i) =>
      `Other val for result ${i + 1}` + filterSuffix(searchTerm);

    return {
      text: text(i),
      other: other(i),
    };
  };

  const mockResults = (start, end, searchTerm) => {
    return _.range(start, end).map((i) => mockRow(i, searchTerm));
  };

  const searchColumnsConfig = [
    {
      key: "text",
      label: "Text",
      width: "350px",
    },
    {
      key: "other",
      label: "Other Field",
      width: "320px",
    },
  ];

  const selectedColumnsConfig = [searchColumnsConfig[0]];
</script>
```

### Filters

Filters can be shown in the search tool via slots. In such cases, the client is expected to provide the `query` prop
which contains the query containing the filter's selected value. The `reset` event can be used by the client to reset
its filters.

```html

<template>
  <SearchAndSelect
    :search-result-columns="searchColumnsConfig"
    :selected-result-columns="selectedColumnsConfig"
    :selected-results="selectedResults"
    :fetch-fn="fetchFn"
    search-field="text"
    track-by="text"
    @select="handleSelect"
    @remove="handleRemove"
    results-by="currentResults"
    count-by="totalResultCount"
    :query="query"
    @reset="
      () => {
        selectValue = '';
      }
    "
    controls-margin="40px"
    controls-height="100px"
  >
    <template #filters>
      <div class="max-w-xs">
        <VaSelect
          v-model="selectValue"
          :options="selectOptions"
          placeholder="Select an option"
          label="Filter Dropdown"
        />
      </div>
    </template>
  </SearchAndSelect>
</template>

<script setup>
  import _ from "lodash";

  const selectedResults = ref([]);

  const selectValue = ref("");
  const selectOptions = ref([1, 2, 3]);

  const query = computed(() => ({
    other: selectValue.value,
  }));

  const handleSelect = (selections) => {
    selections.forEach((selection) => {
      if (!selectedResults.value.includes(selection)) {
        selectedResults.value.push(selection);
      }
    });
  };

  const handleRemove = (removals) => {
    removals.forEach((e) =>
      selectedResults.value.splice(selectedResults.value.indexOf(e), 1),
    );
  };

  const fetchFn = ({text, other, offset, limit}) => {
    return new Promise((resolve) => {
      resolve({
        data: {
          currentResults: mockResults(offset, offset + limit, text, other),
          totalResultCount: 50,
        },
      });
    });
  };

  const mockRow = (i, searchTerm, dropdownVal) => {
    const filterSuffix = (searchTerm, dropdownVal) => {
      return (
        (searchTerm ? `, for keyword '${searchTerm}'` : "") +
        (dropdownVal ? `, dropdown ${dropdownVal}` : "")
      );
    };

    let text = (i) => `Result ${i + 1}` + filterSuffix(searchTerm, dropdownVal);

    const other = (i) =>
      `Other val for result ${i + 1}` + filterSuffix(searchTerm, dropdownVal);

    return {
      text: text(i),
      other: other(i),
    };
  };
  const mockResults = (start, end, searchTerm, dropdownVal) => {
    return _.range(start, end).map((i) => mockRow(i, searchTerm, dropdownVal));
  };

  const searchColumnsConfig = [
    {
      key: "text",
      label: "Text",
      width: "350px",
    },
    {
      key: "other",
      label: "Other Field",
      width: "320px",
    },
  ];

  const selectedColumnsConfig = [searchColumnsConfig[0]];
</script>
```

### Formatting and Slots

Displayed results can be formatted via the `formatFn` prop. They can also be put inside slots for a more customized
markup per cell.

For showing a column's value inside customized markup, embed the column's value inside `<template #field>` (
example - `<template #address>`). The name of a column's template must be the same as the `key` of the column's config
that was provided via the `searchResultColumns` or `selectedResultColumns` props. The value of the column inside
the `<template>` can be accessed via `slotProps["value"]`.

The below example formats the first column, and embeds the second column inside custom markup.

```html

<template>
  <SearchAndSelect
    :search-result-columns="searchColumnsConfig"
    :selected-result-columns="selectedColumnsConfig"
    :selected-results="selectedResults"
    :fetch-fn="fetchFn"
    search-field="text"
    track-by="text"
    @select="handleSelect"
    @remove="handleRemove"
    results-by="currentResults"
    count-by="totalResultCount"
  >
    <template #other="slotProps">
      <va-chip>{{ slotProps["value"] }}</va-chip>
    </template>
  </SearchAndSelect>
</template>

<script setup>
  import _ from "lodash";

  const selectedResults = ref([]);

  const handleSelect = (selections) => {
    selections.forEach((selection) => {
      if (!selectedResults.value.includes(selection)) {
        selectedResults.value.push(selection);
      }
    });
  };

  const handleRemove = (removals) => {
    removals.forEach((e) =>
      selectedResults.value.splice(selectedResults.value.indexOf(e), 1),
    );
  };

  const fetchFn = ({text, offset, limit}) => {
    return new Promise((resolve) => {
      resolve({
        data: {
          currentResults: mockResults(offset, offset + limit, text),
          totalResultCount: 50,
        },
      });
    });
  };

  const mockRow = (i, searchTerm) => {
    const filterSuffix = (searchTerm) => {
      return searchTerm ? `, for keyword '${searchTerm}'` : "";
    };

    let text = (i) => `Result ${i + 1}` + filterSuffix(searchTerm);

    const other = (i) =>
      `Other val for result ${i + 1}` + filterSuffix(searchTerm);

    return {
      text: text(i),
      other: other(i),
    };
  };

  const mockResults = (start, end, searchTerm) => {
    return _.range(start, end).map((i) => mockRow(i, searchTerm));
  };

  const searchColumnsConfig = [
    {
      key: "text",
      label: "Text",
      width: "350px",
      formatFn: (text) => `Formatted ${text}`,
    },
    {
      key: "other",
      label: "Other Field",
      width: "320px",
      slotted: true,
    },
  ];

  const selectedColumnsConfig = [searchColumnsConfig[0]];
</script>
```

### Notes

Some props that can be either a string or a function. In such cases, if the prop is a function, it will be called with
the target argument, and return the result. If it is a string, the value of the property matching the path specified by
the string is looked up in the target argument, and returned.

### Props

- `placeholder`: String - Placeholder for the search input. Default - "Type to search"
- `selectedLabel`: String - The label to show for the table of selected results. Default - "Selected Results"
- `searchResultColumns`: Array - The display config for the `<va-data-table>` of search results. Extends the `columns`
  prop provided to `<va-data-table>`. A `formatFn` function can be provided in a column's config to format the column's
  value a certain way. Moreover, `{ slotted: true }` can be added to the column's config to embed the column's value in
  custom markup. See the `Formatting and Slots` section above for details.
- `selectedResultColumns`: Array - The display config for the `<va-data-table>` of selected results. Extends
  the `columns`
  prop provided to `<va-data-table>`. A `formatFn` function can be provided in a column's config to format the column's
  value a certain way. Moreover, `{ slotted: true }` can be added to the column's config to embed the column's value in
  custom markup. See the `Formatting and Slots` section above for details.
- `trackBy`: String | Function - Used to uniquely identity a result. Defaults to "id".
- `fetchFn`: Function - Async function that is expected to return a batch of results for the infinite scroll. The search
  term, and queries from any active filters are passed to this method as arguments, including the offset and limit
  values necessary for fetching a batch of results.
- `query`: Object - Object containing queries from any active filters. This query is passed to `fetchFn`,
  along with the search term and the offset/limit values.
- `searchField`: String - The key of the column that the search term is matched against
- `resultsBy`: String | Function - Can be used to extract results in cases where the actual results are embedded inside
  an
  object.
- `countBy`: String | Function - Can be used to determine the total number of expected results for a search query. This
  prop is required for infinite scrolling to work.
- `pageSizeSearch`: Number - the number of results to be fetched in one batch. Defaults to 5.
- `selectedResults`: Array - the array of currently selected results. Can be used to load the widget with some items
  pre-selected. Defaults to [].
- `controlsMargin`: String - margin between the controls and the tables
- `controlsHeight`: String - height of the controls container element

### Slots

- `filters` - used for providing controls used for filtering results
- dynamically-named slots, whose name is the `key` of the column that the slot is intended for. See
  the `Formatting and Slots` section above for an example.

###

Events

- `search` - called when a list of elements are selected, with the list of selected elements provided as an argument.
- `remove` - called when a list of elements are unselected, with the list of unselected elements provided as an
  argument.
- `reset` - called when the search controls are reset

## Maybe

Show data if it is neither null or undefined, else show default (provided it is also not null or undefined)

```html

<template>
  <Maybe :data="rowData?.metadata?.num_genome_files"/>
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
  <CopyText :text="dataset.archive_path"/>
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

This composition function helps you manage query parameters in the URL and keep them in sync with a reactive object in
your component.

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

It will update the URL query parameters by watching the refObject and it will update the refObject when URL query
parameters change.
