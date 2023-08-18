<template>
  <div>
    <section class="hero">
      <div id="app" class="hero-text container">
        <hr />
        <va-checkbox v-model="rIdValue" class="mb-6" :label="rId" />
        <va-checkbox v-model="projectValue" class="mb-6" :label="project" />
        <va-checkbox v-model="phaseValue" class="mb-6" :label="phase" />
        <va-checkbox v-model="sexValue" class="mb-6" :label="sex" />
        <va-checkbox v-model="weightValue" class="mb-6" :label="weight" />
        <va-checkbox
          v-model="researchGroupValue"
          class="mb-6"
          :label="researchGroup"
        />
        <va-checkbox v-model="apoeA1Value" class="mb-6" :label="apoeA1" />
        <va-checkbox v-model="apoeA2Value" class="mb-6" :label="apoeA2" />
        <va-checkbox v-model="visitValue" class="mb-6" :label="visit" />
        <va-checkbox v-model="studyDateValue" class="mb-6" :label="studyDate" />
        <va-checkbox
          v-model="archiveDateValue"
          class="mb-6"
          :label="archiveDate"
        />
        <va-checkbox v-model="ageValue" class="mb-6" :label="age" />
        <va-checkbox v-model="npiqScoreValue" class="mb-6" :label="npiqScore" />
        <va-checkbox v-model="mmseScoreValue" class="mb-6" :label="mmseScore" />
        <va-checkbox
          v-model="gdscaleScoreValue"
          class="mb-6"
          :label="gdscaleScore"
        />
        <va-checkbox v-model="faqScoreValue" class="mb-6" :label="faqScore" />
        <va-checkbox v-model="modalityValue" class="mb-6" :label="modality" />
        <va-checkbox
          v-model="descriptionValue"
          class="mb-6"
          :label="description"
        />
        <va-checkbox v-model="typeValue" class="mb-6" :label="type" />
        <va-checkbox
          v-model="imagingProtocolValue"
          class="mb-6"
          :label="imagingProtocol"
        />
        <va-checkbox v-model="imageIdValue" class="mb-6" :label="imageId" />
        <va-checkbox v-model="structureValue" class="mb-6" :label="structure" />
        <va-checkbox
          v-model="lateralityValue"
          class="mb-6"
          :label="laterality"
        />
        <va-checkbox v-model="imageTypeValue" class="mb-6" :label="imageType" />
        <va-checkbox
          v-model="registrationValue"
          class="mb-6"
          :label="registration"
        />
        <va-checkbox v-model="tissueValue" class="mb-6" :label="tissue" />
        <va-checkbox
          v-model="num_as_dx_dascValue"
          class="mb-6"
          :label="num_as_dx_dasc"
        />
        <va-checkbox
          v-model="num_as_dx_dsbcValue"
          class="mb-6"
          :label="num_as_dx_dsbc"
        />
        <hr />
        <div class="row">
          <va-input
            v-model.number="perPage"
            class="flex flex-col mb-2 md3"
            type="number"
            placeholder="Items..."
            label="Items per page"
          />
          <va-input
            v-model.number="currentPage"
            class="flex flex-col mb-2 md3"
            type="number"
            placeholder="Page..."
            label="Current page"
          />
          <va-input
            v-model="filter"
            class="flex flex-col mb-2 md6"
            placeholder="Filter..."
          />
          <va-button @click="getProjects">Update</va-button>
        </div>

        <template v-if="items.length == 0">
          <div class="radar-spinner" :style="spinnerStyle">
            <div class="circle">
              <div class="circle-inner-container">
                <div class="circle-inner"></div>
              </div>
            </div>

            <div class="circle">
              <div class="circle-inner-container">
                <div class="circle-inner"></div>
              </div>
            </div>

            <div class="circle">
              <div class="circle-inner-container">
                <div class="circle-inner"></div>
              </div>
            </div>

            <div class="circle">
              <div class="circle-inner-container">
                <div class="circle-inner"></div>
              </div>
            </div>
          </div>
        </template>

        <template v-if="items.length > 0">
          <va-data-table
            v-model="selectedItems"
            :items="items"
            :columns="columns"
            :per-page="perPage"
            :current-page="currentPage"
            :selectable="true"
            @filtered="filtered = $event.items"
          >
            <template #bodyAppend>
              <tr>
                <td colspan="8">
                  <div class="table-example--pagination">
                    <va-pagination
                      v-if="typeof currentPage === 'number'"
                      v-model="currentPage"
                      input
                      :pages="pages"
                    />
                  </div>
                </td>
              </tr>
            </template>
          </va-data-table>
        </template>
      </div>
    </section>
  </div>
</template>

<script>
import { defineComponent } from "vue";
import axios from "axios";
import config from "../config";
import ViewService from "../services/view";
// import LogsService from "../services/logs"

const token = ref(useLocalStorage("token", ""));

const instance = axios.create({
  baseURL: config.apiBasePath,
});

export default defineComponent({
  data() {
    const columns = [
      // { key: "id", sortable: true, width: "60px" },
      // { key: "rand_id", sortable: true},
    ];

    return {
      items: [],
      columns,
      perPage: 15,
      currentPage: 1,
      filter: "",
      filtered: [],
      selectedItems: [],
      numPages: 0,
      isDisabled: true,
      imageId: "Image ID",
      imageIdValue: false,
      rId: "RID",
      rIdValue: true,
      project: "Project",
      projectValue: false,
      phase: "Phase",
      phaseValue: true,
      sex: "Sex",
      sexValue: false,
      weight: "Weight",
      weightValue: false,
      researchGroup: "Research Group",
      researchGroupValue: false,
      apoeA1: "APOE A1",
      apoeA1Value: false,
      apoeA2: "APOE A2",
      apoeA2Value: false,
      visit: "Visit",
      visitValue: false,
      studyDate: "Study Date",
      studyDateValue: true,
      archiveDate: "Archive Date",
      archiveDateValue: false,
      age: "Age",
      ageValue: true,
      npiqScore: "NPIQ Score",
      npiqScoreValue: false,
      mmseScore: "MMSE Score",
      mmseScoreValue: true,
      gdscaleScore: "GDS Score",
      gdscaleScoreValue: false,
      faqScore: "FAQ Score",
      faqScoreValue: false,
      modality: "Modality",
      modalityValue: true,
      description: "Description",
      descriptionValue: true,
      type: "Type",
      typeValue: true,
      imagingProtocol: "Imaging Protocol",
      imagingProtocolValue: false,
      structure: "Structure",
      structureValue: true,
      laterality: "Laterality",
      lateralityValue: false,
      imageType: "Image Type",
      imageTypeValue: false,
      registration: "Registration",
      registrationValue: false,
      tissue: "Tissue",
      tissueValue: false,
      num_as_dx_dasc: "AS-DX-DASC",
      num_as_dx_dascValue: false,
      num_as_dx_dsbc: "AS-DX-DSBC",
      num_as_dx_dsbcValue: false,
    };
  },

  mounted() {
    this.getProjects();
  },

  computed: {
    pages() {
      return this.perPage && this.perPage !== 0
        ? Math.ceil(this.filtered.length / this.perPage)
        : this.filtered.length;
    },
  },

  watch: {
    currentPage: {
      handler: function () {
        if (this.currentPage == "") {
          this.currentPage = 1;
        }
      },
      deep: true,
    },
    perPage: {
      handler: function () {
        if (this.perPage !== "") {
          this.getProjects();
        } else {
          this.perPage = 8;
        }
      },
      deep: true,
    },
    selectedItems: {
      handler: function () {
        if (this.selectedItems.length == 0) {
          this.isDisabled = true;
        } else {
          this.isDisabled = false;
        }
      },
      deep: true,
    },
    rIdValue: {
      handler: function () {
        if (this.rIdValue) {
          this.items = [];
          this.columns.push({ key: "rid", sortable: true });
          this.getProjects();
        } else {
          const index = this.columns.findIndex(
            (column) => column.key === "rid"
          );
          if (index !== -1) this.items = [];
          this.columns.splice(index, 1);
          this.getProjects();
        }
      },
      immediate: true,
    },
    projectValue: {
      handler: function () {
        if (this.projectValue) {
          this.columns.push({ key: "project", sortable: true });
        } else {
          const index = this.columns.findIndex(
            (column) => column.key === "project"
          );
          if (index !== -1) this.columns.splice(index, 1);
        }
      },
      immediate: true,
    },
    phaseValue: {
      handler: function () {
        if (this.phaseValue) {
          this.columns.push({ key: "phase", sortable: true });
        } else {
          const index = this.columns.findIndex(
            (column) => column.key === "phase"
          );
          if (index !== -1) this.columns.splice(index, 1);
        }
      },
      immediate: true,
    },
    sexValue: {
      handler: function () {
        if (this.sexValue) {
          this.columns.push({ key: "sex", sortable: true });
        } else {
          const index = this.columns.findIndex(
            (column) => column.key === "sex"
          );
          if (index !== -1) this.columns.splice(index, 1);
        }
      },
      immediate: true,
    },
    weightValue: {
      handler: function () {
        if (this.weightValue) {
          this.columns.push({ key: "weight", sortable: true });
        } else {
          const index = this.columns.findIndex(
            (column) => column.key === "weight"
          );
          if (index !== -1) this.columns.splice(index, 1);
        }
      },
      immediate: true,
    },
    researchGroupValue: {
      handler: function () {
        if (this.researchGroupValue) {
          this.columns.push({ key: "research_group", sortable: true });
        } else {
          const index = this.columns.findIndex(
            (column) => column.key === "research_group"
          );
          if (index !== -1) this.columns.splice(index, 1);
        }
      },
      immediate: true,
    },
    apoeA1Value: {
      handler: function () {
        if (this.apoeA1Value) {
          this.columns.push({ key: "apoe_a1", sortable: true });
        } else {
          const index = this.columns.findIndex(
            (column) => column.key === "apoe_a1"
          );
          if (index !== -1) this.columns.splice(index, 1);
        }
      },
      immediate: true,
    },
    apoeA2Value: {
      handler: function () {
        if (this.apoeA2Value) {
          this.columns.push({ key: "apoe_a2", sortable: true });
        } else {
          const index = this.columns.findIndex(
            (column) => column.key === "apoe_a2"
          );
          if (index !== -1) this.columns.splice(index, 1);
        }
      },
      immediate: true,
    },
    visitValue: {
      handler: function () {
        if (this.visitValue) {
          this.columns.push({ key: "visit", sortable: true });
        } else {
          const index = this.columns.findIndex(
            (column) => column.key === "visit"
          );
          if (index !== -1) this.columns.splice(index, 1);
        }
      },
      immediate: true,
    },
    studyDateValue: {
      handler: function () {
        if (this.studyDateValue) {
          this.columns.push({ key: "study_date", sortable: true });
        } else {
          const index = this.columns.findIndex(
            (column) => column.key === "study_date"
          );
          if (index !== -1) this.columns.splice(index, 1);
        }
      },
      immediate: true,
    },
    archiveDateValue: {
      handler: function () {
        if (this.archiveDateValue) {
          this.columns.push({ key: "archive_date", sortable: true });
        } else {
          const index = this.columns.findIndex(
            (column) => column.key === "archive_date"
          );
          if (index !== -1) this.columns.splice(index, 1);
        }
      },
      immediate: true,
    },
    ageValue: {
      handler: function () {
        if (this.ageValue) {
          this.columns.push({ key: "age", sortable: true });
        } else {
          const index = this.columns.findIndex(
            (column) => column.key === "age"
          );
          if (index !== -1) this.columns.splice(index, 1);
        }
      },
      immediate: true,
    },
    npiqScoreValue: {
      handler: function () {
        if (this.npiqScoreValue) {
          this.columns.push({ key: "npiq_total_score", sortable: true });
        } else {
          const index = this.columns.findIndex(
            (column) => column.key === "npiq_total_score"
          );
          if (index !== -1) this.columns.splice(index, 1);
        }
      },
      immediate: true,
    },
    mmseScoreValue: {
      handler: function () {
        if (this.mmseScoreValue) {
          this.columns.push({ key: "mmse_total_score", sortable: true });
        } else {
          const index = this.columns.findIndex(
            (column) => column.key === "mmse_total_score"
          );
          if (index !== -1) this.columns.splice(index, 1);
        }
      },
      immediate: true,
    },
    gdscaleScoreValue: {
      handler: function () {
        if (this.gdscaleScoreValue) {
          this.columns.push({ key: "gdscale_total_score", sortable: true });
        } else {
          const index = this.columns.findIndex(
            (column) => column.key === "gdscale_total_score"
          );
          if (index !== -1) this.columns.splice(index, 1);
        }
      },
      immediate: true,
    },
    faqScoreValue: {
      handler: function () {
        if (this.faqScoreValue) {
          this.columns.push({ key: "faq_total_score", sortable: true });
        } else {
          const index = this.columns.findIndex(
            (column) => column.key === "faq_total_score"
          );
          if (index !== -1) this.columns.splice(index, 1);
        }
      },
      immediate: true,
    },
    modalityValue: {
      handler: function () {
        if (this.modalityValue) {
          this.columns.push({ key: "modality", sortable: true });
        } else {
          const index = this.columns.findIndex(
            (column) => column.key === "modality"
          );
          if (index !== -1) this.columns.splice(index, 1);
        }
      },
      immediate: true,
    },
    descriptionValue: {
      handler: function () {
        if (this.descriptionValue) {
          this.columns.push({ key: "description", sortable: true });
        } else {
          const index = this.columns.findIndex(
            (column) => column.key === "description"
          );
          if (index !== -1) this.columns.splice(index, 1);
        }
      },
      immediate: true,
    },
    typeValue: {
      handler: function () {
        if (this.typeValue) {
          this.columns.push({ key: "type", sortable: true });
        } else {
          const index = this.columns.findIndex(
            (column) => column.key === "type"
          );
          if (index !== -1) this.columns.splice(index, 1);
        }
      },
      immediate: true,
    },
    imagingProtocolValue: {
      handler: function () {
        if (this.imagingProtocolValue) {
          this.columns.push({ key: "imaging_protocol", sortable: true });
        } else {
          const index = this.columns.findIndex(
            (column) => column.key === "imaging_protocol"
          );
          if (index !== -1) this.columns.splice(index, 1);
        }
      },
      immediate: true,
    },
    imageIdValue: {
      handler: function () {
        if (this.imageIdValue) {
          this.columns.push({ key: "image_id", sortable: true });
        } else {
          const index = this.columns.findIndex(
            (column) => column.key === "image_id"
          );
          if (index !== -1) this.columns.splice(index, 1);
        }
      },
      immediate: true,
    },
    structureValue: {
      handler: function () {
        if (this.structureValue) {
          this.columns.push({ key: "structure", sortable: true });
        } else {
          const index = this.columns.findIndex(
            (column) => column.key === "structure"
          );
          if (index !== -1) this.columns.splice(index, 1);
        }
      },
      immediate: true,
    },
    lateralityValue: {
      handler: function () {
        if (this.lateralityValue) {
          this.columns.push({ key: "laterality", sortable: true });
        } else {
          const index = this.columns.findIndex(
            (column) => column.key === "laterality"
          );
          if (index !== -1) this.columns.splice(index, 1);
        }
      },
      immediate: true,
    },
    imageTypeValue: {
      handler: function () {
        if (this.imageTypeValue) {
          this.columns.push({ key: "image_type", sortable: true });
        } else {
          const index = this.columns.findIndex(
            (column) => column.key === "image_type"
          );
          if (index !== -1) this.columns.splice(index, 1);
        }
      },
      immediate: true,
    },
    registrationValue: {
      handler: function () {
        if (this.registrationValue) {
          this.columns.push({ key: "registration", sortable: true });
        } else {
          const index = this.columns.findIndex(
            (column) => column.key === "registration"
          );
          if (index !== -1) this.columns.splice(index, 1);
        }
      },
      immediate: true,
    },
    tissueValue: {
      handler: function () {
        if (this.tissueValue) {
          this.columns.push({ key: "tissue", sortable: true });
        } else {
          const index = this.columns.findIndex(
            (column) => column.key === "tissue"
          );
          if (index !== -1) this.columns.splice(index, 1);
        }
      },
      immediate: true,
    },
    num_as_dx_dascValue: {
      handler: function () {
        if (this.num_as_dx_dascValue) {
          this.columns.push({ key: "num_as_dx_dasc", sortable: true });
        } else {
          const index = this.columns.findIndex(
            (column) => column.key === "num_as_dx_dasc"
          );
          if (index !== -1) this.columns.splice(index, 1);
        }
      },
      immediate: true,
    },
    num_as_dx_dsbcValue: {
      handler: function () {
        if (this.num_as_dx_dsbcValue) {
          this.columns.push({ key: "num_as_dx_dsbc", sortable: true });
        } else {
          const index = this.columns.findIndex(
            (column) => column.key === "num_as_dx_dsbc"
          );
          if (index !== -1) this.columns.splice(index, 1);
        }
      },
      immediate: true,
    },
  },

  methods: {
    async getProjects() {
      this.items = [];
      const result = (await ViewService.getData()).data;
      this.items = result;
    },
    async requestData() {
      this.isDisabled = true;
      ViewService.postSelects({ selectedItems: this.selectedItems });
      // LogsService.postSelects({selectedItems: this.selectedItems})
      // window.location.reload()
    },
    updateTable() {
      this.items = [];
    },
  },
});
</script>

<style>
.va-table-responsive {
  overflow: auto;
}

.va-button {
  width: 100%;
}

.table-example--pagination {
  display: flex;
  justify-content: center;
}

.radar-spinner,
.radar-spinner * {
  box-sizing: border-box;
}

.radar-spinner {
  height: 60px;
  width: 60px;
  position: relative;
}

.radar-spinner .circle {
  position: absolute;
  height: 100%;
  width: 100%;
  top: 0;
  left: 0;
  animation: radar-spinner-animation 2s infinite;
}

.radar-spinner .circle:nth-child(1) {
  padding: calc(60px * 5 * 2 * 0 / 110);
  animation-delay: 300ms;
}

.radar-spinner .circle:nth-child(2) {
  padding: calc(60px * 5 * 2 * 1 / 110);
  animation-delay: 300ms;
}

.radar-spinner .circle:nth-child(3) {
  padding: calc(60px * 5 * 2 * 2 / 110);
  animation-delay: 300ms;
}

.radar-spinner .circle:nth-child(4) {
  padding: calc(60px * 5 * 2 * 3 / 110);
  animation-delay: 0ms;
}

.radar-spinner .circle-inner,
.radar-spinner .circle-inner-container {
  height: 100%;
  width: 100%;
  border-radius: 50%;
  border: calc(60px * 5 / 110) solid transparent;
}

.radar-spinner .circle-inner {
  border-left-color: #0962e8;
  border-right-color: #0962e8;
}

@keyframes radar-spinner-animation {
  50% {
    transform: rotate(180deg);
  }
  100% {
    transform: rotate(0deg);
  }
}
</style>
