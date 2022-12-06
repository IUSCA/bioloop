const jsonwt = require("jsonwebtoken")
let config = require("config")
let crypto = require('crypto')
let fs = require('fs')
let path = require('path')

exports.escapeRegex = function (string) {
  return string.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
};



// Auth issue and check jwt
const issue_jwt = ({user_name, user_id, roles, permissions = {}, settings = {}}) => {

  let exp = (Date.now() + config.get("auth.ttl")) / 1000;

  let claim = {
    iss: config.get("auth.iss"),
    exp: exp,
    profile: {
      user_name: user_name,
      user_id: user_id,
      roles: roles,
      permissions: permissions
    },
  };

  let jwtObj = {};
  jwtObj.jwt = jsonwt.sign(claim, fs.readFileSync(__basedir+config.get("auth.key")), config.get("auth.sign_opt"));
  jwtObj.id = user_id;


  return {user_id: user_id, user_name: user_name, roles: roles, permissions: Object.keys(permissions), settings: settings, accessToken: jwtObj.jwt}
}


const check_jwt = (token) => {
  try {
    let decoded = jsonwt.verify(token, fs.readFileSync(__basedir+  config.get("auth.pub")));
    return decoded
  } catch (err) {
    return undefined
  }
}


exports.get_current_user = (req, res) => {
  authheader = req.headers.authorization;
  if (!authheader) res.sendStatus('403');
  else {
    let token = authheader.split(' ')[1];
    var jwt = check_jwt(token);
    if(jwt && 'profile' in jwt && 'user_id' in jwt.profile) return jwt.profile.user_id
  } 
}

exports.check_role = (role) => {
return function(req, res, next) {
  authheader = req.headers.authorization;
  if (!authheader) res.sendStatus('403');
  else {
    let token = authheader.split(' ')[1];
    const jwt = check_jwt(token)
    if (!jwt || (!jwt.profile.roles.includes(role))) {
      res.sendStatus('403');
      return;
    }
    else {
      req.user = jwt.profile;
      next();
    }
  
  }
}
}

exports.get_permissions = (req) => {
  authheader = req.headers.authorization;
  if (authheader) {
    let token = authheader.split(' ')[1];
    const jwt = check_jwt(token)
    return jwt.profile.permissions

  }
}

exports.md5sum = (string) => crypto.createHash('md5').update(string).digest('hex').toString()


exports.escapeRegex = (string) => {
  return string.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
}


exports.check_file_exists = (file_name) => {
  let filename = config.get("files.landing") + file_name

  try {
    return fs.existsSync(filename)
  } catch(err) {
    console.error(err)
    return false
  }
}

exports.issue_jwt = issue_jwt;
exports.check_jwt = check_jwt;

