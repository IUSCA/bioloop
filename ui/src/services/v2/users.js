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

  getMe() {
    return api.get("/v2/users/me");
  }
}

export default new UserService();
