let express = require("express");
let router = express.Router();
let config = require("config");

let { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

// Return the number of items
router.get("/count/", async function (req, res, next) {
  const count = await prisma.adni_imaging.count();
  res.json(count);
});

router.get("/all/", async function (req, res, next) {
  const adni_imaging = await prisma.adni_imaging.findMany({take: 5000});
  res.json(adni_imaging);
});

router.get("/subjs/", async function (req, res, next) {
  const adni_imaging = await prisma.adni_subject.findMany();
  res.json(adni_imaging);
});

router.post("/select/", async function (req, res, next) {
  const body = req.body.params.selectedItems;
  body.selectedItems.forEach(async (selection) => {
    currentDate = new Date();
    const dataId = await prisma.adni_imaging.findFirst({
      where: {id: selection.id}
    });
    const result = await prisma.dataRequest.create({
      data: {
        dataId: dataId.id,
        date: currentDate,
        user: "Matt",
      }
    })
  })
})

module.exports = router;