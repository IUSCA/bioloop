import api from "./api";

class FileSystemService {
  getPathFiles({ path, dirs_only, extension }) {
    return api.get("/fs", { params: { path, dirs_only, extension } });
  }
}

export default new FileSystemService();
