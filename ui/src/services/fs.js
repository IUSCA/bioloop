import api from "./api";

class FileSystemService {
  getPathFiles({ path, dirs_only }) {
    return api.get("/fs", { params: { path, dirs_only } });
  }
}

export default new FileSystemService();
