import fileSearchApi from "./fileSearchApi";

class FileSearchService {
  listFiles({ collectionId, path }) {
    return fileSearchApi.get(`/operation/endpoint/${collectionId}/ls`, {
      params: { path },
    });
  }
}

export default new FileSearchService();
