#!/usr/bin/node
'use strict';

var server = require('./app.js');
server.start(function(err) {
	if(err) throw err;
	console.log("waiting for incoming connections...");
});
