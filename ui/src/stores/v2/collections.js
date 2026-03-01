import CollectionService from "@/services/v2/collections";
import { defineStore } from "pinia";

export const useCollectionsStore = defineStore("v2/collections", () => {
  const collections = ref([]);
  const collectionsLoading = ref(false);
  const collectionsError = ref(null);

  async function searchCollections(params = {}) {
    collectionsLoading.value = true;
    collectionsError.value = null;
    try {
      const {
        data: { data: items },
      } = await CollectionService.search(params);
      collections.value = items;
      return items;
    } catch (err) {
      collectionsError.value = err;
      return [];
    } finally {
      collectionsLoading.value = false;
    }
  }

  // Selected collection detail
  const selectedCollection = ref(null);
  const selectedCollectionLoading = ref(false);
  const selectedCollectionError = ref(null);

  async function fetchCollection(id) {
    selectedCollectionLoading.value = true;
    selectedCollectionError.value = null;
    try {
      const { data } = await CollectionService.get(id);
      selectedCollection.value = data;
    } catch (err) {
      selectedCollectionError.value = err;
    } finally {
      selectedCollectionLoading.value = false;
    }
  }

  function clearSelectedCollection() {
    selectedCollection.value = null;
    selectedCollectionError.value = null;
  }

  // Datasets within the selected collection
  const collectionDatasets = ref([]);
  const collectionDatasetsLoading = ref(false);

  async function fetchCollectionDatasets(collectionId) {
    collectionDatasetsLoading.value = true;
    try {
      const { data } = await CollectionService.getDatasets(collectionId);
      collectionDatasets.value = data;
    } finally {
      collectionDatasetsLoading.value = false;
    }
  }

  function $reset() {
    collections.value = [];
    collectionsLoading.value = false;
    collectionsError.value = null;
    selectedCollection.value = null;
    selectedCollectionLoading.value = false;
    selectedCollectionError.value = null;
    collectionDatasets.value = [];
    collectionDatasetsLoading.value = false;
  }

  return {
    collections,
    collectionsLoading,
    collectionsError,
    searchCollections,
    selectedCollection,
    selectedCollectionLoading,
    selectedCollectionError,
    fetchCollection,
    clearSelectedCollection,
    collectionDatasets,
    collectionDatasetsLoading,
    fetchCollectionDatasets,
    $reset,
  };
});
