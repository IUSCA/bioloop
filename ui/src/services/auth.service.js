import api from "./api";

class AuthService {
  login(casTicket, casReturn) {
    console.log(casTicket, casReturn);
    return api
      .post("/auth/login", { casTicket, casReturn })
      .then((response) => response.data);
  }

  verify() {
    return api.get("/auth/verify").catch((err) => console.error(err));
  }

  saveSettings = (data) => api.put("/users/mine/settings", data);
}

export default new AuthService();
