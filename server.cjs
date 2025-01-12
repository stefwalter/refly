// server.js
// where your node app starts

// init project
const express = require('express');
const fs = require('fs');
const path = require('path');

const IGCParser = require('igc-parser');

const app = express();

app.use(express.static(path.join(__dirname, "dist")));

const directory = process.argv.at(2);
if (process.argv.length == 3) {
    if (!fs.existsSync(directory)) {
        console.error("Invalid or non existent directory:", directory);
        process.exit(2);
    }

    // http://expressjs.com/en/starter/static-files.html
    app.use(express.static(directory));
}

// http://expressjs.com/en/starter/basic-routing.html
app.get('/', function(request, response) {
  response.sendFile(path.join(__dirname, "dist", 'index.html'));
});

// Media files to serve
app.use("/media", express.static(path.join(__dirname, "media")));

// listen for requests :)
const listener = app.listen(process.env.PORT, function() {
  console.log('Your app is listening on port ' + listener.address().port);
});
