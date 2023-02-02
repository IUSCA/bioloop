import api from "./api";

class BatchService {
  getAll(include_checksums = false) {
    console.log(include_checksums);
    return api
      .get("/batch", {
        params: {
          include_checksums,
        },
      })
      .then((response) => response.data);
  }
}

export default new BatchService();
