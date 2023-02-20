const userService = require('./services/user');

async function main() {
  const user = await userService.findUserByCASId('deduggi');
  console.dir(user, { depth: null });
}

main().then(console.log).catch(console.log);
