"use strict";

import { Event, JulianDate } from 'cesium';

/* Triggered for any problem we encounter */
export const problem = new Event();

/* Helper to show an error via the Cesium error panel */
function trigger(title, args) {
    const message = [ ];
    let error = null;
    for (let i = 0; i < args.length; i++) {
        if (args[i] && args[i].stack)
            error = args[i];
        else
            message.push(String(args[i]));
    }
    problem.raiseEvent(title, message.join(" "), error);
}

export function assert(/* ... */) {
    console.assert.apply(console, arguments);
    if (!arguments[0])
        trigger("Code problem", [ "See javascript console for details" ]);
}

export function failure(/* ... */) {
    console.error.apply(console, arguments);
    trigger("Failure", arguments);
}

export function warning(/* ... */) {
    console.warn.apply(console, arguments);
    trigger("Warning", arguments);
}

export function message(/* ... */) {
    console.info.apply(console, arguments);
}

export function parseTimestamp(timestamp) {
    if (typeof timestamp == 'number')
        timestamp = new Date(Math.max(0, timestamp));
    try {
        if (typeof timestamp == 'object')
            return JulianDate.fromDate(timestamp);
        if (typeof timestamp == 'string')
            return JulianDate.fromIso8601(timestamp);
    } catch { ; }
    warning("Couldn't parse timestamp:", timestamp);
    return undefined;
}

/* Returns the timezone offset in Seconds */
export function parseTimezone(timestamp) {
    if (typeof timestamp == 'number')
        return timestamp; // Seconds offset
    if (!timestamp)
        return undefined;
    try {
        if (typeof timestamp == 'string') {
            const date = JulianDate.fromIso8601("1970-01-01T00:00:00" + timestamp);
            return -JulianDate.toDate(date).valueOf() / 1000;
        }
    } catch { ; }
    warning("Couldn't parse timezone:", timestamp);
    return undefined;
}

/* Returns the duration in seconds */
export function parseDuration(timestamp) {
    if (typeof timestamp == 'number')
        return timestamp; // Numbers are seconds
    if (!timestamp)
        return undefined;
    if (typeof timestamp == "string") {
        try {
            const date = JulianDate.fromIso8601("1970-01-01T" + timestamp + "Z");
            return JulianDate.toDate(date).valueOf() / 1000;
        } catch { /* fall through */; }
    }
    warning("Couldn't parse duration:", timestamp);
    return undefined;
}

/*
 * Match the file name to various extension lists
 * provided as option alguments and return the
 * extension list that matches.
 */
export function guessMimeType(filename, type) {
    assert(typeof filename == "string");
    if (typeof type == "string" && type)
        return type;
    const lcase = filename.toLowerCase();
    if (lcase.endsWith(".igc"))
	return "application/x-igc";
    else if (lcase.endsWith(".jpeg") || lcase.endsWith(".jpg"))
	return "image/jpeg";
    else if (lcase.endsWith(".png"))
	return "image/png";
    else if (lcase.endsWith(".mp4"))
	return "video/mp4";
    else if (lcase.endsWith(".mov"))
	return "video/quicktime";
    return "application/binary";
}

const blobs = { };
const folder = location.hash ? location.hash.substr(1) : null;

export function qualifyFile(file) {
    assert(file instanceof File);
    blobs[file.name] = URL.createObjectURL(file);
}

export function qualifiedUrl(path) {
    if (path in blobs)
        return blobs[path];
    path = path.replace(/^[/.]+|[/]+$/g, '');
    if (folder)
        path = "/media/" + folder + "/" + path;
    return path;
}
