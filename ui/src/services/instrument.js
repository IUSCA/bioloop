import api from "./api";

class InstrumentService {
  getAll() {
    return api.get("/instruments");
  }
}

export default new InstrumentService();
