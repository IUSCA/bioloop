import globusTransferApi from "./globusTransferApi";

class GlobusTransferService {
  submitTask() {
    return globusTransferApi.get("/submission_id");
  }
}

export default new GlobusTransferService();
