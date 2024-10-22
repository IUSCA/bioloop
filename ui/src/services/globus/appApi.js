import toast from "@/services/toast";
import api from "@/services/api";

class GlobusAppService {
  logGlobusShare(data) {
    return api.post(`/globus/log`, null, data).catch((err) => {
      console.error(err);
      toast.error("Unable to fetch projects");
      return Promise.reject(err);
    });
  }
}

export default new GlobusAppService();
