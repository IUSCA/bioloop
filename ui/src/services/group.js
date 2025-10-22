import api from "./api";

const getAll = (query) => {
  return api.get("/groups/all", { params: query });
};

const getById = (id, query = {}) => {
  return api.get(`/groups/${id}`, { params: query });
};

const create = (data) => {
  return api.post("/groups", data);
};

const update = (id, data) => {
  return api.patch(`/groups/${id}`, data);
};

const updateUsers = (id, user_ids) => {
  return api.patch(`/groups/${id}/users`, { user_ids });
};

const updateProjects = (id, add_project_ids = [], remove_project_ids = []) => {
  return api.patch(`/groups/${id}/projects`, {
    add_project_ids,
    remove_project_ids,
  });
};

const remove = (id) => {
  return api.delete(`/groups/${id}`);
};

export default {
  getAll,
  getById,
  create,
  update,
  updateUsers,
  updateProjects,
  remove,
};
