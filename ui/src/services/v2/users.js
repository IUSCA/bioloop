import api from "../api";

class UserService {
  getAll({ search = "", sortBy, sort_order, skip, take } = {}) {
    return api.get("/v2/users", {
      params: {
        search,
        sortBy,
        sort_order,
        skip,
        take,
      },
    });
  }
}

export default new UserService();
