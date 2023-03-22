const express = require('express');

const router = express.Router();

const options = {
  dotfiles: 'ignore',
  etag: true,
  index: false,
  lastModified: false,
  maxAge: '1d',
  redirect: false,
};

router.use(express.static('reports', options));

module.exports = router;
