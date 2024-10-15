import globusTransferApi from "./transferApi";

class GlobusTransferService {
  submitTask() {
    return globusTransferApi.get("/submission_id");
  }

  transfer(data) {
    return globusTransferApi.post("/transfer", data);
  }

  searchEndpoints(params) {
    return globusTransferApi.get("/endpoint_search", { params });
  }
}

export default new GlobusTransferService();
