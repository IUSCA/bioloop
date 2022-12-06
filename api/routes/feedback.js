let express = require("express");
let router = express.Router();

let config = require("config")
let common = require("./common");
let search = require("./search")

const { v4: uuidv4 } = require('uuid');

let { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()



router.post("/", common.check_role("User"), async (req, res, next) => {
    const user_id = common.get_current_user(req, res)

    let query  = undefined
    let report_name = undefined

    if('include_search' in req.body && req.body.include_search) {

        // Assign search string
        let search_name = req.body.search_params.name

        // Get user permissions
        let user_permissions = common.get_permissions(req)

        // If no permissions are found return nothing
        if(Object.keys(user_permissions).length === 0) return res.json({})

        // assign requested fields
        let requested_fields = req.body.search_params.fields

        // Get any filter requests from user
        let searchFilters = req.body.search_params.searchFilters

        // Gather pagination data
        let pageSize =  1000 
        let currentPage = 0

        // Build the query based on permissions and request parameters
        query = search.get_user_search(search_name, user_permissions, requested_fields, searchFilters, pageSize, currentPage)

        report_name = uuidv4()

        let result = await search.create_csv_from_query(query, config.get("files.feedback") + report_name)

        if(! result) return res.sendStatus(404);

    }

  
    const result = await prisma.feedback.create({ 
        data: {
            issue_name: req.body.issue_name,
            issue_description: req.body.issue_description,
            report_name: report_name,
            search_params: query,
            status: 'Submitted',
            requester_id: user_id,
            notes: [],
        } 
    })

    return res.json(result)
})

router.get("/", common.check_role("Admin"), async (req, res, next) => {

    const result = await prisma.feedback.findMany({
        orderBy: {feedback_id: 'desc'},
        include:{
            requester: {select: {name: true}}, 
        }
    })
  
    return res.json(result)
})

router.get("/my", common.check_role("Admin"), async (req, res, next) => {
    const user_id = common.get_current_user(req, res)

    const result = await prisma.feedback.findMany({
        where: {assigner_id: user_id},
        orderBy: {feedback_id: 'desc'},
        include:{
            requester: {select: {name: true}}, 
        }
    })
  
    return res.json(result)
})

router.get("/status/:status", common.check_role("Admin"), async (req, res, next) => {

    const result = await prisma.feedback.findMany({
        where: {status: req.params.status},
        orderBy: {feedback_id: 'desc'},
        include:{
            requester: {select: {name: true}}, 
        }
    })
  
    return res.json(result)
})



router.get("/file/:report_name", common.check_role("Admin"), async (req, res, next) => {

    const result = await prisma.feedback.findUnique({where: {report_name: String(req.params.report_name)}})

    if (result) return res.download(config.get("files.feedback") + result.report_name)

    return res.json({})
})

router.patch("/:feedback_id", common.check_role("Admin"), async (req, res, next) => {
    const result = await prisma.feedback.update({
        where:{feedback_id: parseInt(req.params.feedback_id)},
        data: {
            feedback_date: req.body.feedback_date ? req.body.feedback_date : undefined,
            assigner_id: req.body.assigner_id ? req.body.assigner_id : undefined,
            status: req.body.status ? req.body.status : undefined,
            notes: req.body.notes ? req.body.notes : undefined,
        }
    })

    return res.json(result)
})

module.exports = router;