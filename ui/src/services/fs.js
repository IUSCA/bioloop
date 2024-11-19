import api from "./api";

class FileSystemService {
  getPathFiles({ path, dirs_only, search_space }) {
    return api.get("/fs", { params: { path, dirs_only, search_space } });
  }
}

export default new FileSystemService();
