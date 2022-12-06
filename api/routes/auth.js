//n//node
let {PrismaClient} = require('@prisma/client');
const prisma = new PrismaClient()

let fs = require("fs");
let path = require("path");

//contrib
let express = require("express");

let winston = require("winston");
let parseString = require("xml2js").parseString;




//mine
let router = express.Router();

let axios = require("axios");
let common = require("./common");
let config = require("config");






router.get('/verify', function (req, res, next) {
authheader = req.headers.authorization
if (!authheader) res.sendStatus('403')
else {
    let token = authheader.split(' ')[1]
    let valid = common.check_jwt(token)
    
    valid !== undefined ? res.json('success') : res.sendStatus('403')
    
}
});

router.post("/login", async (req, res, next) => {
// console.log(req)
let ticket = req.body.casTicket;
let service = req.body.casReturn;

try {
    let response = await axios.get( config.get("casUrl") + ticket + "&service=" + service, { timeout: 2000, } )
    
    if (response.status == 200) {
    parseString(response.data, async (err, result) => {

        // If CAS call is succesful
        if (!err && response.data.includes("authenticationSuccess")) {
            let uid = result["cas:serviceResponse"]["cas:authenticationSuccess"][0][ "cas:user" ][0];

            // Issue JWT to user with their existing roles 
            let profile = await get_profile_by_name(uid)

            if(! profile) {
                profile = await create_new_user(uid)
            }

            const jwt = common.issue_jwt(profile)
            res.json(jwt)

        } else {
        console.error("IUCAS failed to validate");
        res.sendStatus("403"); //Is 403:Forbidden appropriate return code?
        }
    });
    } else {
    //non 200 code...
    next(response.data);
    }
} catch(thrown) {
    if (axios.isCancel(thrown)) {
    console.error("Request canceled", thrown.message);
    } else {
    console.error("Error contacting CAS");
    return next(thrown);
    }
}
});




const create_new_user = async (user_name) => {

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

}


const get_profile_by_name = async (user_name) => { 
    const user = await prisma.users.findUnique({
        where: { user_name: user_name },
        include: {
            user_role: {
                include: {
                    roles: {
                        include: {
                            role_permissions: true
                        }
                    }
                }
            },
            user_settings: true
        }
    }).catch(err => console.error(err))

    if(! user) return user


    let permissions = {}

    const roles = user.user_role.map(i => i.roles.role_permissions)

    for(let role of roles) {
        if(role.length !== 0) {
            for(let permission of role) {
                permissions[permission.permission_field] = permissions[permission.permission_field] || []
                if(! permissions[permission.permission_field].includes(permission.permission_value))
                    permissions[permission.permission_field].push(permission.permission_value)
            }
        }
    }

    const user_settings = ('user_settings' in user && user.user_settings.length > 0 && 'settings' in user.user_settings[0]) ? user.user_settings[0].settings : null

    const profile = {
        user_name: user.user_name,
        user_id: user.user_id,
        roles: user.user_role.map(i => i.roles.role_name),
        permissions: permissions,
        settings: user_settings,
    }

    return profile
}



module.exports = router;