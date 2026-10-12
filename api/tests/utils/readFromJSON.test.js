const fs = require('fs');
const os = require('os');
const path = require('path');

const { readFromJSON } = require('../../src/utils');

describe('readFromJSON instance files', () => {
  let instanceDir;
  let previousInstanceDir;

  beforeEach(() => {
    previousInstanceDir = process.env.API_INSTANCE_DIR;
    instanceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bioloop-api-instance-'));
    process.env.API_INSTANCE_DIR = instanceDir;
  });

  afterEach(() => {
    if (previousInstanceDir === undefined) delete process.env.API_INSTANCE_DIR;
    else process.env.API_INSTANCE_DIR = previousInstanceDir;
    fs.rmSync(instanceDir, { recursive: true, force: true });
  });

  it('reads optional seed data from the mounted instance directory', () => {
    fs.writeFileSync(path.join(instanceDir, 'admins.json'), JSON.stringify([{ username: 'admin' }]));

    expect(readFromJSON('admins.json')).toEqual([{ username: 'admin' }]);
  });

  it('returns an empty array when the optional file is missing', () => {
    expect(readFromJSON('admins.json')).toEqual([]);
  });
});
