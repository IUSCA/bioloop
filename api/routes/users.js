let express = require("express");
let router = express.Router();
let common = require("./common");

let { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()




router.get("/", common.check_role("Admin"), async (req, res, next) => {
  const users = await prisma.users.findMany({
    select: { user_id: true, user_name: true, email: true }, 
    where: { is_deleted: false }
  }).catch(err => console.error(err))


  res.json(users)

})

router.post("/", common.check_role("Admin"), async (req, res, next) => {
  const user_name = req.body.user_name

  const result = await prisma.users.create({
    data: {
        user_name: user_name,
        password: "managedByIU",
        name: user_name,
        email: user_name + "@iu.edu",
        notes: user_name,
        user_role: {
            create: {
                role_id: 2
            }
        }
    }
  })

  return res.json(result)
})

router.get('/:id', common.check_role('Admin'), async (req, res, next) => {
  const users = await prisma.users.findUnique({
    select:{user_id: true, name: true, user_name: true, email: true, notes: true},
    where: {user_id: parseInt(req.params.id)}
  }).catch(err => console.error(err))

  res.json(users)
})

router.get('/roles/:id', common.check_role('Admin'), async (req, res, next) => { 
  const result = await prisma.user_role.findMany({
    where: {role_id: parseInt(req.params.id)}, 
    include: {users: {select: {user_id: true, name: true}}}
  })

  res.json(result)
})

router.get('/:id/roles', common.check_role('Admin'), async (req, res, next) => {
  const user_role = await prisma.user_role.findMany({select: {role_id: true}, where: {user_id: parseInt(req.params.id)}}).catch(err => console.error(err))

  res.json(user_role)
  
});

router.put('/:id/roles', common.check_role('Admin'), async (req, res, next) => {
  const user_id = parseInt(req.params.id)
  const user_roles = req.body.data.roles

  if(! user_roles) return res.json({success: false})

  prisma.user_role.deleteMany({where: {user_id: user_id}})

  let transactions = []

  // Delete all the old roles
  transactions.push(prisma.user_role.deleteMany({where: {user_id: user_id}}))

  // Delete old permission settings
  transactions.push(prisma.user_settings.deleteMany({where: {user_id: user_id}}))

  // Delete old saved searches as they may be using old fields
  transactions.push(prisma.user_search.deleteMany({where: {user_id: user_id}}))

  // Create all the new ones
  for(let role_id of user_roles) {
    transactions.push(prisma.user_role.create({
      data: {
        user_id: user_id,
        role_id: parseInt(role_id),
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

router.put('/:id', common.check_role('Admin'), async (req, res, next) => { 
  // these shouldn't be updated
  delete req.body.user_name
  delete req.body.user_id 

  // console.log(req.body)

  const result = await prisma.users.update({where: {user_id: parseInt(req.params.id)}, data: req.body})

  // console.log(result)

  return res.json(result)
})

router.delete('/:id', common.check_role('Admin'), async (req, res, next) => {
  const result = await prisma.users.update({where: {user_id: parseInt(req.params.id)}, data: {is_deleted: true}})

  return res.json(result)
})


router.put('/my/settings', common.check_role('User'), async (req, res, next) => { 
  const user_id = parseInt(common.get_current_user(req, res))
  const settings = req.body



  const result = await prisma.user_settings.upsert({
      where: {user_id: user_id},
      update: {settings: settings},
      create: {settings: settings, user_id: user_id}
  })

  return res.json(result)
})


module.exports = router;
