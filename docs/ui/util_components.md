# Utility Components

## AutoComplete

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

### With Slots

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

### Async

```html

<template>
  <AutoComplete
    :async="true"
    v-model:search-text="searchText"
    :placeholder="`Search Users`"
    :data="retrievedUsers"
    :display-by="'username'"
    @clear="emit('clear')"
    @select="
      (user) => {
        onSelect(user);
      }
    "
    :label="'Search Users'"
    @open="emit('open')"
    @close="emit('close')"
  />
</template>

<script setup>
const searchText = ref("")
const retrievedUsers = ref([])

const onSelect = (selectedUser) => {
  const searchTerm = selectedUser.username
  userService.getByMatchingUsername({
    username: searchTerm
  }).then(res => {
    retrievedUsers.value = res.data
  })
};
</script>

```

### Pagination

```html
<template>
  <AutoComplete
    v-model:search-text="searchTerm"
    :async="true"
    :paginated="true"
    :paginated-total-results-count="totalResultsCount"
    :data="searchResults"
    :display-by="'name'"
    @clear="onClear"
    @open-="onOpen"
    @load-more="loadNextPage"
    placeholder="Search Datasets by name"
    @select="onSelect"
    :disabled="props.disabled"
    :label="'Paginated AutoComplete Demo'"
  />
</template>

<script setup>
const props = defineProps({
  selected: {
    type: [String, Object],
  },
  displayBy: {
    type: [Function, String],
    default: () => 'name' || 'name',
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  label: {
    type: String,
  },
})

const emit = defineEmits([
  // 'clear', 'open', 'close',
  'update:selected',
])

const PAGE_SIZE = 10
const loading = ref(false)
const searchResults = ref([])
const totalResultsCount = ref(0)
const page = ref(1)
const skip = computed(() => {
  return PAGE_SIZE * (page.value - 1)
})

const searchTerm = ref('')

const loadResults = async ({ appendToCurrentResult = true } = {}) => {
  if (!searchTerm.value) return []

  loading.value = true

  try {
    // Simulate API call delay
    await new Promise((resolve) => setTimeout(resolve, 500))

    // Mock API response
    const mockApiResponse = {
      results: Array.from({ length: PAGE_SIZE }, (_, i) => ({
        name: `Result ${skip.value + i + 1} for "${searchTerm.value}"`,
      })),
      totalCount: 100, // Assuming there are always 100 total results for any search
    }

    searchResults.value = appendToCurrentResult
      ? [...searchResults.value, ...mockApiResponse.results]
      : mockApiResponse.results
    totalResultsCount.value = mockApiResponse.totalCount
  } catch (error) {
    console.error('Error fetching results:', error)
    searchResults.value = []
    totalResultsCount.value = 0
  } finally {
    loading.value = false
  }
}

const displayedResult = (item) => {
  return typeof props.displayBy === 'function' ? props.displayBy(item) : item[props.displayBy]
}

const onSelect = (item) => {
  searchTerm.value = displayedResult(item)
  emit('update:selected', item)
}

const loadNextPage = async () => {
  page.value += 1 // increase page value for offset recalculation
  return await loadResults()
}

const onOpen = () => {
  searchTerm.value = props.selected ? displayedResult(props.selected) : ''
}

const onClear = () => {
  searchTerm.value = ''
}

watch(searchTerm, () => {
  page.value = 1 // reset page value when search term changes
  loadResults({ appendToCurrentResult: false })
})

onMounted(() => {
  loadResults()
})
</script>

<style scoped></style>
```

### Props

- search-text: String - Can optionally be provided to show the selected value within `AutoComplete`. By default, selected values are not shown.
- placeholder: String - placeholder for the input element
- data: Array of Objects - data to search and display
- filter-by: String - property of data object to use with case-insensitive search
- display-by: String - property of data object to use to show search results
- filter-fn: Function (text: String) => (item: Object) => Bool: When provided used to filter the data based on entered
  text value
- async: Boolean - Can be used in combination with `search-text` to enable asynchronous search for results. Defaults to `false`.
- paginated: Boolean - Enables fetching results in pages
- paginated-total-result-count - Count of total results which can be paginated through
- disabled: Boolean - Can be used to show the underlying `va-input` element in a disabled state. Defaults to `false`.
- error: String - Error message to show beneath the underlying `va-input` element.
- label: String - Label for `AutoComplete`
- loading: Boolean - determines if AutoComplete's dropdown will show a loading indicator, or retrieved results

### Events

- select - emitted when one of the search results is clicked
- open - emitted when the AutoComplete is opened
- close - emitted when the AutoComplete is closed
- clear - emitted when the selected value or the current search term is cleared via `va-input`'s clear button
- update:search-text - emitted when the search input is changed

### Slots

- `#filtered={ item }` - Named slot (filtered) with props ({item}) to render a custom search result. This slot is in
  v-for and called for each search result.
- `#appendInner` - Named slot (appendInner) to append custom markup to `AutoComplete`'s input field. The markup provided will be rendered inside `va-input`'s `appendInner` slot.
- `#prependInner` - Named slot (prependInner) to prepend custom markup to `AutoComplete`'s input field. The markup provided will be rendered inside `va-input`'s `prependInner` slot.

## SearchAndSelect

The `SearchAndSelect` widget offers these features:

1. Searching for entities
2. Applying additional filters for the search
3. Fetching results in batches via infinite-scrolling (the ability to load more results once the user has scrolled past
   the currently retrieved results)
4. Selecting / unselecting individual entities, or multiple entities at once.
5. Emitting events to make client aware of entities being selected/unselected, or of the search being reset.
6. Load this widget with certain results pre-selected

### Basic Usage

```html
<template>
  <SearchAndSelect
    v-model:searchTerm="searchTerm"
    :search-results="searchResults"
    :selected-results="selectedResults"
    :search-result-count="totalResultCount"
    @scroll-end="loadNextPage"
    :search-result-columns="searchColumnsConfig"
    :selected-result-columns="selectedColumnsConfig"
    track-by="text"
    @select="handleSelect"
    @remove="handleRemove"
    @reset="
      () => {
        searchTerm = ''; // watcher on searchTerm takes care of resetting the search state
      }
    "
  />
</template>

<script setup>
import _ from "lodash";

const PAGE_SIZE = 10;

const selectedResults = ref([]);
const searchResults = ref([]);

const page = ref(1);
const skip = computed(() => {
  return PAGE_SIZE * (page.value - 1);
});

const totalResultCount = ref(0);

const searchTerm = ref("");

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

const loadNextPage = () => {
  page.value += 1; // increase page value for offset recalculation
  return loadResults();
};

const batchingQuery = computed(() => {
  return {
    offset: skip.value,
    limit: PAGE_SIZE,
  };
});

const fetchQuery = computed(() => {
  return {
    ...(searchTerm.value && { text: searchTerm.value }),
    ...batchingQuery.value,
  };
});

const loadResults = () => {
  return fetchFn(fetchQuery.value).then((res) => {
    searchResults.value = searchResults.value.concat(res.currentResults);
    totalResultCount.value = res.totalResultCount;
  });
};

watch(searchTerm, () => {
  resetSearchState();
});

const resetSearchState = () => {
  // reset search results
  searchResults.value = [];
  // reset page value
  page.value = 1;
  // load initial set of search results
  loadResults();
};

onMounted(() => {
  loadResults();
});

const fetchFn = ({ text, offset, limit }) => {
  return new Promise((resolve) => {
    resolve({
      currentResults: mockResults(offset, offset + limit, text),
      totalResultCount: 50,
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

Filters can be shown in the search tool via slots. The `reset` event can be used by the client to reset
its filters.

```html
<template>
  <SearchAndSelect
    v-model:searchTerm="searchTerm"
    :search-results="searchResults"
    :selected-results="selectedResults"
    :search-result-count="totalResultCount"
    @scroll-end="loadNextPage"
    :search-result-columns="searchColumnsConfig"
    :selected-result-columns="selectedColumnsConfig"
    track-by="text"
    @select="handleSelect"
    @remove="handleRemove"
    @reset="
      () => {
        searchTerm = ''; // watcher on searchTerm takes care of resetting the search state
        selectValue = ''; // reset Filter
      }
    "
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

const PAGE_SIZE = 10;

const selectValue = ref("");
const selectOptions = ref([1, 2, 3]);

const selectedResults = ref([]);
const searchResults = ref([]);

const page = ref(1);
const skip = computed(() => {
  return PAGE_SIZE * (page.value - 1);
});

const totalResultCount = ref(0);

const searchTerm = ref("");

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

const loadNextPage = () => {
  page.value += 1; // increase page value for offset recalculation
  return loadResults();
};

const batchingQuery = computed(() => {
  return {
    offset: skip.value,
    limit: PAGE_SIZE,
  };
});

const filterQuery = computed(() => {
  return selectValue.value
    ? {
        other: selectValue.value,
      }
    : undefined;
});

const fetchQuery = computed(() => {
  return {
    ...(searchTerm.value && { text: searchTerm.value }),
    ...filterQuery.value,
    ...batchingQuery.value,
  };
});

const loadResults = () => {
  return fetchFn(fetchQuery.value).then((res) => {
    searchResults.value = searchResults.value.concat(res.currentResults);
    totalResultCount.value = res.totalResultCount;
  });
};

watch([searchTerm, filterQuery], () => {
  resetSearchState();
});

const resetSearchState = () => {
  // reset search results
  searchResults.value = [];
  // reset page value
  page.value = 1;
  // load initial set of search results
  loadResults();
};

onMounted(() => {
  loadResults();
});

const fetchFn = ({ text, offset, limit, other }) => {
  return new Promise((resolve) => {
    resolve({
      currentResults: mockResults(offset, offset + limit, text, other),
      totalResultCount: 50,
    });
  });
};

const mockRow = (i, searchTerm, filterValue) => {
  const filterSuffix = (searchTerm, dropdownVal) => {
    return (
      (searchTerm ? `, for keyword '${searchTerm}'` : "") +
      (dropdownVal
        ? `, ${searchTerm ? "and" : "for"} dropdown ${dropdownVal}`
        : "")
    );
  };

  let text = (i) => `Result ${i + 1}` + filterSuffix(searchTerm, filterValue);

  const other = (i) =>
    `Other val for result ${i + 1}` + filterSuffix(searchTerm, filterValue);

  return {
    text: text(i),
    other: other(i),
  };
};

const mockResults = (start, end, searchTerm, filterValue) => {
  return _.range(start, end).map((i) => mockRow(i, searchTerm, filterValue));
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

For showing a field's value inside customized markup
- set `{ slotted: true }` in the field's config that is being provided via the `searchResultColumns` or `selectedResultColumns` props
- embed the cell's value inside `<template #templateName>` (
  example - `<template #address>`).
  - The name of a column's template is the same as the `key` of the column's config that was provided via the `searchResultColumns` or `selectedResultColumns` props.

The value of the column inside the `<template>` can be accessed via `slotProps["value"]`, which is an object that contains the formatted as well as the raw value for the slotted field.

```
// slotProps['value]

{
  formatted: 'formatted value',
  raw: 'raw value
}

```

The below example formats the values in the `text` column, and embeds the values in the `other` column inside custom markup.

Notice how both the formatted and raw values of a slotted field can be access via `slotProps["value"]`.

```html
<template>
  <SearchAndSelect
    v-model:searchTerm="searchTerm"
    :search-results="searchResults"
    :selected-results="selectedResults"
    :search-result-count="totalResultCount"
    @scroll-end="loadNextPage"
    :search-result-columns="searchColumnsConfig"
    :selected-result-columns="selectedColumnsConfig"
    track-by="text"
    @select="handleSelect"
    @remove="handleRemove"
    @reset="
      () => {
        searchTerm = ''; // watcher on searchTerm takes care of resetting the search state
      }
    "
  >
    <template #other="slotProps">
    <!-- Both formatted and unFormatted values can be accessed via slotProps -->
      <va-chip>{{ slotProps["value"].formatted }}</va-chip>
      <va-chip>{{ slotProps["value"].raw }}</va-chip>
    </template>
  </SearchAndSelect>
</template>

<script setup>
import _ from "lodash";

const PAGE_SIZE = 10;

const selectedResults = ref([]);
const searchResults = ref([]);

const page = ref(1);
const skip = computed(() => {
  return PAGE_SIZE * (page.value - 1);
});

const totalResultCount = ref(0);

const searchTerm = ref("");

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

const loadNextPage = () => {
  page.value += 1; // increase page value for offset recalculation
  return loadResults();
};

const batchingQuery = computed(() => {
  return {
    offset: skip.value,
    limit: PAGE_SIZE,
  };
});

const fetchQuery = computed(() => {
  return {
    ...(searchTerm.value && { text: searchTerm.value }),
    ...batchingQuery.value,
  };
});

const loadResults = () => {
  return fetchFn(fetchQuery.value).then((res) => {
    searchResults.value = searchResults.value.concat(res.currentResults);
    totalResultCount.value = res.totalResultCount;
  });
};

watch(searchTerm, () => {
  resetSearchState();
});

const resetSearchState = () => {
  // reset search results
  searchResults.value = [];
  // reset page value
  page.value = 1;
  // load initial set of search results
  loadResults();
};

onMounted(() => {
  loadResults();
});

const fetchFn = ({ text, offset, limit }) => {
  return new Promise((resolve) => {
    resolve({
      currentResults: mockResults(offset, offset + limit, text),
      totalResultCount: 50,
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

1. Some props that can be either a string or a function. In such cases, if the prop is a function, it will be called with
   the target argument, and return the result. If it is a string, the value of the property matching the path specified by
   the string is looked up in the target argument, and returned.

### Props

- `messages`: Array - Hint message(s) to be shown below the underlying `va-input`
- `selectMode`: String ['single' | 'multiple'] - Determines if the widget should allow selecting/unselecting multiple results at once. Use `single` for only allowing a single result to be selected/unselected at one time. Defaults to `multiple`.
- `placeholder`: String - Placeholder for the search input. Default - "Type to search"- `selectedResults`: Array - the array of currently selected results. Can be used to load the widget with some items
  pre-selected. Defaults to [].
- `loading`: Boolean - Shows loading indicator and disables controls when loading. Defaults to False.
- `searchResults`: Array - the array of results retrieved via the current search. Defaults to [].
- `selectedResults`: Array - the array of currently selected search results. Can be used to load the widget with some items
  pre-selected. Defaults to [].
- `selectedLabel`: String - The label to show for the table of selected results. Default - "Selected Results"
- `searchResultColumns`: Array - The display config for the `<va-data-table>` of search results. Extends the `columns`
  prop provided to `<va-data-table>`. A `formatFn` function can be provided in a column's config to format the column's
  value a certain way. Moreover, `{ slotted: true }` can be added to the column's config to embed the column's value in
  custom markup. See the `Formatting and Slots` section above for details.
- `selectedResultColumns`: Array - The display config for the `<va-data-table>` of selected results. Extends
  the `columns` prop provided to `<va-data-table>`. A `formatFn` function can be provided in a column's config
  to format the column's value a certain way. Moreover, `{ slotted: true }` can be added to the column's config
  to embed the column's value in custom markup. See the `Formatting and Slots` section above for details.
- `searchResultCount`: Number - Total number results retrieved from the current search (not to be confused with the
  number of results in the current batch)
- `searchTerm`: String - The search term to be used for performing the search. Client provides this as a component v-model, via `v-model:searchTerm`.
- `trackBy`: String | Function - Used to uniquely identity a result. Defaults to "id".
- `pageSizeSearch`: Number - the number of results to be fetched in one batch. Defaults to 10.
- `resource`: String - the name of the entity being searched for. Defaults to `result`.
- `error`: String - error to be shown beneath the underlying `va-input`.
- `showError`: Boolean - determines whether `error` will be shown
- `controlsMargin`: String - margin between the controls and the tables
- `controlsHeight`: String - height of the controls container element

### Slots

- `filters` - used for providing controls used for filtering results
- dynamically-named slots, whose name is the `key` of the column that the slot is intended for. See
  the `Formatting and Slots` section above for an example.

###

Events

- `search` - emitted when a list of elements are selected, with the list of selected elements provided as an argument.
- `remove` - emitted when a list of elements are unselected, with the list of unselected elements provided as an
  argument.
- `reset` - emitted when the search controls are reset
- `update:searchTerm` - emitted when the `searchTerm` v-model is to be updated
- `scroll-end` - emitted when user scrolls to the end of the current batch of results

## OutlinedAlert

A customizable alert component.

### Primary Features:
- Can be outlined (bordered)
  - Vuestic's `va-alert` component, when used with the `outline` prop, changes the background color inside the alert. If this is not desirable, this component can serve as an alternative.
- Can include an icon preceding the alert text
- Can be customized in terms of size, text-color, border, padding-direction, padding-amount, the icon displayed and the icon's size.

### Basic Usage

```html
<template>
  <OutlinedAlert
    icon="info"
    color="primary"
    border="left"
  >
    This is an alert message.
  </OutlinedAlert>
  
  <OutlinedAlert 
    icon="warning" 
    color="danger" 
    border="all" 
    padding-direction="left" 
    padding-amount="lg" 
    size="large"
  >
    Warning: This is a more customized alert message.
  </OutlinedAlert>
</template>
```

### Props
- size: String - Overall size of the alert. Options: "small", "medium", "large". Default: "medium"
- icon: String - The icon to be displayed. Default: "info"
- iconSize: String - Size of the icon. Options: "small", "medium", "large". Default: "medium"
- border: String - Border style. Options: "left", "right", "top", "bottom", "all", "none". Default: "all"
- color: String - Color of the alert. Default: "primary"
- paddingDirection: String - Direction of padding. Options: "left", "right", "top", "bottom", "all", "none". Default: "all"
- paddingAmount: String | Number - Amount of padding. Options: "none", "xs", "sm", "md", "lg", "xl", "2xl", "default", or a number (px) or string (custom value). Default: "default"

### Slots
- default: The content of the alert

### Styling
- Uses Tailwind classes


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
- labels - Array of 2 element (off label, on label)
  - default: `['disabled', 'enabled']`

## EnvAlert

Shows an `<va-alert/>` which displays the mode that the app is running in (`test`, `CI`, etc.).

The environments that this alert should be enabled for can be set in `./ui/config.js`, under property `alertForEnvironments`.

```html
<template>
  <EnvAlert color="warning" icon="info" />
</template>
```

### Props

- icon: String - icon to be included in the alert.
- color: String - alert's color

Props are forwarded to Vuestic's `<va-alert />` component.

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

## StartEndDateTimeInputs

A component for selecting start and end date/time pairs with built-in validation.

### Primary Features:
- Separate date and time inputs for better UX
- Automatic validation to ensure start date/time is before end date/time
- Prevents selection of past dates
- Handles timezone conversion and date/time combination internally
- Supports disabled state for read-only scenarios
- Optional validation that can be turned off

### Basic Usage

```html
<template>
  <StartEndDateTimeInputs
    v-model:startTime="alertData.start_time"
    v-model:endTime="alertData.end_time"
  />
</template>

<script setup>
const alertData = ref({
  start_time: null,
  end_time: null
});
</script>
```

### With Validation Disabled

```html
<template>
  <StartEndDateTimeInputs
    v-model:startTime="eventStart"
    v-model:endTime="eventEnd"
    :validate-dates="false"
  />
</template>

<script setup>
const eventStart = ref(new Date());
const eventEnd = ref(new Date(Date.now() + 24 * 60 * 60 * 1000)); // Tomorrow
</script>
```

### Read-Only Mode

```html
<template>
  <StartEndDateTimeInputs
    v-model:startTime="existingEvent.start_time"
    v-model:endTime="existingEvent.end_time"
    :disabled="true"
  />
</template>

<script setup>
const existingEvent = ref({
  start_time: new Date('2024-01-15T10:00:00'),
  end_time: new Date('2024-01-15T12:00:00')
});
</script>
```

### Props
- validateDates: Boolean - Whether to enable date/time validation. Default: true
- disabled: Boolean - Whether the inputs should be disabled (read-only). Default: false

### Models
- startTime: Date - The combined start date and time as a Date object
- endTime: Date - The combined end date and time as a Date object

### Validation Rules
When `validateDates` is true:
- Start date cannot be in the past (compared to today's date)
- Start date/time must be before end date/time
- Validation messages are displayed inline with the respective fields

### Internal Behavior
- Automatically splits incoming Date objects into separate date and time components
- Combines user-selected date and time back into Date objects
- Handles timezone conversions appropriately
- Prevents circular update loops between parent and internal state

### Styling
- Uses Vuestic UI components (`va-date-input`, `va-time-input`)
- Responsive layout with flex gap spacing
- Integrates with Vuestic's validation system
