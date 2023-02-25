const swaggerAutogen = require('swagger-autogen')();
const config = require('config');

const doc = {
  info: {
    title: 'DGL API',
    description: 'Auto generated by the <b>swagger-autogen</b> module.',
  },
  host: `${config.get('express.host')}:${config.get('express.port')}`,
  schemes: ['http'],
  consumes: ['application/json'],
  produces: ['application/json'],
};

const outputFile = './swagger_output.json';
const endpointsFiles = ['./routes/index.js'];

swaggerAutogen(outputFile, endpointsFiles, doc);
