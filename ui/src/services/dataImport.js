import axios from "axios";

const fsApi = axios.create({
  baseURL: "http://localhost:3060",
});

class DataImportService {
  listDir(path) {
    // return fsApi.get(`/fs?path=${path}`);
    return new Promise((resolve) => {
      // setTimeout(function () {
      resolve({ data: !path ? mockResults("base") : mockResults(path) });
      // }, 2000);
    });
  }

  dirSize(path) {
    return new Promise((resolve, reject) => {
      const source = new EventSource(
        "http://localhost:3060/fs/dir-size?path=" + path,
      );
      let data = null;
      source.onmessage = function (event) {
        try {
          data = JSON.parse(event.data);
        } catch (error) {
          source.close();
          return reject(error);
        }
      };

      source.addEventListener("done", function () {
        if (data !== null) {
          source.close();
          return resolve({ data });
        } else {
          source.close();
          return reject(new Error("No data received before 'done' event."));
        }
      });

      source.onerror = function (event) {
        if (event.target.readyState === EventSource.CLOSED) {
          console.error("Connection was closed.");
        } else if (event.target.readyState === EventSource.CONNECTING) {
          console.error("Connection is in the process of re-establishing.");
        } else {
          console.error("An unknown error occurred.");
        }
        source.close();
        return reject(new Error("An error occurred during the connection."));
      };
    });
  }
}

const mockResults = (path) => {
  const mock = (path, index) =>
    path ? `${path}_${index}` : `base_file_${index}`;

  return [
    {
      name: mock(path, 1),
      isDir: false,
      path: `/path/to/${mock(path, 1)}`,
    },
    {
      name: mock(path, 2),
      isDir: false,
      path: `/path/to/${mock(path, 2)}`,
    },
    // {
    //   name: mock(path, 3),
    //   isDir: true,
    //   path: `/path/to/${mock(path, 3)}`,
    // },
  ];
};

export default new DataImportService();
