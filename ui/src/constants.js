const exports = {
  sidebar: {
    user_items: [
      {
        icon: "mdi-flask",
        title: "Projects",
        path: "/projects",
        test_id: "sidebar-projects",
      },
    ],
    operator_items: [
      {
        icon: "mdi-monitor-dashboard",
        title: "Dashboard",
        path: "/dashboard",
        test_id: "sidebar-dashboard",
      },
      // {
      //   icon: "mdi-file-lock",
      //   title: "Data Products",
      //   path: "/dataproducts",
      // },
      // {
      //   icon: "mdi-transition",
      //   title: "Conversions",
      //   path: "/conversions",
      // },
      // {
      //   icon: "mdi-folder-upload",
      //   title: "Data Uploader",
      //   path: "/datauploader",
      // },
      {
        icon: "mdi-dna",
        title: "Raw Data",
        path: "/rawdata",
        test_id: "sidebar-raw-data",
      },
      {
        icon: "mdi-package-variant-closed",
        title: "Data Products",
        path: "/dataproducts",
        test_id: "sidebar-data-products",
      },
      {
        icon: "mdi-folder-plus-outline",
        title: "Create Dataset",
        test_id: "sidebar-create-dataset",
        children: [
          {
            feature_key: "ingestion",
            icon: "mdi-file-cog-outline",
            title: "Ingest",
            path: "/datasets/ingest",
          },
          {
            icon: "mdi:folder-upload",
            title: "Upload",
            path: "/datasetUpload",
          },
        ],
      },
      {
        icon: "mdi-table-account",
        title: "User Management",
        path: "/users",
        test_id: "sidebar-user-management",
      },
      {
        icon: "mdi-format-list-bulleted",
        title: "Stats/Tracking",
        path: "/stats",
        test_id: "sidebar-stats-tracking",
      },
      {
        icon: "mdi:map-marker-path",
        title: "Workflows",
        path: "/workflows",
        test_id: "sidebar-workflows",
      },
      // {
      //   icon: "mdi-account-multiple",
      //   title: "Group Management",
      //   path: "/groups",
      // },
      // {
      //   icon: 'mdi-delete-empty-outline',
      //   title: 'Data Cleanup',
      //   path: '/clean',
      // },
    ],
    bottom_items: [
      {
        icon: "mdi-information",
        title: "About",
        path: "/about",
        test_id: "sidebar-about",
      },
      {
        icon: "mdi-account-details",
        title: "Profile",
        path: "/profile",
        test_id: "sidebar-profile",
      },
      {
        icon: "mdi-logout-variant",
        title: "Logout",
        path: "/auth/logout",
        test_id: "sidebar-logout",
      },
    ],
    admin_items: [],
  },
  UPLOAD_STATES: {
    UNINITIATED: "Uninitiated",
    PROCESSING: "Processing",
    PROCESSING_FAILED: "Processing Failed",
    UPLOADING: "Uploading",
    UPLOAD_FAILED: "Upload Failed",
    UPLOADED: "Uploaded",
  },
};

export default exports;
