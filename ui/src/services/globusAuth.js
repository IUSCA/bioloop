import globusApi from "./globusApi";

class GlobusAuthService {
  getToken({ data }) {
    return globusApi.post("/", { data });
  }
}

export default new GlobusAuthService();
