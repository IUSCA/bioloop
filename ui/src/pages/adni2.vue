<template>
  <div>
    <section class="hero">
      <div id="app" class="hero-text container">
        <hr />
        <hr />

        <!-- <div class="row"> -->
        <va-select
          v-model="category1"
          :options="options1"
          placeholder="Assessments"
          class="select1"
        />
        <va-select
          v-model="category2"
          :options="options2"
          placeholder="Diagnosis"
          class="select1"
        />
        <va-select
          v-model="category3"
          :options="options3"
          placeholder="Diagnosis and Symptoms Checklist (AS-DX-DASC)"
          class="select2"
        />
        <va-button @click="addTable">Add</va-button>
        <va-button @click="removeTable">Remove</va-button>
        <va-button @click="clearTable">Clear</va-button>
        <!-- </div> -->

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
        </div>

        <!-- Import spinner component -->
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
      { key: "subject_id", sortable: true },
      { key: "num_images", sortable: true },
      { key: "num_as_dx_dasc", sortable: true },
      { key: "num_as_dx_dsbc", sortable: true },
    ];

    return {
      items: [],
      columns,
      // perPage: 16,
      currentPage: 1,
      filter: "",
      filtered: [],
      selectedItems: [],
      numPages: 0,
      isDisabled: true,
      category1: "Assessments",
      options1: [
        "Assessments",
        "Biospecimen",
        "Curated Data Cuts",
        "Enrollment",
        "Genetic",
        "Imaging",
        "Medical History",
        "Neuropathology",
        "Study Info",
        "Subject Characteristics",
        "Test Data",
      ],
      category2: "Diagnosis",
      options2: ["Diagnosis", "Neuropsychological", "Non-clinical Assessments"],
      category3: "Diagnosis and Symptoms Checklist (AS-DX-DASC)",
      options3: [
        "Diagnosis and Symptoms Checklist (AS-DX-DASC)",
        "Diagnostic Summary - Baseline Changes (AS-DX-DSBC)",
        "Diagnostic Summary (AS-DX-DS)",
      ],
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
    category1: {
      handler: function () {
        if (this.category1 == "Assessments") {
          this.category2 = "Diagnosis";
          this.options2 = [
            "Diagnosis",
            "Neuropsychological",
            "Non-clinical Assessments",
          ];
        }
        if (this.category1 == "Biospecimen") {
          this.category2 = "Biosample Inventory";
          this.options2 = [
            "Biosample Inventory",
            "Biospecimen Results",
            "Lab Collection Procedures",
          ];
        }
        if (this.category1 == "Curated Data Cuts") {
          this.category2 = "Curated Data & Docs";
          this.options2 = ["Curated Data & Docs"];
        }
        if (this.category1 == "Enrollment") {
          this.category2 = "Enrollment";
          this.options2 = ["Enrollment"];
        }
        if (this.category1 == "Genetic") {
          this.category2 = "Genotype Results";
          this.options2 = ["Genotype Results", "Other Genetic Data & Info"];
        }
        if (this.category1 == "Imaging") {
          this.category2 = "MR Image Acquisition";
          this.options2 = [
            "MR Image Acquisition",
            "MR Image Analysis",
            "MR Image Quality",
            "PET Image Acquisition",
            "PET Image Analysis",
            "PET Image Quality",
          ];
        }
        if (this.category1 == "Medical History") {
          this.category2 = "Adverse Events";
          this.options2 = [
            "Adverse Events",
            "Drugs",
            "Medical History",
            "Physical/Neurological Exams",
          ];
        }
        if (this.category1 == "Neuropathology") {
          this.category2 = "Neuropathology Results";
          this.options2 = ["Neuropathology Results"];
        }
        if (this.category1 == "Study Info") {
          this.category2 = "Data & Database";
          this.options2 = [
            "Data & Database",
            "Data Submission Standards",
            "Study Protocols & CRFs",
          ];
        }
        if (this.category1 == "Subject Characteristics") {
          this.category2 = "Family History";
          this.options2 = ["Family History", "Subject Demographics"];
        }
        if (this.category1 == "Test Data") {
          this.category2 = "Data for Challenges";
          this.options2 = ["Data for Challenges"];
        }
      },
      deep: true,
    },
    category2: {
      handler: function () {
        if (this.category2 == "Diagnosis") {
          this.category3 = "Diagnosis and Symptoms Checklist (AS-DX-DASC)";
          this.options3 = [
            "Diagnosis and Symptoms Checklist (AS-DX-DASC)",
            "Diagnostic Summary - Baseline Changes (AS-DX-DSBC)",
            "Diagnostic Summary (AS-DX-DSRY)",
          ];
        }
        if (this.category2 == "Neuropsychological") {
          this.category3 = "ADAS Sub-Scores and Total Scores (AS-DX-DASC)";
          this.options3 = [
            "ADAS Sub-Scores and Total Scores",
            "ADSP-PHC - Composite Cognitive Scores Dictionary",
            "ADSP-PHC - Composite Cognitive Scores Methods",
            "ADSP-PHC - Composite Cognitive Scores",
            "Alzheimer's Disease Assessment Scale (ADAS)",
            "Alzheimer's Disease Assessment Scale (ADAS)",
            "Clinical Dementia Rating Scale (CDR)",
            "Cognitive Change Index",
            "Cogstate Battery Documentation",
            "Cogstate Battery Results",
            "Cogstate Brief Battery",
            "Embic Corporation – Digital Cognitive Biomarkers",
            "Embic Corporation – Digital Cognitive Biomarkers Methods",
            "Everyday Cognition - Participant Self Report",
            "Everyday Cognition - Study Partner Report",
            "Financial Capacity Instrument Short Form (FCI-SF)",
            "Functional Activities Questionnaire (FAQ)",
            "Geriatric Depression Scale (GDS)",
            "Item Level Data (ADAS-Cog, ANART, MMSE, etc)",
            "Mini-Mental State Examination (MMSE)",
            "Modified Hachinski Ischemia Scale",
            "Montreal Cognitive Assessment (MoCA)",
            "Neuropsychiatric Inventory (NPI)",
            "Neuropsychiatric Inventory Questionnaire (NPI-Q)",
            "Neuropsychological Battery",
            "UW - Neuropsych Summary Scores Methods",
            "UW - Neuropsych Summary Scores",
          ];
        }
        if (this.category2 == "Non-clinical Assessments") {
          this.category3 = "Brain Health Registry";
          this.options3 = [
            "Brain Health Registry",
            "Brain Health Registry: BASELINE QUESTIONNAIRE",
            "Brain Health Registry: EVERYDAY COGNITION",
            "Brain Health Registry: LONGITUDINAL QUESTIONNAIRE",
            "Brain Health Registry: MEMTRAX Information",
            "Brain Health Registry: MEMTRAX",
            "Brain Health Registry: Overview",
            "Brain Health Registry: STUDY PARTNER ADL",
            "Brain Health Registry: STUDY PARTNER CAREGIVER BURDEN",
            "Brain Health Registry: STUDY PARTNER EVERYDAY COGNITION",
            "Brain Health Registry: STUDY PARTNER FAQ",
            "Brain Health Registry: STUDY PARTNER INITIAL",
            "Brain Health Registry: STUDY PARTNER RELATIONSHIP",
            "Brain Health Registry: STUDY PARTNER STUDY CONFIRMATION",
          ];
        }
        if (this.category2 == "Biosample Inventory") {
          this.category3 = "Aliquot Count in the LDMS Database (BS-BI-ACLD)";
          this.options3 = [
            "Aliquot Count in the LDMS Database (BS-BI-ACLD)",
            "CSF Aliquot Inventory (BS-BI-CFAI)",
            "Plasma Aliquot Inventory (BS-BI-PLAI)",
            "Residual Aliquot Count in the LDMS Database Document (BS-BI-RLDD)",
            "Residual Aliquot Count in the LDMS Database (BS-BI-RALD)",
          ];
        }
        if (this.category2 == "Biospecimen Results") {
          this.category3 =
            "UPENN - 2D-UPLC tandem mass spectrometry measurement of Abeta42, Abeta40 and Abeta38 adjustment of Abeta42 results to CRM";
          this.options3 = [
            "UPENN - 2D-UPLC tandem mass spectrometry measurement of Abeta42, Abeta40 and Abeta38 adjustment of Abeta42 results to CRM",
            "AD Metabolomics Consortium Barcelona Purines",
            "AD Metabolomics Consortium Barcelona Purines Dictionary",
            "AD Metabolomics Consortium Barcelona Purines Methods",
            "AD Metabolomics Consortium Bile Acids - Post Processed Data Dictionary",
            "AD Metabolomics Consortium Bile Acids - Post Processed Data",
            "AD Metabolomics Consortium Bile Acids Dictionary",
            "AD Metabolomics Consortium Bile Acids Methods",
            "AD Metabolomics Consortium Bile Acids",
            "AD Metabolomics Consortium Lipidomics Methods",
            "ADMC About the Metabolomics Data",
            "ADMC Duke ADNI1 Baseline Drug Classes",
            "ADMC Duke ADNI2/GO Drug Classes",
            "ADMC Duke Biocrates MxP Quant 500 Analysis Methods",
            "ADMC Duke Biocrates MxP Quant 500 Flow injection analysis Longitudinal QC",
            "ADMC Duke Biocrates MxP Quant 500 Flow injection analysis Longitudinal",
            "ADMC Duke Biocrates MxP Quant 500 Ultra Performance Liquid Chromatography Longitudinal QC",
            "ADMC Duke Biocrates MxP Quant 500 Ultra Performance Liquid Chromatography Longitudinal",
            "ADMC Duke Biocrates P180 Kit Flow injection analysis Dictionary",
            "ADMC Duke Biocrates p180 Kit Flow injection analysis Dictionary",
            "ADMC Duke Biocrates P180 Kit Flow injection analysis",
            "ADMC Duke Biocrates p180 Kit Flow injection analysis2",
            "ADMC Duke Biocrates P180 Kit Ultra Performance Liquid Chromatography Dictionary",
            "ADMC Duke Biocrates P180 Kit Ultra Performance Liquid Chromatography Methods",
            "ADMC Duke Biocrates P180 Kit Ultra Performance Liquid Chromatography",
            "ADMC Duke Clinical Variables",
            "ADMC Duke p180 Flow injection analysis - Post Processed Data",
            "ADMC Duke p180 Flow injection analysis Raw Spectra",
            "ADMC Duke p180 Mass Spec Worklist Files",
            "ADMC Duke p180 Supplementary Files",
            "ADMC Duke P180 Ultra Performance Liquid Chromatography - Post Processed Data",
            "ADMC Duke p180 Ultra Performance Liquid Chromatography Dictionary",
            "ADMC Duke P180 Ultra Performance Liquid Chromatography Raw Spectra",
            "ADMC Duke p180 Ultra Performance Liquid Chromatography",
            "ADMC Duke p180 Worklist Raw File Mapping Data Dictionary",
            "ADMC Leiden Oxylipins Baseline HighConfidence HPH",
            "ADMC Leiden Oxylipins Baseline HighConfidence LPH",
            "ADMC Leiden Oxylipins Baseline WithCaution HPH",
            "ADMC Leiden Oxylipins Baseline WithCaution LPH",
            "ADMC Lipidomics Extracted Ion Chromatigrams",
            "ADMC Lipidomics Measured Lipid Molecules Data (ISA-tab)",
            "ADMC Lipidomics Measured Lipid Molecules Data Dictionary",
            "ADMC Lipidomics Measured Lipid Molecules Data Matrix",
            "ADMC Lipidomics Meikle Lab Baseline Data Matrix Dictionary",
            "ADMC Lipidomics Meikle Lab Baseline Data Matrix Methods",
            "ADMC Lipidomics Meikle Lab Baseline Data Matrix Version History",
            "ADMC Lipidomics Meikle Lab Baseline Data Matrix",
            "ADMC Lipidomics Meikle Lab Longitudinal Data Matrix Dictionary",
            "ADMC Lipidomics Meikle Lab Longitudinal Data Matrix Methods",
            "ADMC Lipidomics Meikle Lab Longitudinal Data Matrix",
            "ADMC Lipidomics Raw LCMS data files ESI negative modes",
            "ADMC Lipidomics Raw LCMS data files ESI positive modes",
            "ADMC Lipidomics Sample Prep and Analysis Methods",
            "ADMC M2OVE-AD ADNIGO-2 Bile Acids Dictionar",
            "ADMC M2OVE-AD ADNIGO-2 Bile Acids",
            "ADMC Metabolomic Analysis by Gas chromatography time of flight mass spectrometry (GCTOF) Data Dictionary",
            "ADMC Metabolomic Analysis by Gas chromatography time of flight mass spectrometry (GCTOF) Data",
            "ADMC Metabolomic Analysis by Gas chromatography time of flight mass spectrometry (GCTOF) Methods",
            "ADMC Nightingale Platform NMR Analysis of Lipoproteins and Metabolites Longitudinal Dictionary",
            "ADMC Nightingale Platform NMR Analysis of Lipoproteins and Metabolites Longitudinal",
            "ADMC Nightingale Platform NMR Analysis of Lipoproteins and Metabolites Methods",
            "ADMC Nightingale Platform NMR Analysis of Lipoproteins and Metabolites Dictionary",
            "ADMC Nightingale Platform NMR Analysis of Lipoproteins and Metabolites Longitudinal Methods",
            "ADMC Nightingale Platform NMR Analysis of Lipoproteins and Metabolites",
            "ADMC Nightingale Platform NMR Post-Unblinding Re-Analysis of Lipoproteins and Metabolites Dictionary",
            "ADMC Nightingale Platform NMR Post-Unblinding Re-Analysis of Lipoproteins and Metabolites Methods",
            "ADMC Nightingale Platform NMR Post-Unblinding Re-Analysis of Lipoproteins and Metabolites",
            "ADMC Phenomenome Phosphatidylcholine, Lysophosphatidylcholine Flow Injection Negative Ionization LC-MS/MS Internal Std Ratios",
            "ADMC Phenomenome Phosphatidylcholine, Lysophosphatidylcholine Flow Injection Negative Ionization LC-MS/MS Internal Std Ratios Dictionary",
            "ADMC Phenomenome Phosphatidylcholine, Lysophosphatidylcholine Flow Injection Negative Ionization LC-MS/MS Internal Std Ratios Processing",
            "ADMC Phenomenome Phosphatidylcholine, Lysophosphatidylcholine Flow Injection Negative Ionization LC-MS/MS Protocol",
            "ADMC Phenomenome Phosphatidylcholine, Lysophosphatidylcholine, Sphingomyeline Flow Injection Positive Ionization LC-MS/MS Internal Standard Ratios",
            "ADMC Phenomenome Phosphatidylcholine, Lysophosphatidylcholine, Sphingomyeline Flow Injection Positive Ionization LC-MS/MS Internal Standard Ratios Dictionary",
            "ADMC Phenomenome Phosphatidylcholine, Lysophosphatidylcholine, Sphingomyeline Flow Injection Positive Ionization LC-MS/MS Internal Standard Ratios Protocol",
            "ADMC Phenomenome Phosphatidylethanolamine, Plasmenylethanolamine Flow Injection LC-MS/MS Internal Std Ratios",
            "ADMC Phenomenome Phosphatidylethanolamine, Plasmenylethanolamine Flow Injection LC-MS/MS Internal Std Ratios Dictionary",
            "ADMC Phenomenome Phosphatidylethanolamine, Plasmenylethanolamine Flow Injection LC-MS/MS Peak Heights Dictionary",
            "ADMC Phenomenome Phosphatidylethanolamine, Plasmenylethanolamine Flow Injection LC-MS/MS Peak Heights Supplementary Materials",
            "ADMC Phenomenome Phosphatidylethanolamine, Plasmenylethanolamine Flow Injection LC-MS/MS Peak Heights",
            "ADMC Phenomenome Phosphatidylethanolamine, Plasmenylethanolamine Flow Injection LC-MS/MS Protocol",
            "ADMC Supplemental Materials",
            "ADMC Targeted UHPLC-MS analysis of High-Value Metabolites in Serum Samples Dictionary",
            "ADMC Targeted UHPLC-MS analysis of High-Value Metabolites in Serum Samples",
            "ADMC U Hawaii UPLC-MS/MS Gut Metabolites Serum Longitudinal Dictionary",
            "ADMC U Hawaii UPLC-MS/MS Gut Metabolites Serum Longitudinal Methods",
            "ADMC U Hawaii UPLC-MS/MS Gut Metabolites Serum Longitudinal",
            "ADMC UCSD Untargeted Metabolomics with LC MSMS Baseline Methods",
            "ADMC UCSD Untargeted Metabolomics with LC MSMS Baseline Plate 01 of 10",
            "ADMC UCSD Untargeted Metabolomics with LC MSMS Baseline Plate 02 of 10",
            "ADMC UCSD Untargeted Metabolomics with LC MSMS Baseline Plate 03 of 10",
            "ADMC UCSD Untargeted Metabolomics with LC MSMS Baseline Plate 04 of 10",
            "ADMC UCSD Untargeted Metabolomics with LC MSMS Baseline Plate 05 of 10",
            "ADMC UCSD Untargeted Metabolomics with LC MSMS Baseline Plate 06 of 10",
            "ADMC UCSD Untargeted Metabolomics with LC MSMS Baseline Plate 07 of 10",
            "ADMC UCSD Untargeted Metabolomics with LC MSMS Baseline Plate 08 of 10",
            "ADMC UCSD Untargeted Metabolomics with LC MSMS Baseline Plate 09 of 10",
            "ADMC UCSD Untargeted Metabolomics with LC MSMS Baseline Plate 10 of 10",
            "ADNI Biomarker Core Laboratory. Baseline Isoprostanes Data",
            "ADNI3 URMC Lab Data",
            "ADSP Phenotype Harmonization Consortium (PHC) - Composite Biomarker Scores Dictionary",
            "ADSP Phenotype Harmonization Consortium (PHC) - Composite Biomarker Scores Methods",
            "ADSP Phenotype Harmonization Consortium (PHC) - Composite Biomarker Scores",
            "ApoE - Results",
            "Araclon Biotech S.L. AB test40 and 42 Plasma Analysis",
            "Araclon Biotech S.L. ABtest40 and 42 Plasma Analysis Version 1.0 Methods",
            "Bateman Lab Plasma Abeta42/Abeta40 Ratio as a Predictor of Brain Amyloidosis Methods",
            "Bateman Lab Plasma Abeta42/Abeta40 Ratio as a Predictor of Brain Amyloidosis Methods",
            "Bateman Lab Plasma Abeta42/Abeta40 Ratio as a Predictor of Brain Amyloidosis",
            "Bateman Lab Plasma Abeta42/Abeta40 Ratio as a Predictor of Brain Amyloidosis",
            "Biomarker Samples",
            "Biomarkers Consortium ADNI CSF BACE ACTIVITY and sAPPbeta Data & Primer",
            "Biomarkers Consortium CSF Proteomics MRM Consolidated Data",
            "Biomarkers Consortium CSF Proteomics MRM Data Primer",
            "Biomarkers Consortium CSF Proteomics MRM Data",
            "Biomarkers Consortium CSF Proteomics Project RBM Multiplex Data and Primer",
            "Biomarkers Consortium Plasma Proteomics Project RBM Multiplex Data and Primer",
            "Blennow Lab - CSF NFL Methods",
            "Blennow Lab - CSF NFL",
            "Blennow Lab - CSF Ng Methods",
            "Blennow Lab - CSF Ng",
            "Blennow Lab - Plasma NFL Methods",
            "Blennow Lab - Plasma Tau Methods",
            "Blennow Lab - Plasma Tau",
            "Blennow Lab ADNI1 Plasma neurofilament light (NFL)",
            "Blennow Lab ADNI1-2 Plasma neurofilament light (NFL) longitudinal",
            "Blennow Lab CSF GAP 43 Methods",
            "Blennow Lab CSF GAP 43",
            "Blood-based biomarkers for early diagnosis and progression of Alzheimer's disease GenePix data",
            "Blood-based biomarkers for early diagnosis and progression of Alzheimer's disease GenePix data methods",
            "CruchagaLab_CSF_metabolomic_matrix_20230620",
            "CruchagaLab_CSF_metabolomic_matrix_20230620",
            "CruchagaLab_CSF_SOMAscan7k_Protein_matrix_postQC_20230620",
            "CruchagaLab_CSF_SOMAscan7k_Protein_matrix_postQC_20230620",
            "CSF - Local Lab Results",
            "CSF Hemoglobin ELISA and PS129 Luminex Assays (Zhang Lab, University of Washington) METHODS",
            "CSF Hemoglobin ELISA and PS129 Luminex Assays (Zhang Lab, University of Washington)",
            "CSF soluble triggering receptor expressed on myeloid cells 2 (sTREM2) and progranulin (PGRN) Methods",
            "CSF soluble triggering receptor expressed on myeloid cells 2 (sTREM2) and progranulin (PGRN)",
            "DDE Analysis Summary Methods",
            "DDE Analysis Summary",
            "Diadem - AlzoSure Predict",
            "Diadem - AlzoSure Predict Methods",
            "Emory University CSF Targeted MS Methods",
            "Emory University CSF Targeted MS SET2",
            "Emory University CSF Targeted MS",
            "EUROIMMUN CSF Beta-Amyloid",
            "Fagan Lab - CSF Visinin-like Protein-1 (VILIP-1) Methods",
            "Fagan Lab - CSF Visinin-like Protein-1 (VILIP-1)",
            "FNIH Biomarkers Consortium CSF Proteomics Project",
            "FNIH Biomarkers Consortium Plasma Abeta Project: ADx VUmc",
            "FNIH Biomarkers Consortium Plasma Abeta Project: Methodology and Assay Validation Reports",
            "FNIH Biomarkers Consortium Plasma Abeta Project: Quanterix",
            "FNIH Biomarkers Consortium Plasma Abeta Project: Roche",
            "FNIH Biomarkers Consortium Plasma Abeta Project: Shimadzu",
            "FNIH Biomarkers Consortium Plasma Abeta Project: U of Gothenburg",
            "FNIH Biomarkers Consortium Plasma Abeta Project: Wash U",
            "FNIH Biomarkers Consortium Plasma pTau-181 Project Methodology and Assay Validation Reports",
            "FNIH Biomarkers Consortium Plasma pTau-181 Project",
            "Fujirebio Beta-Amyloid Ratio",
            "Homocysteine - Results	",
            "Hu Lab CSF inflammatory proteins Methods",
            "Hu Lab CSF inflammatory proteins",
            "Institut Agro-ecole Interne Agrocampus Ouest Lipids in Red Blood Cells Methods",
            "Institut Agro-ecole Interne Agrocampus Ouest Lipids in Red Blood Cells",
            "Lab Reference Range Report",
            "Lab Test Code List",
            "Meso Scale Diagnostics Analysis of Residual CSF Samples Methods",
            "Meso Scale Diagnostics Analysis of Residual CSF Samples",
            "Plasma Amyloid Beta (1-42/1-40) Ratio Biomarker Feasibility Study - Fujirebio Lumipulse",
            "Plasma Amyloid Beta (1-42/1-40) Ratio Biomarker Feasibility Study - Fujirebio Lumipulse Methods",
            "Plasma NT1-tau in ADNI",
            "Plasma NT1-tau in ADNI [ADNI2,3] Methods",
            "Rader Lab ADNI 1 Lipids CAD ALZ Dictionary",
            "Rader Lab ADNI 1 Lipids CAD ALZ",
            "Redox reactive autoantibodies Methods",
            "Redox Reactive Autoantibodies",
            "Serum Autoantibody Data - Set 1 of 1 (Zip file)",
            "Serum Autoantibody Methods",
            "University of Gothenburg Longitudinal Plasma P-tau181 Methods",
            "University of Gothenburg Longitudinal Plasma P-tau181",
            "UPENN - 2D-UPLC tandem mass spectrometry measurement of Abeta42, Abeta40 and Abeta38 Dictionary Methods",
            "UPENN - 2D-UPLC tandem mass spectrometry measurement of Abeta42, Abeta40 and Abeta38 Methods",
            "UPENN - 2D-UPLC tandem mass spectrometry measurement of Abeta42, Abeta40 and Abeta38 2018-06-20",
            "UPENN - 2D-UPLC tandem mass spectrometry measurement of Abeta42, Abeta40 and Abeta38 2016-08-29",
            "UPENN - ADNI/DIAN study CSF Elecsys results Methods",
            "UPENN - ADNI/DIAN Study CSF Elecsys Results",
            "UPENN - Plasma Biomarker Data",
            "UPENN CSF Biomarker Master Methods",
            "UPENN CSF Biomarker Master",
            "UPENN CSF Biomarkers Elecsys Methods 2021-01-04",
            "UPENN CSF Biomarkers Elecsys METHODS 2017-04-11",
            "UPENN CSF Biomarkers Elecsys Methods 2019-07-29",
            "UPENN CSF Plasma miRNA Data",
            "UPENN CSF Plasma miRNA Methods",
            "UW - CSF Alpha-synuclein Protocol",
            "UW - CSF Alpha-synuclein",
            "UW - CSF Complement 3 & Factor H Protocol",
            "UW - CSF Complement 3 & Factor H",
            "UW - Plasma EV Apogee Methods",
            "UW - Plasma EV Apogee",
          ];
        }
        if (this.category2 == "Lab Collection Procedures") {
          this.category3 = "ApoE Genotyping - Draw Data";
          this.options3 = [
            "ApoE Genotyping - Draw Data",
            "Clinical Laboratory Tests",
            "Genetic Sample Collection",
            "Laboratory Data",
            "Method of CSF Collection",
          ];
        }
        if (this.category2 == "Curated Data & Docs") {
          this.category3 = "ADNI-DIAN Comparison Study Data Subset";
          this.options3 = [
            "ADNI-DIAN Comparison Study Data Subset",
            "ADNI-DIAN Comparison Study Summary Doc",
          ];
        }
        if (this.category2 == "Enrollment") {
          this.category3 = "Additional Comments";
          this.options3 = [
            "Additional Comments",
            "ADNI 2 Visit Codes Assignment Methods",
            "ADNI 2 Visit Codes Lookup",
            "Arm",
            "Clinician Verification",
            "Clinician Verification",
            "Early Discontinuation and Withdrawal",
            "Exclusion Criteria",
            "Inclusion Criteria",
            "Neuropathology Status",
            "Registry",
            "Roster",
            "Study Visits Summary",
            "Visits",
          ];
        }
        if (this.category2 == "Genotype Results") {
          this.category3 = "Desikan Lab Polygenic Hazard Score (PHS) Methods";
          this.options3 = [
            "Desikan Lab Polygenic Hazard Score (PHS) Methods",
            "Desikan Lab Polygenic Hazard Score (PHS)",
            "MAP2K3 genotyping data methods",
            "TOMM40 PolyT Variant Data",
          ];
        }
        if (this.category2 == "Other Genetic Data & Info") {
          this.category3 = "About the Genetic Data";
          this.options3 = [
            "About the Genetic Data",
            "ADNI 1 DNA Source Reference",
            "ADNI 1 GWAS Data Dictionary",
            "ADNI GO/2 DNA Source Reference",
            "ADNI GO/2 GWAS Data Dictionary",
            "ADNI Telomere length / Single copy gene (T/S) ratio of DNA from blood Methods",
            "ADNI Telomere length / Single copy gene (T/S) ratio of DNA from blood, adjusted for confounders",
            "TOMM40 PolyT Variant Data - About the Data",
          ];
        }
        if (this.category2 == "MR Image Acquisition") {
          this.category3 = "1.5T MRI Scan Information";
          this.options3 = [
            "1.5T MRI Scan Information",
            "3T MRI Scan Information",
            "ADNI 3 Diffusion Gradient Table information for GE",
            "ADNI 3 Diffusion Gradient Table information for Philips",
            "ADNI 3 Diffusion Gradient Table information for Siemens",
            "MP-RAGE Metadata Listing",
            "MRI B1 Calibration",
            "MRI Clinical Read",
            "MRI Protocol",
            "MRI Scan Metadata Listing",
            "MRI Serial",
            "MRI Subject Inclusion",
          ];
        }
        if (this.category2 == "MR Image Analysis") {
          this.category3 = "ASHS volume data";
          this.options3 = [
            "ASHS volume data",
            "ADNI3 MRI Analysis Manual",
            "ADSP Phenotype Harmonization Consortium (PHC) - Meta Data for U24 Phase 1 T1 Release",
            "ASHS volume data methods",
            "BAI - MRI NMRC Summaries",
            "EADC - Harmonized Hippocampal Protocol Training Dataset",
            "Fox Lab - BSI Measures Methods",
            "Fox Lab - BSI Measures",
            "Jack Lab - ADNI MRI MCH",
            "Jack Lab - fMRI Network Failure Quotient (NFQ)",
            "Jack Lab - TBM-SyN Based Scores",
            "Mayo (Jack Lab) - Default Mode Network Connectivity",
            "Mayo (Jack Lab) - Task-Free fMRI Summary Metric of DMN ROIs Methods",
            "Mayo (Jack Lab) - TBM-SyN Based Scores Methods",
            "MRI Infarcts Methods",
            "MRI Infarcts",
            "UA - MRI SPM Voxel Based Morphometry (VBM) Analysis",
            "UCD - Total Cranial Vault Segmentation Method and Grading Rubric",
            "UCD - Total Cranial Vault Segmentation",
            "UCD - White Matter Hyperintensity Volumes Methods 2013-12-15",
            "UCD - White Matter Hyperintensity Volumes Methods 2013-12-18",
            "UCD - White Matter Hyperintensity Volumes 2022-05-02",
            "UCD - White Matter Hyperintensity Volumes 2013-12-16",
            "UCD - White Matter Hyperintensity Volumes 2019-04-30",
            "UCL - Boundary Shift Integral Summaries Methods 2012-03-12",
            "UCL - Boundary Shift Integral Summaries",
            "UCLA - DTI ROI Summary Measures Methods",
            "UCSD - Derived Volumes",
            "UCSF - ADNI-1 3T Cross-Sectional FreeSurfer (5.1)",
            "UCSF - ASL Perfusion CBF by FreeSurfer ROI 2022-08-17",
            "UCSF - ASL Perfusion CBF by FreeSurfer ROI 2015-11-02",
            "UCSF - ASL Perfusion Processing Methods 2012-12-04",
            "UCSF - Cross-Sectional FreeSurfer (5.1) 2019-11-08",
            "UCSF - Cross-Sectional FreeSurfer (6.0) 2022-08-17",
            "UCSF - Cross-Sectional FreeSurfer (FreeSurfer Version 4.3) 2015-11-02",
            "UCSF - FreeSurfer Methods",
            "UCSF - Longitudinal FreeSurfer (5.1) - All Available Base Image 2016-08-01",
            "UCSF - Longitudinal FreeSurfer (5.1) - Final Run w/ All A 2022-03-01",
            "UCSF - Longitudinal FreeSurfer (FreeSurfer Version 4.4) 2016-02-01",
            "UCSF - Longitudinal FreeSurfer (FreeSurfer Version 5.1) - Year 1 Base Image 2016-08-01",
            "UCSF - Regional Atrophy Rates",
            "UCSF - SNT Hippocampal Volumes Methods",
            "UCSF - SNT Hippocampal Volumes",
            "UPENN - Hierarchical Parcellation of MRI Using Multi-atlas Labeling Methods PDF",
            "UPENN - Hierarchical Parcellation of MRI Using Multi-atlas Labeling Methods",
            "UPENN - Spatial Pattern of Abnormalities for Recognition of Early AD (SPARE-AD) Methods (PDF)",
            "UPENN - Spatial Pattern of Abnormalities for Recognition of Early AD (SPARE-AD)",
            "UPENN - Spatial Pattern of Abnormalities for Recognition of Early MCI (SPARE-MCI) Methods (PDF)",
            "UPENN - Spatial Pattern of Abnormalities for Recognition of Early MCI to AD conversion (SPARE-MCI)",
            "USC - DTI ROI Summary Measures v1",
            "USC - DTI ROI Summary Measures v2 (Mean)",
            "USC - DTI ROI Summary Measures v2 (Robust Mean)",
            "USC - Tensor-Based Morphometry Methods",
            "USC - Tensor-based Morphometry Versions 2.0 and 2.1 2022-03-17",
            "USC - Tensor-based Morphometry Versions 2.0 and 2.1 2021-12-13",
          ];
        }
        if (this.category2 == "MR Image Quality") {
          this.category3 = "Listing of Changed LONI Study IDs";
          this.options3 = [
            "Listing of Changed LONI Study IDs",
            "Mayo (Jack Lab) - ADNI 3 MRI QC",
            "Mayo (Jack Lab) - ADNI GO/2 MRI QC Methods",
            "Mayo (Jack Lab) - ADNI GO/2 MRI QC",
            "Mayo (Jack Lab) - ADNI MRI MCH Methods",
            "MRI MPRAGE Process",
            "MRI MPRAGE Ranking",
            "MRI Quality",
            "UCSF - ASL Perfusion Raw QC Guide",
            "UCSF - ASL Perfusion Raw QC",
          ];
        }
        if (this.category2 == "PET Image Acquisition") {
          this.category3 = "Amyloid PET Scan Information";
          this.options3 = [
            "Amyloid PET Scan Information",
            "AV-45 PET Scan Information",
            "FDG PET Scan Information [ADNI1]",
            "FDG PET Scan Information [ADNI3]",
            "FDG PET Scan Information [ADNIGO,2]",
            "PET Metadata Listing [ADNI1,GO,2]",
            "PET Scanner Smoothing Table",
            "PIB Scan Information [ADNI1]",
            "Tau AV-1451 PET Eligibility [ADNI2]",
            "Tau AV-1451 PET Scan Information [ADNI2]",
            "Tau AV-1451 PET Scan Information [ADNI3]",
          ];
        }
        if (this.category2 == "PET Image Analysis") {
          this.category3 = "BAI - NMRC Summaries [ADNI1]";
          this.options3 = [
            "BAI - NMRC Summaries [ADNI1]",
            "BAI - PET NMRC Amyloid Convergence Index Methods (PDF)",
            "BAI - PET NMRC Hypometabolic Convergence Index Methods (PDF)",
            "BAI - PET NMRC Summaries Methods (PDF)",
            "BAI - PET NMRC AV45 Summaries Methods (PDF)	2019-09-17",
            "BAI - PET NMRC AV45 Summaries [ADNIGO,2,3] 2020-10-23",
            "BAI - PET NMRC FDG Summaries Methods (PDF) 2020-12-11",
            "BAI - PET NMRC FDG Summaries [ADNI1,GO,2,3]	2020-12-11",
            "BAI - PET NMRC Flortaucipir (F-AV1451) Summaries [ADNI2,3] 2022-08-17",
            "BAI - PET NMRC Flortaucipir (F-AV1451) Summaries [ADNI2,3] Methods (PDF) 2020-03-03",
            "BAI - PET NMRC Summaries Analysis Methods (PDF)	2015-07-13",
            "BAI - PET NMRC Summaries [ADNI1,GO,2,3]	2018-04-12",
            "Cross-Validation [ADNI1] 2011-04-21",
            "Instructions for converting ADNI processing results to Centiloids (PDF)	2021-09-30",
            "NYU FDG-PET Hippocampus (pons normalized) Methods (PDF)",
            "NYU FDG-PET Hippocampus (pons normalized) [ADNI1]",
            "sPAP Avid ADNI Florbetapir Summaries Methods (PDF) 2013-05-01",
            "sPAP Avid ADNI Florbetapir Summaries [ADNIGO,2]	2013-05-01",
            "UC Berkeley - Amyloid PET 6mm Res analysis [ADNI1,GO,2,3,4]",
            "UC Berkeley - Amyloid PET Processing Methods [ADNI1,GO,2,3,4] (PDF) 2023-06-29",
            "UC Berkeley - AV1451 8mm Res Analysis [ADNI2,3]	  Version: 2023-02-17",
            "UC Berkeley - AV1451 Analysis Methods [ADNI1,GO,2,3](PDF) 2021-11-15",
            "UC Berkeley - AV1451 PVC 8mm Res Analysis [ADNI2,3]	2023-02-17",
            "UC Berkeley - AV45 8mm Res Analysis [ADNIGO,2,3] 2023-02-17",
            "UC Berkeley - FBB 8mm Res Analysis [ADNI3] 2023-02-17",
            "UC Berkeley - FDG 8mm Res Analysis [ADNI1,GO,2,3] 2023-02-17",
            "UC Berkeley - FDG Analysis Methods [ADNI1,GO,2,3] 2022-03-23",
            "UC Berkeley - PET 8mm-to-6mm Transformation Methods [ADNI1,GO,2,3, 4] 2023-06-29",
            "UC Berkeley - Tau PET 6mm Res analysis [ADNI2,3,4]",
            "UC Berkeley - Tau PET PVC 6mm Res analysis [ADNI2,3,4] 2023-07-21",
            "UPitt - PIB PET Analysis [ADNI1]",
            "UU - PET AD Subjects Cerebral Metabolic Pattern of Glucose Uptake Consistent with Frontotemporal Dementia in Baseline FDG-PET (PDF)",
            "UU - PET Analysis (Norman Foster) Methods (PDF) [ADNI1,GO,2] 2016-07-18",
            "UU - PET Analysis (Norman Foster) [ADNI1,GO,2] 2016-07-18",
            "UU - PET Analysis Description (PDF)",
            "UU - PET Analysis Methods Aug2015 2015-08-13",
          ];
        }
        if (this.category2 == "PET Image Quality") {
          this.category3 = "Amyloid PET QC [ADNI3]";
          this.options3 = [
            "Amyloid PET QC [ADNI3]",
            "AV-45 PET QC Tracking [ADNIGO,2]",
            "FDG PET QC [ADNI3]",
            "Florbetapir PET Templates for Control and AD Subjects 2017-07-17",
            "PET QC Tracking [ADNI1,GO,2]",
            "PIB QC Tracking [ADNI1]",
            "Tau AV-1451 PET QC [ADNI2]",
            "Tau AV-1451 PET QC [ADNI3]",
          ];
        }
        if (this.category2 == "Adverse Events") {
          this.category3 = "Adverse Events Log [ADNI3]";
          this.options3 = [
            "Adverse Events Log [ADNI3]",
            "Adverse Events/ Hospitalizations [ADNI1,GO,2]",
            "AV-45 24-48 Hour Follow-Up [ADNIGO,2]",
          ];
        }
        if (this.category2 == "Drugs") {
          this.category3 = "Concurrent Medications Log [ADNI1,GO,2,3]";
          this.options3 = [
            "Concurrent Medications Log [ADNI1,GO,2,3]",
            "Key Background Medications [ADNIGO,2,3]",
          ];
        }
        if (this.category2 == "Medical History") {
          this.category3 = "Anti-Amyloid Treatment Information [ADNI3]";
          this.options3 = [
            "Anti-Amyloid Treatment Information [ADNI3]",
            "Documentation of Baseline Symptoms Log [ADNI1,GO,2]",
            "Initial Health Assessment [ADNI3]",
            "Medical History [ADNI1,GO,2]",
            "Recent Medical History Details Log [ADNI1,GO,2]",
          ];
        }
        if (this.category2 == "Physical/Neurological Exams") {
          this.category3 = "AV-45 Pre and Post Injection Vitals [ADNIGO,2]";
          this.options3 = [
            "AV-45 Pre and Post Injection Vitals [ADNIGO,2]",
            "Baseline Symptoms Checklist [ADNI1,GO,2]",
            "ECG [ADNI2] 2016-05-27",
            "Neurological Exam [ADNI1,GO,2,3]",
            "Physical Exam [ADNI1,GO,2,3]",
            "Vital Signs [ADNI1,GO,2,3]",
          ];
        }
        if (this.category2 == "Neuropathology Results") {
          this.category3 =
            "NACC Neuropathology Data Form [ADNI1,GO,2,3] 2023-02-06";
          this.options3 = [
            "NACC Neuropathology Data Form [ADNI1,GO,2,3] 2023-02-06",
            "NACC Neuropathology Data Methods (PDF)",
          ];
        }
        if (this.category2 == "Data & Database") {
          this.category3 = "ADNI 1.5T MRI Standardized Lists";
          this.options3 = [
            "ADNI 1.5T MRI Standardized Lists",
            "ADNI 3T MRI Standardized Lists 2012-08-27",
            "ADNIMERGE - Key ADNI tables merged into one table - Dictionary [ADNI1,GO,2,3]",
            "ADNIMERGE - Key ADNI tables merged into one table - Packages for R [ADNI1,GO,2]",
            "ADNIMERGE - Key ADNI tables merged into one table - Packages for SAS [ADNI1,GO,2]",
            "ADNIMERGE - Key ADNI tables merged into one table - Packages for SPSS [ADNI1,GO,2]",
            "ADNIMERGE - Key ADNI tables merged into one table - Packages for Stata [ADNI1,GO,2]",
            "ADNIMERGE - Key ADNI tables merged into one table Methods (PDF) [ADNI1,GO,2] 2013-04-29",
            "ADNIMERGE - Key ADNI tables merged into one table [ADNI1,GO,2,3]",
            "Data Dictionary [ADNI1,GO,2,3]",
            "Deleted Scan Listing",
            "Return of Research Results [ADNI2,3]",
          ];
        }
        if (this.category2 == "Data Submission Standards") {
          this.category3 = "ADNI Methods Template (DOCX) 2012-10-04";
          this.options3 = [
            "ADNI Methods Template (DOCX) 2012-10-04",
            "Data Submission Metadata Standard (PDF)	2012-01-10",
          ];
        }
        if (this.category2 == "Study Protocols & CRFs") {
          this.category3 = "ADNI 1 Case Report Forms (PDF) 2018-07-24";
          this.options3 = [
            "ADNI 1 Case Report Forms (PDF) 2018-07-24",
            "ADNI Available Data Matrix(PDF)",
            "ADNI GO Case Report Forms (PDF)",
          ];
        }
        if (this.category2 == "Family History") {
          this.category3 = "Family History - Parents [ADNI3]";
          this.options3 = [
            "Family History - Parents [ADNI3]",
            "Family History - Sibling Log [ADNI3]",
            "Family History Questionnaire Subtable [ADNI1,GO,2]",
            "Family History Questionnaire [ADNI1,GO,2]",
          ];
        }
        if (this.category2 == "Subject Demographics") {
          this.category3 = "Subject Demographics [ADNI1,GO,2,3]";
          this.options3 = ["Subject Demographics [ADNI1,GO,2,3]"];
        }
        if (this.category2 == "Data for Challenges") {
          this.category3 = "AD Challenge Training Data: Clinical (Updated)";
          this.options3 = [
            "AD Challenge Training Data: Clinical (Updated)",
            "AD Challenge Training Data: Imaging",
            "AD Challenge Training Data: Imaging Vertices",
            "QT-PAD Challenge",
            "Tadpole Challenge Data",
          ];
        }
      },
      deep: true,
    },
  },

  methods: {
    async getProjects() {
      this.items = [];
      const result = (await ViewService.getSubjects()).data;
      this.items = result;
      this.perPage = 16;
    },
    async addTable() {
      console.log(this.category1);
      console.log(this.category2);
      console.log(this.category3);
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

.select1 {
  width: 200px;
}

.select2 {
  width: 950px;
}

.va-button {
  width: auto;
  max-width: 62px;
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
