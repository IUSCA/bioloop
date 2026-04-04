const icons = {
  group: "mdi-account-group",
  user: "mdi-account",
  dataset: "mdi-file-document",
  collection: "mdi-folder-multiple",
  request: "mdi-lock-open",
  grant: "mdi-certificate",
  resource: "mdi-database",
  members: "mdi-account-multiple",
};

const exports = {
  sidebar: {
    user_items: [
      {
        icon: "mdi-flask",
        title: "Projects",
        path: "/projects",
        test_id: "sidebar-projects",
      },
      {
        icon: "mdi-folder-plus-outline",
        title: "Create Dataset",
        test_id: "sidebar-create-dataset",
        children: [
          {
            feature_key: "import",
            icon: "mdi-file-cog-outline",
            title: "Import",
            path: "/datasets/import",
          },
          {
            feature_key: "uploads",
            icon: "mdi:folder-upload",
            title: "Upload",
            path: "/datasetUpload",
          },
        ],
      },
      // ── Governance (v2) ──────────────────────────────────────────────────
      {
        icon: "mdi-home-outline",
        title: "Home",
        path: "/v2/home",
        test_id: "sidebar-v2-home",
      },
      {
        icon: `${icons.group}-outline`,
        title: "Groups",
        path: "/v2/groups",
        test_id: "sidebar-v2-groups",
      },
      {
        icon: `${icons.collection}-outline`,
        title: "Collections",
        path: "/v2/collections",
        test_id: "sidebar-v2-collections",
      },
      {
        icon: `${icons.dataset}-outline`,
        title: "Datasets",
        path: "/v2/datasets",
        test_id: "sidebar-v2-datasets",
      },
      {
        icon: `${icons.access_request}-outline`,
        title: "Access Requests",
        path: "/v2/access-requests",
        test_id: "sidebar-v2-access-requests",
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
      //   path: "/datauploader",  // cspell: disable-line
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
      {
        feature_key: "alerts",
        icon: "mdi:alert-outline",
        title: "Alerts",
        path: "/alerts",
        test_id: "sidebar-alerts",
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
  UPLOAD_STATUSES: {
    // Statuses that only appear in the UI
    UNINITIATED: "UNINITIATED",
    COMPUTING_CHECKSUMS: "COMPUTING_CHECKSUMS",
    CHECKSUM_COMPUTATION_FAILED: "CHECKSUM_COMPUTATION_FAILED",
    // Statuses that appear in the UI and are also persisted to the database
    UPLOADING: "UPLOADING",
    UPLOAD_FAILED: "UPLOAD_FAILED",
    UPLOADED: "UPLOADED",
    PROCESSING: "PROCESSING",
    PROCESSING_FAILED: "PROCESSING_FAILED",
    COMPLETE: "COMPLETE",
  },
  DATASET_CREATE_METHODS: {
    UPLOAD: "UPLOAD",
    IMPORT: "IMPORT",
    SCAN: "SCAN",
  },
  auth: {
    verify: {
      response: {
        status: {
          SUCCESS: "success",
          SIGNUP_REQUIRED: "signup_required",
          NOT_A_USER: "not_a_user",
        },
      },
    },
  },
  alerts: {
    types: {
      INFO: "INFO",
      WARNING: "WARNING",
      ERROR: "ERROR",
    },
    statuses: {
      SCHEDULED: "SCHEDULED",
      ACTIVE: "ACTIVE",
      EXPIRED: "EXPIRED",
    },
  },
  icons,
  // A special group that implicitly contains all users. It is used for granting access to all users without having to
  // explicitly add them to a group. id will always be "00000000-0000-0000-0000-000000000000" for consistency,
  // and the backend recognizes this as a special case.
  EVERYONE_GROUP: {
    id: "00000000-0000-0000-0000-000000000000",
    name: "Everyone",
    tag: "everyone",
    icon: "mdi-earth",
    description: "All users in the system, including external collaborators",
  },
};

export default exports;
