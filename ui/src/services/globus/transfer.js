import globusTransferApi from "./transferApi";

class GlobusTransferService {
  submitTask() {
    return globusTransferApi.get("/submission_id");
  }

  transfer(data) {
    return globusTransferApi.post("/transfer", data);
  }
}

export default new GlobusTransferService();
