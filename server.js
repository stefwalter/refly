// server.js
// where your node app starts

// init project
const express = require('express');
const fs = require('fs');

const IGCParser = require('igc-parser');

const app = express();

// http://expressjs.com/en/starter/static-files.html
app.use(express.static('.'));

// http://expressjs.com/en/starter/basic-routing.html
app.get('/', function(request, response) {
  response.sendFile(__dirname + '/index.html');
});

app.get('/route/:file', function(request, response) {
    let result = IGCParser.parse(fs.readFileSync(request.params.file, 'utf8'));
    response.set('Content-Type', "application/json");
    response.send(JSON.stringify(result));
});

// listen for requests :)
const listener = app.listen(process.env.PORT, function() {
  console.log('Your app is listening on port ' + listener.address().port);
});
