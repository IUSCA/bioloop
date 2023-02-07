import api from "./api";

class BatchService {
  getAll(include_checksums = false) {
    return api
      .get("/batch", {
        params: {
          include_checksums,
        },
      })
      .then((response) => response.data);
  }

  getById(id, include_checksums = false) {
    return api.get(`/batch/${id}`, {
      params: {
        include_checksums,
      },
    });
  }
}

export default new BatchService();
