import api from "./api";

class UserService {
  getAll({ text = "", sort_by, sort_order, skip = 0, take = 10 }) {
    return api
      .get("/users", {
        params: {
          text,
          sort_by,
          sort_order,
          skip,
          take,
        },
      })
      .then((response) => {
        const { metadata, users } = response.data;
        return { metadata, users };
      });
  }

  createUser(user_data) {
    return api.post("/users", user_data).then((response) => response.data);
  }

  modifyUser(username, updates) {
    return api
      .patch(`/users/${username}`, updates)
      .then((response) => response.data);
  }

  deleteUser(username) {
    return api.delete(`/users/${username}`).then((response) => response.data);
  }
}

export default new UserService();
