// server.js
// where your node app starts

// init project
const express = require('express');
const fs = require('fs');
const path = require('path');

const IGCParser = require('igc-parser');

const app = express();

if (process.argv.length < 3) {
    console.error("Specify directory with metadata.json as a command line argument");
    process.exit(2);
}

const directory = process.argv[2];
const metadata = path.join(directory, "metadata.json");
if (!fs.existsSync(metadata)) {
    console.error("Invalid or non existent directory with metadata.json:", metadata);
    process.exit(2);
}

// http://expressjs.com/en/starter/static-files.html
app.use(express.static(process.argv[2]));

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
    "index.html"
].forEach((filename) => app.get('/' + filename,
    function(request, response) {
        response.sendFile(path.join(__dirname, filename));
    }
));

// listen for requests :)
const listener = app.listen(process.env.PORT, function() {
  console.log('Your app is listening on port ' + listener.address().port);
});
