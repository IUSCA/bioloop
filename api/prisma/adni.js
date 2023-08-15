const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const prisma = new PrismaClient();
const data = fs.readFileSync("adni.json", "utf8");
const jsonData = JSON.parse(data);

async function insertData() {
  await prisma.adni_imaging.deleteMany()
  try {
    for (const obj of jsonData) {
      console.log(obj.rand_id)
      await prisma.adni_imaging.create({
        data: {
          rand_id: obj.rand_id, 
          subject_id: obj.subject_id,
          project: obj.project,
          phase: obj.phase,
          sex: obj.sex,  
          weight: obj.weight,         
          research_group: obj.research_group,
          apoe_a1: obj.apoe_a1,
          apoe_a2: obj.apoe_a2,     
          visit: obj.visit,       
          study_date: obj.study_date,
          archive_date: obj.archive_date,
          age: obj.age,
          global_cdr: obj.global_cdr,
          npiq_total_score: obj.npiq_total_score,
          mmse_total_score: obj.mmse_total_score,
          gdscale_total_score: obj.gdscale_total_score,
          faq_total_score: obj.faq_total_score,
          modality: obj.modality,
          description: obj.description,
          type: obj.type,
          imaging_protocol: obj.imaging_protocol,
          image_id: obj.image_id,
          structure: obj.structure,
          laterality: obj.laterality,
          image_type: obj.image_type, 
          registration: obj.registration,
          tissue: obj.tissue,
        }        
      });
    }
    console.log("Data inserted successfully!");
  } catch (error) {
    console.error("Error inserting data:", error);
  } finally {
    await prisma.$disconnect();
  }
}

insertData();