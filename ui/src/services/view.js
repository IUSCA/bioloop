import api from "./api";

class ViewService {
  getData(include_checksums = false) {
    return api
      .get("/view/all/", {
        params: {
          include_checksums,
        },
      })
  }

  postSelects(selectedItems, include_checksums = false) {
    return api
      .post("/view/select/", {
        params: {
          include_checksums,
          selectedItems
        },
      })
  }

  getById(id, include_checksums = false) {
    return api.get(`/view/${id}`, {
      params: {
        include_checksums,
      },
    });
  }
}

export default new ViewService();
