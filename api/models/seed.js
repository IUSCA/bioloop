const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {


    // Create default roles
    const roles = [{
        role_id: 1,
        role_name: 'Admin',
        role_description: 'Access to the Admin Panel.',
    },
    {
        role_id: 2,
        role_name: 'User',
        role_description: 'Access to the gpdb.',
    }]

    for (let role of roles) {
        let new_role
        new_role = await prisma.roles.upsert({
            where: { role_id: role.role_id },
            create: role,
            update: role
        })

        console.log(new_role)
    }

    // Create default admins
    const admins = ['ryanlong', 'ccbrandt']

    for (let user_name of admins) {
        const new_user = await prisma.users.upsert({
            where: { email: `${user_name}@iu.edu` },
            update: {},
            create: {
                user_name: user_name,
                password: "managedByIU",
                name: user_name,
                email: `${user_name}@iu.edu`,
                notes: user_name,
                user_role: {
                    create: [{ role_id: 1 }, { role_id: 2 }],
                }
            }
        })

        console.log(new_user)
    }
}

main()
    .then(async () => {
        await prisma.$disconnect()
    })
    .catch(async (e) => {
        console.error(e)
        await prisma.$disconnect()
        process.exit(1)
    })