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
    "config.js",
    "index.html"
].forEach((filename) => app.get('/' + filename,
    function(request, response) {
        response.sendFile(path.join(__dirname, filename));
    }
));

/* The IGC Parser */
app.get('/flight/:file', function(request, response) {
    const data = fs.readFileSync(path.join(directory, request.params.file), 'utf8');
    let result = null;

    try {
        result = IGCParser.parse(data);
    } catch(error) {
        response.status(405);
        response.set('Content-Type', "text/plain");
        response.send("Invalid IGC file");
        console.warn("Failure to parsing IGC", request.params.file, ":", error);
        return;
    }

    response.set('Content-Type', "application/json");
    response.send(JSON.stringify(result));
});

// listen for requests :)
const listener = app.listen(process.env.PORT, function() {
  console.log('Your app is listening on port ' + listener.address().port);
});
