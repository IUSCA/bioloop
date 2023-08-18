const { PrismaClient } = require('@prisma/client');
const fs = require('fs');

const prisma = new PrismaClient();
const data = fs.readFileSync('adni.json', 'utf8');
const jsonData = JSON.parse(data);
let scount = 0;

function insertData() {
  prisma.as_dx_dasc.deleteMany();
  prisma.adni_imaging.deleteMany();
  prisma.adni_subject.deleteMany();
  total_subjs = Object.keys(jsonData).length;
  try {
    for (const obj of jsonData) {
      aimg = obj.adni_imaging;
      prisma.adni_subject.create({
        data: {
          main_id: obj.main_id,
          subject_id: obj.subject_id,
          num_images: obj.num_images,
          num_as_dx_dasc: obj.num_as_dx_dasc,
          num_as_dx_dsbc: obj.num_as_dx_dsbc,
        },
      });
    }
    for (const obj of jsonData) {
      scount += 1;
      console.log(`Participant ${scount} out of ${total_subjs}`);
      aimg = obj.adni_imaging;
      for (img of aimg) {
        prisma.adni_imaging.create({
          data: {
            rid: img.rid,
            aimg_id: img.aimg_id,
            subject_id: img.subject_id,
            project: img.project,
            phase: img.phase,
            sex: img.sex,
            weight: img.weight,
            research_group: img.research_group,
            apoe_a1: img.apoe_a1,
            apoe_a2: img.apoe_a2,
            visit: img.visit,
            study_date: img.study_date,
            archive_date: img.archive_date,
            age: img.age,
            global_cdr: img.global_cdr,
            npiq_total_score: img.npiq_total_score,
            mmse_total_score: img.mmse_total_score,
            gdscale_total_score: img.gdscale_total_score,
            faq_total_score: img.faq_total_score,
            modality: img.modality,
            description: img.description,
            type: img.type,
            imaging_protocol: img.imaging_protocol,
            image_id: img.image_id,
            structure: img.structure,
            laterality: img.laterality,
            image_type: img.image_type,
            registration: img.registration,
            tissue: img.tissue,
            adni_subject: {
              connect: {
                main_id: obj.main_id,
              },
            },
          },
        });
      }
      for (let i = 0; i < obj.as_dx_dasc.length; i++) {
        prisma.as_dx_dasc.create({
          data: {
            as_dx_dasc_id: obj.as_dx_dasc[i].as_dx_dasc_id,
            rid: obj.as_dx_dasc[i].rid,
            site_id: obj.as_dx_dasc[i].site_id,
            vis_code: obj.as_dx_dasc[i].vis_code,
            vis_code2: obj.as_dx_dasc[i].vis_code2,
            user_date: obj.as_dx_dasc[i].user_date,
            user_date2: obj.as_dx_dasc[i].user_date2,
            exam_date: obj.as_dx_dasc[i].exam_date,
            ax_nausea: obj.as_dx_dasc[i].ax_nausea,
            ax_vomit: obj.as_dx_dasc[i].ax_vomit,
            ax_diarrh: obj.as_dx_dasc[i].ax_diarrh,
            ax_constp: obj.as_dx_dasc[i].ax_constp,
            ax_abdomn: obj.as_dx_dasc[i].ax_abdomn,
            ax_sweatn: obj.as_dx_dasc[i].ax_sweatn,
            ax_dizzy: obj.as_dx_dasc[i].ax_dizzy,
            ax_energy: obj.as_dx_dasc[i].ax_energy,
            ax_drowsy: obj.as_dx_dasc[i].ax_drowsy,
            ax_vision: obj.as_dx_dasc[i].ax_vision,
            ax_hdache: obj.as_dx_dasc[i].ax_hdache,
            ax_drymth: obj.as_dx_dasc[i].ax_drymth,
            ax_breath: obj.as_dx_dasc[i].ax_breath,
            ax_cough: obj.as_dx_dasc[i].ax_cough,
            ax_palpit: obj.as_dx_dasc[i].ax_palpit,
            ax_chest: obj.as_dx_dasc[i].ax_chest,
            ax_urndis: obj.as_dx_dasc[i].ax_urndis,
            ax_urnfrq: obj.as_dx_dasc[i].ax_urnfrq,
            ax_ankle: obj.as_dx_dasc[i].ax_ankle,
            ax_muscle: obj.as_dx_dasc[i].ax_muscle,
            ax_rash: obj.as_dx_dasc[i].ax_rash,
            ax_insomn: obj.as_dx_dasc[i].ax_insomn,
            ax_dpmood: obj.as_dx_dasc[i].ax_dpmood,
            ax_crying: obj.as_dx_dasc[i].ax_crying,
            ax_elmood: obj.as_dx_dasc[i].ax_elmood,
            ax_wander: obj.as_dx_dasc[i].ax_wander,
            ax_fall: obj.as_dx_dasc[i].ax_fall,
            ax_other: obj.as_dx_dasc[i].ax_other,
            ax_specif: obj.as_dx_dasc[i].ax_specif,
            update_stamp: obj.as_dx_dasc[i].update_stamp,
            adni_subject: {
              connect: {
                main_id: obj.main_id,
              },
            },
          },
        });
      }
    }
    console.log('Data inserted successfully!');
  } catch (error) {
    console.error('Error inserting data:', error);
  } finally {
    prisma.$disconnect();
  }
}

insertData();
