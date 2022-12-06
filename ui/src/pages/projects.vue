<template>
  <va-input
    class="flex mb-2 md6 xs12"
    placeholder="Filter..."
    v-model="input"
  />
  <span>Selected: {{ selectedItems.length }}</span>
  <va-data-table
    :items="row_items"
    :columns="columns"
    :filter-method="filterExact"
    @filtered="onFilter"
    :hoverable="true"
    v-model:sort-by="sortBy"
    v-model:sorting-order="sortingOrder"
    selectable
    v-model="selectedItems"
    select-mode="multiple"
    selected-color="#888888"
  >
    <template #cell(name)="{ value }"
      ><router-link to="/" class="va-link">{{ value }}</router-link></template
    >
    <template #cell(users)="{ value }"
      ><va-chip v-for="(user, i) in JSON.parse(value)" :key="i" size="small">{{
        user
      }}</va-chip></template
    >
    <template #cell(groups)="{ value }"
      ><va-chip v-for="(user, i) in JSON.parse(value)" :key="i" size="small">{{
        user
      }}</va-chip></template
    >

    <template #cell(actions)="{ rowIndex }">
      <va-button
        preset="plain"
        icon="edit"
        @click="openModalToEditItemById(rowIndex)"
      />
      <va-button
        preset="plain"
        icon="delete"
        color="danger"
        @click="deleteItemById(rowIndex)"
      />
    </template>
  </va-data-table>
  <!-- <va-pagination
            v-model="currentPage"
            input
            :pages="pages"
        /> -->

  <va-modal
    class="modal-crud-example"
    :model-value="!!editedItem"
    title="Edit item"
    size="small"
    @ok="editItem"
    @cancel="resetEditedItem"
  >
    <va-input
      v-for="key in Object.keys(editedItem)"
      :key="key"
      class="my-3"
      :label="key"
      v-model="editedItem[key]"
    />
  </va-modal>
</template>

<script setup>
// const items = ref([
//   {
//     id: 1,
//     name: "Leanne Graham",
//     username: "Bret",
//     email: "Sincere@april.biz",
//     phone: "1-770-736-8031 x56442",
//     website: "hildegard.org",
//   },
//   {
//     id: 2,
//     name: "Ervin Howell",
//     username: "Antonette",
//     email: "Shanna@melissa.tv",
//     phone: "010-692-6593 x09125",
//     website: "anastasia.net",
//   },
//   {
//     id: 3,
//     name: "Clementine Bauch",
//     username: "Samantha",
//     email: "Nathan@yesenia.net",
//     phone: "1-463-123-4447",
//     website: "ramiro.info",
//   },
//   {
//     id: 4,
//     name: "Patricia Lebsack",
//     username: "Karianne",
//     email: "Julianne.OConner@kory.org",
//     phone: "493-170-9623 x156",
//     website: "kale.biz",
//   },
//   {
//     id: 5,
//     name: "Chelsey Dietrich",
//     username: "Kamren",
//     email: "Lucio_Hettinger@annie.ca",
//     phone: "(254)954-1289",
//     website: "demarco.info",
//   },
// ]);

const projects = [
  {
    dataproducts: ["6019b14b5047e31f175423d7"],
    groups: [],
    users: [],
    browser: false,
    _id: "606b521f02d8137b0ff40049",
    name: "BL_Chrm_009_Mitra_scRNA1_Oct2020",
    createdAt: "2021-04-05T18:08:31.798Z",
    updatedAt: "2021-04-05T18:08:31.798Z",
    __v: 0,
  },
  {
    dataproducts: ["5fbd7266c64cc935805cc9d3"],
    groups: [],
    users: [
      {
        roles: ["user", "admin"],
        notifications: true,
        active: true,
        _id: "5f57994f38972540c2718125",
        username: "yunliu",
        primary_role: "admin",
        email: "yunliu@iu.edu",
        createDate: "2020-09-08T14:46:39.508Z",
        lastLogin: "2022-11-04T18:11:58.774Z",
        fullname: "Yunlong Liu",
        __v: 0,
      },
    ],
    browser: false,
    _id: "606b521f02d8137b0ff4004a",
    name: "Chrm_164_Ipe_Spatial4_Sept2020",
    createdAt: "2021-04-05T18:08:31.807Z",
    updatedAt: "2021-04-05T18:08:31.807Z",
    __v: 0,
  },
  {
    dataproducts: [
      "601970d65047e31f175396a3",
      "5fe0d525f74e0107fd63067c",
      "601d832ef2894f1bc53266d0",
    ],
    groups: [
      {
        members: [
          {
            _id: "601987215047e31f1753abcd",
            fullname: "Luke Child Dabin",
          },
        ],
        active: true,
        _id: "601987845047e31f1753ae27",
        name: "Jungs Kim Lab",
        createdAt: "2021-02-02T17:10:28.535Z",
        updatedAt: "2021-02-02T17:10:28.535Z",
        __v: 0,
      },
    ],
    users: [
      {
        roles: ["user"],
        notifications: true,
        active: true,
        _id: "601987215047e31f1753abcd",
        username: "lcdabin",
        primary_role: "user",
        email: "lcdabin@iu.edu",
        createDate: "2021-02-02T17:08:49.661Z",
        lastLogin: "2022-11-28T18:15:41.121Z",
        fullname: "Luke Child Dabin",
        __v: 0,
      },
      {
        roles: ["user", "admin"],
        notifications: true,
        active: true,
        _id: "5f577fb638972540c2718122",
        username: "hongao",
        primary_role: "admin",
        email: "hongao@iu.edu",
        createDate: "2020-09-08T12:57:26.862Z",
        lastLogin: "2022-12-01T01:08:43.403Z",
        fullname: "Hongyu Gao",
        __v: 0,
      },
      {
        roles: ["user", "admin"],
        notifications: true,
        active: true,
        _id: "601c533df2894f1bc52dec85",
        username: "maluthra",
        primary_role: "admin",
        email: "maluthra@iu.edu",
        createDate: "2021-02-04T20:04:13.984Z",
        lastLogin: "2022-08-19T19:12:55.187Z",
        fullname: "Maks Luthra",
        __v: 3,
      },
    ],
    browser: false,
    _id: "606b521f02d8137b0ff4004c",
    name: "ILMN_898_Kim_Luke_scRNAseq4_Dec2020",
    createdAt: "2021-04-05T18:08:31.812Z",
    updatedAt: "2021-04-05T18:16:32.923Z",
    __v: 1,
  },
  {
    dataproducts: ["6019b1415047e31f1754238c"],
    groups: [],
    users: [],
    browser: false,
    _id: "606b521f02d8137b0ff4004d",
    name: "BL_Chrm_011_Carpenter_scRNA4_Dec2020",
    createdAt: "2021-04-05T18:08:31.814Z",
    updatedAt: "2021-04-05T18:08:31.814Z",
    __v: 0,
  },
  {
    dataproducts: ["6019b1445047e31f1754239d"],
    groups: [
      {
        members: [
          {
            _id: "601987215047e31f1753abcd",
            fullname: "Luke Child Dabin",
          },
        ],
        active: true,
        _id: "601987845047e31f1753ae27",
        name: "Jungs Kim Lab",
        createdAt: "2021-02-02T17:10:28.535Z",
        updatedAt: "2021-02-02T17:10:28.535Z",
        __v: 0,
      },
    ],
    users: [
      {
        roles: ["user"],
        notifications: true,
        active: true,
        _id: "601987215047e31f1753abcd",
        username: "lcdabin",
        primary_role: "user",
        email: "lcdabin@iu.edu",
        createDate: "2021-02-02T17:08:49.661Z",
        lastLogin: "2022-11-28T18:15:41.121Z",
        fullname: "Luke Child Dabin",
        __v: 0,
      },
      {
        roles: ["user", "admin"],
        notifications: true,
        active: true,
        _id: "5f577fb638972540c2718122",
        username: "hongao",
        primary_role: "admin",
        email: "hongao@iu.edu",
        createDate: "2020-09-08T12:57:26.862Z",
        lastLogin: "2022-12-01T01:08:43.403Z",
        fullname: "Hongyu Gao",
        __v: 0,
      },
      {
        roles: ["user", "admin"],
        notifications: true,
        active: true,
        _id: "601c533df2894f1bc52dec85",
        username: "maluthra",
        primary_role: "admin",
        email: "maluthra@iu.edu",
        createDate: "2021-02-04T20:04:13.984Z",
        lastLogin: "2022-08-19T19:12:55.187Z",
        fullname: "Maks Luthra",
        __v: 3,
      },
    ],
    browser: false,
    _id: "606b521f02d8137b0ff4004e",
    name: "NB_Chrm_007_scRNA4_NG_Jan2021",
    createdAt: "2021-04-05T18:08:31.817Z",
    updatedAt: "2021-04-05T18:08:31.817Z",
    __v: 0,
  },
  {
    dataproducts: ["6019b1475047e31f175423be"],
    groups: [
      {
        members: [
          {
            _id: "601987215047e31f1753abcd",
            fullname: "Luke Child Dabin",
          },
        ],
        active: true,
        _id: "601987845047e31f1753ae27",
        name: "Jungs Kim Lab",
        createdAt: "2021-02-02T17:10:28.535Z",
        updatedAt: "2021-02-02T17:10:28.535Z",
        __v: 0,
      },
    ],
    users: [
      {
        roles: ["user"],
        notifications: true,
        active: true,
        _id: "601987215047e31f1753abcd",
        username: "lcdabin",
        primary_role: "user",
        email: "lcdabin@iu.edu",
        createDate: "2021-02-02T17:08:49.661Z",
        lastLogin: "2022-11-28T18:15:41.121Z",
        fullname: "Luke Child Dabin",
        __v: 0,
      },
      {
        roles: ["user", "admin"],
        notifications: true,
        active: true,
        _id: "5f577fb638972540c2718122",
        username: "hongao",
        primary_role: "admin",
        email: "hongao@iu.edu",
        createDate: "2020-09-08T12:57:26.862Z",
        lastLogin: "2022-12-01T01:08:43.403Z",
        fullname: "Hongyu Gao",
        __v: 0,
      },
      {
        roles: ["user"],
        notifications: true,
        active: true,
        _id: "6022e32514da9d719974679d",
        username: "edrsimps",
        primary_role: "user",
        email: "edrsimps@iupui.edu",
        createDate: "2021-02-09T19:31:49.852Z",
        lastLogin: "2021-12-09T20:22:01.478Z",
        fullname: "Simpson, Ed",
        __v: 0,
      },
    ],
    browser: false,
    _id: "606b521f02d8137b0ff4004f",
    name: "NB_Chrm_008_scRNA3_NG_Jan2021",
    createdAt: "2021-04-05T18:08:31.820Z",
    updatedAt: "2021-04-05T18:08:31.820Z",
    __v: 0,
  },
  {
    dataproducts: ["602980e3ad719c1585aa0d40", "606f331a9e8bfa6d06407e53"],
    groups: [],
    users: [
      {
        roles: ["user"],
        notifications: true,
        active: true,
        _id: "604924b8a9446b0e8aeba11c",
        username: "lyang7",
        primary_role: "user",
        email: "lyang7@iu.edu",
        createDate: "2021-03-10T19:57:44.919Z",
        lastLogin: "2021-05-04T18:24:36.680Z",
        fullname: "Lei Yang",
        __v: 0,
      },
      {
        roles: ["user"],
        notifications: true,
        active: true,
        _id: "6049243aa9446b0e8aeba11b",
        username: "wang652",
        primary_role: "user",
        email: "wang652@iu.edu",
        createDate: "2021-03-10T19:55:38.011Z",
        lastLogin: "2022-08-09T00:41:12.284Z",
        fullname: "Cheng Wang",
        __v: 0,
      },
    ],
    browser: false,
    _id: "606b521f02d8137b0ff40051",
    name: "ILMN_930_Yang_Liu_ChIPseq14_Jan2021",
    createdAt: "2021-04-05T18:08:31.824Z",
    updatedAt: "2021-04-08T21:13:22.237Z",
    __v: 1,
  },
  {
    dataproducts: ["602b2adcdc8ed275e899a294"],
    groups: [],
    users: [
      {
        roles: ["user"],
        notifications: true,
        active: true,
        _id: "602d8d7d64c136099bf7c0de",
        username: "adamfisc",
        primary_role: "user",
        email: "adamfisc@iu.edu",
        createDate: "2021-02-17T21:41:17.322Z",
        lastLogin: "2021-12-29T18:07:21.236Z",
        fullname: "Adam Fischer",
        __v: 0,
      },
    ],
    browser: false,
    _id: "606b521f02d8137b0ff40052",
    name: "ILMN_939_Graham_mRNAseq10_Jan2020",
    createdAt: "2021-04-05T18:08:31.827Z",
    updatedAt: "2021-04-05T18:08:31.827Z",
    __v: 0,
  },
  {
    dataproducts: ["602b2adfdc8ed275e899a2a9"],
    groups: [],
    users: [
      {
        roles: ["user"],
        notifications: true,
        active: true,
        _id: "6022e32514da9d719974679d",
        username: "edrsimps",
        primary_role: "user",
        email: "edrsimps@iupui.edu",
        createDate: "2021-02-09T19:31:49.852Z",
        lastLogin: "2021-12-09T20:22:01.478Z",
        fullname: "Simpson, Ed",
        __v: 0,
      },
      {
        roles: ["user"],
        notifications: true,
        active: true,
        _id: "60997a5e85fc544489a6561c",
        username: "jbrothwe",
        primary_role: "user",
        email: "jbrothwe@iu.edu",
        createDate: "2021-05-10T18:24:30.784Z",
        lastLogin: "2022-07-28T20:16:56.462Z",
        fullname: "Julie Brothwell",
        __v: 0,
      },
    ],
    browser: false,
    _id: "606b521f02d8137b0ff40053",
    name: "ILMN_920_Spinola_TotalRNAseq20_Jan2021_v2",
    createdAt: "2021-04-05T18:08:31.829Z",
    updatedAt: "2021-06-10T16:23:07.910Z",
    __v: 0,
  },
  {
    dataproducts: ["602b2ae6dc8ed275e899a2db"],
    groups: [],
    users: [
      {
        roles: ["user"],
        notifications: true,
        active: true,
        _id: "602d814264c136099bf7c0dd",
        username: "zz14",
        primary_role: "user",
        email: "zz14@iu.edu",
        createDate: "2021-02-17T20:49:06.752Z",
        lastLogin: "2022-03-15T17:20:52.233Z",
        fullname: "Zhuolong Zhou",
        __v: 0,
      },
    ],
    browser: false,
    _id: "606b521f02d8137b0ff40055",
    name: "ILMN_941_Lu_mRNAseq12_Feb2021",
    createdAt: "2021-04-05T18:08:31.833Z",
    updatedAt: "2021-04-05T18:08:31.833Z",
    __v: 0,
  },
];

const row_items = ref(
  projects.map((p) => {
    return {
      name: p.name,
      dataproducts: (p.dataproducts || []).length,
      users: JSON.stringify((p.users || []).map((userObj) => userObj.fullname)),
      groups: JSON.stringify((p.groups || []).map((groupObj) => groupObj.name)),
    };
  })
);

const columns = ref([
  { key: "name", sortable: true, sortingOptions: ["desc", "asc", null] },
  {
    key: "dataproducts",
    sortable: true,
    sortingOptions: ["desc", "asc", null],
  },
  { key: "users", sortable: true, sortingOptions: ["desc", "asc", null] },
  { key: "groups", sortable: true, sortingOptions: ["desc", "asc", null] },
  { key: "actions", width: 80 },
]);

// initial sorting order
const sortBy = ref("name");
const sortingOrder = ref(null);

const input = ref("");

function filterExact(source) {
  // this function is invoked for every cell
  // it would be better if it was invoked for every row passing the row object
  // this way we would have more control on what we filter on
  if (input.value === "") {
    return true;
  }
  const retValue = source?.toString?.().includes(input.value);
  console.log(source, retValue);
  return retValue;
}

function onFilter(ev) {
  // ev value
  // {
  //     "items": [
  //         {
  //             "name": "BL_Chrm_009_Mitra_scRNA1_Oct2020",
  //             "dataproducts": 1,
  //             "users": [],
  //             "groups": []
  //         },
  //         {
  //             "name": "BL_Chrm_011_Carpenter_scRNA4_Dec2020",
  //             "dataproducts": 1,
  //             "users": [],
  //             "groups": []
  //         }
  //     ],
  //         "itemsIndexes": [
  //             0,
  //             3
  //         ]
  // }
  console.log(ev);
}
const selectedItems = ref([]);
// const selectedItemsEmitted = ref([]);

// function handleSelect(ev) {
//   console.log(ev);
// }

const editedItemId = ref();
const editedItem = ref();
function openModalToEditItemById(id) {
  editedItemId.value = id;
  editedItem.value = { ...this.row_items[id] };
}

function resetEditedItem() {
  editedItem.value = null;
  editedItemId.value = null;
}
</script>
