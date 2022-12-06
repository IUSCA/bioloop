let express = require("express");
let router = express.Router();

let common = require("./common");

let { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient()


router.get('/', common.check_role('Admin'), async (req, res, next) => {
  const roles = await prisma.roles.findMany()

  res.json(roles)
})

router.put('/:id', common.check_role('Admin'), async (req, res, next) => {
   // these shouldn't be updated
   delete req.body.role_id 

   const result = await prisma.roles.update({where: {role_id: parseInt(req.params.id)}, data: req.body})
  
   return res.json(result)
})

router.delete('/:id', common.check_role('Admin'), async (req, res, next) => {
  const role_id = parseInt(req.params.id)


  if(role_id == 1 || role_id == 2) return res.json({success: false})

  let transactions = []

  // Delete all associations
  transactions.push( prisma.user_role.deleteMany({where: {role_id: role_id}}))

  // Delete the role
  transactions.push( prisma.roles.delete({where: {role_id: role_id}}))




  // Run queries as transaction so they get rolled back on failure
  const report = await prisma.$transaction(transactions).catch(err => {
    console.error(err)
    return res.json({failure: err})
  })

  res.json({success: report})



  const result = await prisma.roles.delete({where: {role_id: role_id}})

  return res.json(result)
})

router.put('/:id/permissions', common.check_role('Admin'), async (req, res, next) => {
  const role_id = parseInt(req.params.id)
  const permissions = req.body.data

  if(! permissions) return res.json({success: false})

  let transactions = []

  // Delete all the old roles
  transactions.push( prisma.role_permissions.deleteMany({where: {role_id: role_id}}))

  // Create all the new ones
  for(let permission of permissions) {
    transactions.push( prisma.role_permissions.create({
      data: {
        permission_field: permission.permission_field,
        permission_value: permission.permission_value,
        role_id: role_id,
      }
    }))
  }

  // Run queries as transaction so they get rolled back on failure
  const report = await prisma.$transaction(transactions).catch(err => {
    console.error(err)
    return res.json({failure: err})
  })

  res.json({success: report})
  
})

router.get('/:id/permissions', common.check_role('Admin'), async (req, res, next) => {
  const role_permissions = await prisma.role_permissions.findMany({where: {role_id: parseInt(req.params.id)}}).catch(err => console.error(err))
    
  res.json(role_permissions)
})

router.post('/', common.check_role('Admin'), async (req, res, next) => {
  console.log(req.body)

  const result = await prisma.roles.create({data: req.body}).catch(err => console.error(err))

  res.json({success: result})


})


module.exports = router;