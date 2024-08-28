import toast from "@/services/toast";
import { useAuthStore } from "@/stores/auth";
import api from "./api";

const auth = useAuthStore();

class projectService {
  getAll({ forSelf, take, skip, search = "", sortBy, sort_order } = {}) {
    const username = auth.user.username;
    const params = { take, skip, search, sortBy, sort_order };
    return (
      forSelf
        ? api.get(`/projects/${username}/all`, { params })
        : api.get("/projects/all", { params })
    ).catch((err) => {
      console.error(err);
      toast.error("Unable to fetch projects");
      return Promise.reject(err);
    });
  }

  getById({ id, forSelf, query }) {
    const username = auth.user.username;
    return forSelf
      ? api.get(`/projects/${username}/${id}`, { params: query })
      : api.get(`/projects/${id}`, { params: query });
  }

  createProject({ project_data, dataset_ids, user_ids }) {
    return api
      .post("/projects", {
        ...project_data,
        dataset_ids,
        user_ids,
      })
      .then((res) => {
        toast.success(`Created project: ${res.data?.name}`);
        return res.data;
      })
      .catch((err) => {
        console.error(err);
        toast.error("Failed to create project");
        return Promise.reject(err);
      });
  }

  modifyProject({ id, project_data }) {
    return api
      .patch(`/projects/${id}`, project_data)
      .then((res) => {
        toast.success(`Updated project: ${res.data?.name}`);
        return res.data;
      })
      .catch((err) => {
        console.error(err);
        toast.error("Failed to update project details");
        return Promise.reject(err);
      });
  }

  deleteProject(id) {
    return api
      .delete(`/projects/${id}`)
      .then((res) => {
        toast.success(`Deleted project: ${res.data?.name}`);
        return res.data;
      })
      .catch((err) => {
        console.error(err);
        toast.error("Failed to delete project");
        return Promise.reject(err);
      });
  }

  setUsers({ id, user_ids }) {
    return api
      .put(`/projects/${id}/users`, {
        user_ids,
      })
      .catch((err) => {
        console.error(err);
        toast.error("Failed to update project users");
        return Promise.reject(err);
      });
  }

  getDatasets({ id, params }) {
    const username = auth.user.username;
    return api.get(`/projects/${username}/${id}/datasets`, {
      params,
    });
  }

  updateDatasets({ id, add_dataset_ids, remove_dataset_ids }) {
    return api
      .patch(`/projects/${id}/datasets`, {
        add_dataset_ids,
        remove_dataset_ids,
      })
      .catch((err) => {
        console.error(err);
        toast.error("Failed to update project datasets");
        return Promise.reject(err);
      });
  }

  // calculateSlug(name) {
  //   return api.get(`/projects/slug/calculate/${name}`);
  // }

  mergeProjects({ src_project_id, target_project_ids, delete_merged = false }) {
    return api
      .post(`/projects/merge/${src_project_id}`, {
        target_project_ids,
        delete_merged,
      })
      .catch((err) => {
        console.error(err);
        toast.error("Failed to merge projects");
        return Promise.reject(err);
      });
  }
}

export default new projectService();
