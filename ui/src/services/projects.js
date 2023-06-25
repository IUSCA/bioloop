import api from "./api";
import { useAuthStore } from "@/stores/auth";
import { useToastStore } from "@/stores/toast";

const auth = useAuthStore();
const toast = useToastStore();

class projectService {
  getAll({ forSelf }) {
    const username = auth.user.username;
    return (
      forSelf ? api.get(`/projects/${username}/all`) : api.get("/projects/all")
    ).catch((err) => {
      console.error(err);
      toast.error("Unable to fetch projects");
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
        return err;
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
        return err;
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
        return err;
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
        return err;
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
        return err;
      });
  }

  // calculateSlug(name) {
  //   return api.get(`/projects/slug/calculate/${name}`);
  // }
}

export default new projectService();
