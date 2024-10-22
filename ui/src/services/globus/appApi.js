import api from "@/services/api";

class GlobusAppService {
  logGlobusShare(data) {
    return api.post(`/globus/log`, data);
  }
}

export default new GlobusAppService();
