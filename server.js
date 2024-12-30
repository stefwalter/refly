// server.js
// where your node app starts

// init project
const express = require('express');
const fs = require('fs');
const path = require('path');

const IGCParser = require('igc-parser');

const app = express();

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
  response.sendFile(path.join(__dirname, 'index.html'));
});

/* All the assets of the actual application */
[
    "style.css",
    "app.js",
    "igc-parser.js",
    "config.js",
    "index.html",
    "favicon.png",
].forEach((filename) => app.get('/' + filename,
    function(request, response) {
        response.sendFile(path.join(__dirname, filename));
    }
));

// listen for requests :)
const listener = app.listen(process.env.PORT, function() {
  console.log('Your app is listening on port ' + listener.address().port);
});
