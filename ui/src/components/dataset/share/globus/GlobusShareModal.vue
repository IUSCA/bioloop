<template>
  <va-modal
    v-model="showModal"
    max-height="350x"
    class="collection-search-modal"
    fixed-layout
    @cancel="beforeGlobusShareModalClose"
    @ok="onGlobusShareModalOk"
    ok-text="Share via Globus"
  >
    <div class="flex flex-col w-full autocomplete-container">
      <AutoComplete
        :async="true"
        v-model:search-text="sourceFileSearchText"
        @update:search-text="
          setSourceCollectionFiles({
            collectionId: config.globus.source_collection_id,
            path: sourceFileSearchText,
          })
        "
        label="Search Source Collection Files"
        placeholder="Enter file path"
        :data="retrievedSourceFiles"
        display-by="path"
        @select="
          (item) => {
            setSourceFileToShare({ file: item });
          }
        "
        @clear="
          () => {
            setSourceFileToShare({ file: null });
          }
        "
        @open="
          () => {
            sourceFileSearchText = '';
            searchCollectionFiles({
              collectionId: config.globus.source_collection_id,
              path: sourceFileSearchText,
            });
          }
        "
        @close="
          () => {
            retrievedSourceFiles = [];
          }
        "
      >
      </AutoComplete>

      <!--      <div class="text-sm va-text-danger">-->
      <!--        {{ modalError }}-->
      <!--      </div>-->
    </div>

    <div class="flex flex-col w-full autocomplete-container">
      <AutoComplete
        :async="true"
        v-model:search-text="endpointSearchText"
        @update:search-text="searchGlobusEndpoints"
        label="Search Destination Endpoints"
        placeholder="Search Destination Endpoints"
        :data="retrievedEndpoints"
        display-by="display_name"
        :messages="['Use hyphens between search terms']"
        @select="
          (item) => {
            setGlobusCollections({ destinationCollection: item });
          }
        "
        @clear="
          () => {
            globusDestinationEndpoint = null;
          }
        "
        @open="
          () => {
            globusDestinationEndpoint = null;
            searchGlobusEndpoints();
          }
        "
        @close="
          () => {
            retrievedEndpoints = [];
          }
        "
      >
      </AutoComplete>

      <!--      <div class="text-sm va-text-danger">-->
      <!--        {{ modalError }}-->
      <!--      </div>-->

      <va-inner-loading class="mt-5" :loading="loading">
        <GlobusCollectionInfo
          v-if="globusDestinationEndpoint"
          :destination-collection="globusDestinationEndpoint"
          :source-collection="globusSourceEndpoint"
          :file-path="
            getEntitySourceCollectionPath(props.entityToShare.origin_path)
          "
        />
      </va-inner-loading>
    </div>

    <div class="flex flex-col w-full autocomplete-container">
      <AutoComplete
        :async="true"
        v-model:search-text="destinationFileSearchText"
        @update:search-text="
          setDestinationCollectionFiles({
            collectionId: globusDestinationEndpoint.id,
            path: destinationFileSearchText,
          })
        "
        label="Search Destination Collection Files"
        placeholder="Enter file path"
        :data="retrievedDestinationFiles"
        display-by="path"
        @select="
          (item) => {
            setGlobusDestinationFileToShare({ file: item });
          }
        "
        @clear="
          () => {
            setGlobusDestinationFileToShare({ file: null });
          }
        "
        @open="
          () => {
            destinationFileSearchText = '';
            setGlobusDestinationFileToShare({ file: null });
            searchCollectionFiles({
              collectionId: globusDestinationEndpoint.id,
              path: destinationFileSearchText,
            });
          }
        "
        @close="
          () => {
            retrievedDestinationFiles = [];
          }
        "
      >
      </AutoComplete>

      <!--      <div class="text-sm va-text-danger">-->
      <!--        {{ modalError }}-->
      <!--      </div>-->
    </div>
  </va-modal>
</template>

<script setup>
import globusTransferService from "@/services/globus/transfer";
import GlobusAppService from "@/services/globus/appApi";
import globusFileSearchService from "@/services/globus/fileSearch";
import config from "@/config";
import toast from "@/services/toast";
import { useAuthStore } from "@/stores/auth";
import {
  getEntitySourceCollectionPath,
  getGlobusTransferRequestBody,
} from "@/services/globus";

const props = defineProps({
  entityToShare: { type: Object, required: true },
  showModal: { type: Boolean, default: false },
});

const emit = defineEmits(["update:showModal"]);

const auth = useAuthStore();

const showModal = computed({
  get: () => props.showModal,
  set: (value) => {
    emit("update:showModal", value);
  },
});
const endpointSearchText = ref("");
const sourceFileSearchText = ref("");
const destinationFileSearchText = ref("");
const retrievedEndpoints = ref([]);
const showGlobusShareModal = ref(false);
const globusDestinationEndpoint = ref(null);
const globusSourceEndpoint = ref(null);
const modalError = ref("");
const sourceFileToShare = ref(null);
const destinationFileToShare = ref(null);
const retrievedSourceFiles = ref([]);
const retrievedDestinationFiles = ref([]);

const searchGlobusEndpoints = () => {
  if (!endpointSearchText.value) {
    return [];
  }
  return globusTransferService
    .searchEndpoints({
      filter_fulltext: encodeURIComponent(endpointSearchText.value),
    })
    .then((res) => {
      retrievedEndpoints.value = res.data["DATA"];
    });
};

const setSourceCollectionFiles = ({ collectionId, path }) => {
  if (!path) {
    return [];
  }

  searchCollectionFiles({ collectionId, path }).then((res) => {
    retrievedSourceFiles.value = res.data["DATA"].map((file) => ({
      ...file,
      path: `${path}/${file.name}`,
    }));
  });
};

const setDestinationCollectionFiles = ({ collectionId, path }) => {
  if (!path) {
    return [];
  }

  searchCollectionFiles({ collectionId, path }).then((res) => {
    retrievedDestinationFiles.value = res.data["DATA"].map((file) => ({
      ...file,
      path: `${path}/${file.name}`,
    }));
  });
};

const searchCollectionFiles = ({ collectionId, path }) => {
  return globusFileSearchService
    .listFiles({ collectionId, path })
    .catch((err) => {
      console.error("Error searching collection files", err);
    });
};

const beforeGlobusShareModalClose = () => {
  console.log("onGlobusShareModalClose()");
  modalError.value = "";
  endpointSearchText.value = "";
  showGlobusShareModal.value = false;
  globusDestinationEndpoint.value = null;
};

const onGlobusShareModalOk = () => {
  console.log("onGlobusShareModalOk()");
  // endpointSearchText.value = "";
  if (globusDestinationEndpoint.value) {
    modalError.value = "";
    endpointSearchText.value = "";
    initiateGlobusTransfer();
    // selectedGlobusEndpoint.value = null;
  } else {
    modalError.value = "Please select a destination Globus endpoint";
    showGlobusShareModal.value = true;
  }
};

const registerGlobusShare = ({
  entityToShare,
  sourceCollectionId,
  destinationCollectionId,
}) => {
  GlobusAppService.logGlobusShare({
    dataset_id: entityToShare.id,
    source_collection_id: sourceCollectionId,
    destination_collection_id: destinationCollectionId,
    source_file_path: getEntitySourceCollectionPath(entityToShare.origin_path),
    destination_file_path: `/home/u_otp4tsmynba3hhwlxymrnhxlmq/${entityToShare.name}`,
    user_id: auth.user.id,
  }).catch((err) => {
    console.error("Unable to register Globus share", err);
  });
};

const initiateGlobusTransfer = () => {
  globusTransferService
    .submitTask()
    .then((res) => {
      let submissionId = res.data.value;
      console.log("submissionId", submissionId);
      return submissionId;
    })
    .then((submissionId) => {
      registerGlobusShare({
        entityToShare: props.entityToShare,
        sourceCollectionId: config.globus.source_collection_id,
        destinationCollectionId: globusDestinationEndpoint.value.id,
      });
      return submissionId;
    })
    .then((submissionId) => {
      const sourceCollectionFilePath = getEntitySourceCollectionPath(
        props.entityToShare.origin_path,
      );

      // const sourceCollectionFilePath =
      // '/home/u_otp4tsmynba3hhwlxymrnhxlmq/sub-fsm40mn-2'
      console.log("file: ", sourceCollectionFilePath);
      const transferRequestBody = getGlobusTransferRequestBody({
        submissionId,
        sourceFile: sourceCollectionFilePath,
        destinationCollectionId: globusDestinationEndpoint.value.id,
      });
      console.log("transferRequestBody: ", transferRequestBody);
      return transferRequestBody;
    })
    .then((transferRequestBody) => {
      return globusTransferService.transfer(transferRequestBody);
    })
    .then(() => {
      toast.success(`Initiated Globus transfer`);
    })
    .catch((err) => {
      console.error("Failed to initiate Globus transfer", err);
      toast.error("Failed to initiate Globus transfer");
    })
    .finally(() => {
      showGlobusShareModal.value = false;
    });
};

const setGlobusCollections = ({ destinationCollection }) => {
  endpointSearchText.value = destinationCollection.display_name;
  globusDestinationEndpoint.value = destinationCollection;
  globusTransferService
    .getEndpointById(config.globus.source_collection_id)
    .then((res) => {
      globusSourceEndpoint.value = res.data;
    })
    .catch((err) => {
      console.error(
        `Could not retrieve collection ${config.globus.source_collection_id}`,
        err,
      );
    });
};

const setSourceFileToShare = ({ file }) => {
  sourceFileToShare.value = file;
  sourceFileSearchText.value = `${file.path}/${file.name}`;
  console.log("file: ", file);
};

const setGlobusDestinationFileToShare = ({ file }) => {
  destinationFileToShare.value = file;
  destinationFileSearchText.value = `${file.path}/${file.name}`;
  console.log("file: ", file);
};

// const setGlobusDestinationCollection = ({ collection }) => {
//   sourceFileToShare.value = file;
//   sourceFileSearchText.value = `${file.path}/${file.name}`;
//   console.log("file: ", file);
// };

onMounted(() => {
  console.log("GlobusShareModal mounted");
  console.log("props.entityToShare", props.entityToShare);
});
</script>

<style lang="scss">
.collection-search-modal {
  --va-modal-dialog-min-height: 350px;
}

.autocomplete-container {
  min-height: 300px;
}
</style>
