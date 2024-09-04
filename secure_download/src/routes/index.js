const express = require('express');
const createError = require('http-errors');
const fs = require('fs');
const fsPromises = require('fs/promises');
const path = require('path');
const multer = require('multer');
const { createHash } = require('node:crypto');

const config = require('config');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.get('/health', (req, res) => { res.send('OK'); });
router.get('/favicon.ico', (req, res) => res.status(204));

// From this point on, all routes require authentication.
router.use(authenticate);

router.use('/download', require('./download'));
router.use('/upload', require('./upload'));

module.exports = router;
