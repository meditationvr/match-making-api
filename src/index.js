const app = require('express')();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const port = process.env.PORT || 3000;

const loadServices = require('./services')
const restEndpoints = require('./restEndpoints')
const webSockets = require('./webSockets') 

loadServices().then(ret => {
  console.log("Services status: ", ret) 

  restEndpoints(app);
  webSockets(io);
  
  http.listen(port, function(){
    console.log(`listening on port: ${port}`);
  });
})
