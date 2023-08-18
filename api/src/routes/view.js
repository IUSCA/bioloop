const express = require('express');

const router = express.Router();
const config = require('config');

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Return the number of items
router.get('/count/', async (req, res, next) => {
  const count = await prisma.adni_imaging.count();
  res.json(count);
});

router.get('/all/', async (req, res, next) => {
  const adni_imaging = await prisma.adni_imaging.findMany({ take: 5000 });
  res.json(adni_imaging);
});

router.get('/subjs/', async (req, res, next) => {
  const adni_imaging = await prisma.adni_subject.findMany();
  res.json(adni_imaging);
});

router.post('/select/', async (req, res, next) => {
  const body = req.body.params.selectedItems;
  body.selectedItems.forEach(async (selection) => {
    const currentDate = new Date();
    const dataId = await prisma.adni_imaging.findFirst({
      where: { id: selection.id },
    });
    await prisma.dataRequest.create({
      data: {
        dataId: dataId.id,
        date: currentDate,
        user: 'Matt',
      },
    });
  });
});

module.exports = router;
