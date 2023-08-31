import api from "./api";
import { useAuthStore } from "@/stores/auth";
import { useProjectStore } from "@/stores/projects/project";
import { useToastStore } from "@/stores/toast";
import { useUIStore } from "@/stores/ui";

const auth = useAuthStore();
const toast = useToastStore();
const projectStore = useProjectStore();
const ui = useUIStore();

class projectService {
  getAll({ forSelf }) {
    const username = auth.user.username;
    return (
      forSelf ? api.get(`/projects/${username}/all`) : api.get("/projects/all")
    ).catch((err) => {
      console.error(err);
      toast.error("Unable to fetch projects");
      return Promise.reject(err);
    });
  }

  getById({ id, forSelf }) {
    const username = auth.user.username;
    return forSelf
      ? api.get(`/projects/${username}/${id}`)
      : api.get(`/projects/${id}`);
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

  setDatasets({ id, dataset_ids }) {
    return api
      .put(`/projects/${id}/datasets`, {
        dataset_ids,
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

  loadProject(projectId, forSelf) {
    ui.setIsLoadingResource(true);
    return this.getById({
      id: projectId,
      forSelf,
    })
      .then((res) => {
        projectStore.setProject(res.data);
      })
      .catch((err) => {
        console.error(err);
        toast.error("Unable to fetch project details");
      })
      .finally(() => {
        ui.setIsLoadingResource(false);
      });
  }
}

export default new projectService();
