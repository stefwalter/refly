// extract.cjs
// A tool to parse the media files and print out metadata

import * as fs from 'fs';

import IGCParser from "igc-parser";

import {
    extractMP4,
    extractEXIF,
    extractIGC,
} from './src/extract.js';

import {
    guessMimeType
} from './src/util.js';

if (process.argv.length <= 2) {
    console.log("usage: node extract.js <file>");
    process.exit(2);
}

async function loadTracks(name) {
    const type = guessMimeType(name, "");

    if (type.indexOf("application/x-igc") == 0) {
        const data = fs.readFileSync(name, 'utf8');
        const igcData = IGCParser.parse(data);
        const result = await extractIGC(igcData);
        console.log(JSON.stringify(name), "=", result);
    }
}

async function loadMedia(name) {
    const type = guessMimeType(name, "");

    let result = null;
    if (type.indexOf("video/") == 0) {
        const file = await fs.promises.open(name, 'r');
        const readable = file.readableWebStream();
        const reader = readable.getReader();
        result = await extractMP4(reader, name);
        await reader.releaseLock();
        await readable.cancel();
    } else if (type.indexOf("image/") == 0) {
        var arraybuffer = fs.readFileSync(name);
        result = await extractEXIF(arraybuffer, name);
    } else if (type.indexOf("application/x-igc") == 0) {
        return;
    } else {
        console.warn("Unsupported file type:", name, type);
    }

    console.log(JSON.stringify(name), "=", result);
}

for (let i = 2; i < process.argv.length; i++)
    await loadTracks(process.argv[i]);
for (let i = 2; i < process.argv.length; i++)
    await loadMedia(process.argv[i]);
