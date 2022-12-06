let express = require("express");
let router = express.Router();

let common = require("./common");
let config = require("config")

let fs = require("fs")
let papaparse = require("papaparse")

let { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const { MeiliSearch } = require('meilisearch')
// const movies = require('./movies.json')

const client = new MeiliSearch({ host: config.get("ms.host") })

router.post("/", common.check_role("Admin"), async (req, res, next) => {

  client.index('movies').addDocuments(movies)
    .then((res) => console.log(res))

});



router.get("/fields", common.check_role("Admin"), async(req, res, next) => {
  // TODO: find filters / facets

})


module.exports.router = router;

