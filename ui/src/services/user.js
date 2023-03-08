import api from "./api";

class UserService {
  getAll() {
    return api.get("/users").then((response) => response.data);
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
