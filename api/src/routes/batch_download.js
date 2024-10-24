const express = require('express');
const router = express.Router();
const { accessControl } = require('../middleware/auth');

const isPermittedTo = accessControl('batch_download');
const batchDownloadService = require('../services/batch_download');

router.get('/:id', isPermittedTo('create'), async (req, res) => {
  try {
    const { id } = req.params;
    const workflow = await batchDownloadService.intiate_download(id);
    res.json(workflow);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
