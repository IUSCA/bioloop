const { PrismaClient } = require('@prisma/client');
const fs = require('fs');

const prisma = new PrismaClient();
const data = fs.readFileSync('/opt/sca/app/src/scripts/adni.json', 'utf8');
const jsonData = JSON.parse(data);

async function insertData(obj) {
  const img = obj.adni_imaging[0]
  const {main_id, subject_id, num_images, num_as_dx_dasc, num_as_dx_dsbc} = obj

  await prisma.adni_subject.create({
    data: {main_id, subject_id, num_images, num_as_dx_dasc, num_as_dx_dsbc}
  });
  
  const img_promises = obj.adni_imaging.map(img => {
    const {main_id, ...img_data} = img
    return prisma.adni_imaging.create({
      data: {
        ...img_data,
        adni_subject: {
          connect: {
            main_id: obj.main_id,
          },
        },
      },
    })
  })

  return Promise.all(img_promises)
}

(async function () {
  for (const obj of jsonData) {
    console.log(obj.main_id);
    await insertData(obj)
  }
})();
