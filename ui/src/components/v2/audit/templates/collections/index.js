import CollectionArchived from "./CollectionArchived.vue";
import CollectionCreated from "./CollectionCreated.vue";
import CollectionDatasetAdded from "./CollectionDatasetAdded.vue";
import CollectionDatasetRemoved from "./CollectionDatasetRemoved.vue";
import CollectionDeleted from "./CollectionDeleted.vue";
import CollectionUnarchived from "./CollectionUnarchived.vue";

export default {
  COLLECTION_CREATED: CollectionCreated,
  COLLECTION_ARCHIVED: CollectionArchived,
  COLLECTION_UNARCHIVED: CollectionUnarchived,
  COLLECTION_DELETED: CollectionDeleted,
  COLLECTION_DATASET_ADDED: CollectionDatasetAdded,
  COLLECTION_DATASET_REMOVED: CollectionDatasetRemoved,
};
