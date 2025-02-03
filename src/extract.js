
import {
    GregorianDate,
    JulianDate,
} from 'cesium';

import {
    createFile,
    DataStream,
    ItifTypes,
} from 'mp4box';

import ExifReader from 'exifreader';

import {
    parseTimestamp,
    parseTimezone,
} from "./util.js";

/* These are used to populate "missing" data */
let timezone = undefined;
let pilot = undefined;

export function learnTimezone(value, force) {
    console.assert(typeof value === "number" || typeof value === "undefined");
    if (force || timezone === undefined)
        timezone = value;
    return timezone;
}

const ISO8601_TZ_RE = /([+-][0-9:]+)$/;

function learnTimezoneISO8601(timestamp) {
    console.assert(typeof timestamp == "string");
    const match = timestamp.match(ISO8601_TZ_RE);
    if (match) {
        const seconds = parseTimezone(match[1]);
        if (seconds !== undefined)
            learnTimezone(seconds);
    }
}

function getTimezoneSeconds() {
    return typeof timezone == "number" ? timezone :
        -(new Date("1970-01-01T00:00:00").valueOf()) / 1000;
}

export function learnPilot(value, force) {
    console.assert(typeof value === "string" || typeof value === "undefined");
    if (force || pilot === undefined)
        pilot = value;
    return pilot;
}

async function getMP4Info(reader) {
    console.assert(reader.read);

    let result = null;

    const file = createFile();
    file.onReady = function() {
        result = {
            mvhd: file.getBoxes("mvhd"),
            udta: file.getBoxes("udta"),
            ilst: file.getBoxes("ilst"),
            meta: file.getBoxes("meta")
        };
    };

    let fileStart = 0;
    while (!result) {
        const res = await reader.read();
        if (res.value) {
            const buffer = res.value.buffer || res.value;
            buffer.fileStart = fileStart;
            file.appendBuffer(buffer);
            fileStart += buffer.byteLength;
        }
        if (res.done) {
            file.flush();
            break;
        }
    }

    return result;
}

/*
 * This is the 'loci' udta MP4 Box
 *
 * See Table 8.10
 * https://www.etsi.org/deliver/etsi_ts/126200_126299/126244/09.02.00_60/ts_126244v090200p.pdf
 * Numbers appear to be big endian.
 *
 * (4-byte flags, 2-byte lang, location string, 1-byte role, 4-byte fixed longitude,
 *  4-byte fixed latitude, 4-byte fixed altitude, body string, notes string)
 */
function parseMP4Loci(data) {
    const stream = new DataStream(data, 0, DataStream.BIG_ENDIAN);
    /* const flags = */ stream.readUint32();
    /* const lang = */ stream.readUint16();
    /* const name = */ stream.readCString();
    /* const role = */ stream.readUint8();
    const longitude = stream.readInt32() / 0x10000;
    const latitude = stream.readInt32() / 0x10000;
    const altitude = stream.readInt32() / 0x10000;
    /* const body = */ stream.readCString();
    /* const notes = */ stream.readCString();

    return {
        "latitude": latitude,
        "longitude": longitude,
        "altitude": altitude,
    };
}

/* This is an ISO8601 number */
function parseMP4DateBox(data) {
    const stream = new DataStream(data, 0, DataStream.BIG_ENDIAN);
    const timestamp = stream.readString();
    /* Note, we assume this should already have TZ or Z information in it */
    learnTimezoneISO8601(timestamp);
    return timestamp;
}

function parseMP4XYZBox(data) {
    const stream = new DataStream(data, 0, DataStream.BIG_ENDIAN);
    stream.readUint16();
    stream.readUint16();
    const iso6709 = stream.readString();
    return parseISO6709(iso6709);
}

const ISO6709_RE = /^([-+][\d.]+)([-+][\d.]+)([-+][\d.]+)?/;

function parseISO6709(data) {
    if (!data)
        return null;
    const match = data.match(ISO6709_RE);
    if (!match)
        return null;
    return {
        "latitute": parseFloat(match[1]) || undefined,
        "longitude": parseFloat(match[2]) || undefined,
        "altitude": parseFloat(match[3]) || undefined,
    };
}

function filterLocation(loc) {
    /* In the future we can do validation of the location itself */
    return !!loc;
}

function filterTimestamp(ts) {
    try {
        /* These are invalid non-existent or zero dates */
        if (ts[0] == '0' || ts.substr(0, 3) == "190")
            return false;
        JulianDate.fromIso8601(ts);
        return true;
    } catch {
        return false;
    }
}

const MP4_1904 = (new Date('1904-01-01T00:00:00Z').getTime());

function parseMvhdTimestamp(mvhd, field, offset) {
    const value = mvhd[field];
    if (!value)
        return undefined;
    const julian = JulianDate.fromDate(new Date(MP4_1904 + value * 1000));
    JulianDate.addSeconds(julian, offset || 0, julian);
    return JulianDate.toIso8601(julian, 0);
}

/* Insta360 Studio names files like VID_20241021_114923_00_174.mp4 */
const INSTA360_STUDIO_VID_RE = /^VID_\d\d\d\d\d\d\d\d_\d\d\d\d\d\d_\d.*.mp4$/;

function isInsta360(filename) {
    const base = (filename || "").split("/").pop();
    return !!base.match(INSTA360_STUDIO_VID_RE);
}

export async function extractMP4(reader, filename) {
    const mp4 = await getMP4Info(reader);
    if (!mp4)
        return null;

    let duration = undefined;
    let offset = 0;
    const timestamps = [];

    /*
     * Insta360 Studio encodes the local time as the media timecode.
     * So we offset it with the timezone.
     */
    if (isInsta360(filename))
        offset = -getTimezoneSeconds();

    if (mp4.mvhd) {

        /* The duration in the MP4 file is in timescale multiple */
        duration = mp4.mvhd[0].duration / mp4.mvhd[0].timescale;

        /* The timestamps in MP4 header are in seconds since 1904-01-01 */
        timestamps.push(parseMvhdTimestamp(mp4.mvhd[0], 'creation_time', offset));
        timestamps.push(parseMvhdTimestamp(mp4.mvhd[0], 'modification_time', offset));
    }

    const locations = [];

    for (let i = 0; i < mp4.udta.length; i++) {
        for (let j = 0; j < mp4.udta[i].boxes.length; j++) {
            const box = mp4.udta[i].boxes[j];
            if (box.type == "loci")
                locations.unshift(parseMP4Loci(box.data));
            else if (box.type == "date")
                timestamps.unshift(parseMP4DateBox(box.data));
            else if (box.type == "\xA9xyz")
                locations.unshift(parseMP4XYZBox(box.data));
        }
    }

    for (let i = 0; i < mp4.meta.length; i++) {
        const keys = mp4.meta[i].keys;
        const ilst = mp4.meta[i].ilst;
        if (!keys || !ilst)
            continue;
        for (const k in keys.keys) {
            const name = keys.keys[k];
            if (name == "mdtacom.apple.quicktime.location.ISO6709" &&
                ilst.boxes[k].type == ItifTypes.UTF8) {
                locations.unshift(parseISO6709(ilst.boxes[k].value));
            } else if (name == "mdtacom.apple.quicktime.creationdate" &&
                       ilst.boxes[k].type == ItifTypes.UTF8) {
                learnTimezoneISO8601(ilst.boxes[k].value);
                timestamps.unshift(ilst.boxes[k].value);
            }
        }
    }

    const result = {
        "timestamp": timestamps.filter(filterTimestamp)[0],
    };
    if (pilot)
        result['pilot'] = pilot;
    if (duration)
        result['duration'] = duration;
    return Object.assign(result, locations.filter(filterLocation)[0]);
}

function rationalToFloat(rational) {
    const result = rational ? rational[0] / rational[1] : undefined;
    return isNaN(result) ? undefined : result;
}

function degreesToFloat(degrees, minutes, seconds) {
    return rationalToFloat(degrees) + rationalToFloat(minutes) / 60 + rationalToFloat(seconds) / 3600;
}

function exifToISO8601(date, offset) {
    const b = date.split(/\D/);
    try {
        const gregorian = new GregorianDate(
            parseInt(b[0]), /* year */
            parseInt(b[1]), /* month */
            parseInt(b[2]), /* day */
            parseInt(b[3]), /* hour */
            parseInt(b[4]), /* minute */
            parseInt(b[5]), /* second */
            0, false);

        const julian = JulianDate.fromGregorianDate(gregorian);
        /* If no timezone information in exif, then use what we learned */
        if (offset === undefined)
            JulianDate.addSeconds(julian, -getTimezoneSeconds(), julian);
        const iso = JulianDate.toIso8601(julian, 0);
        /* Replace the timezone information if we have some */
        return offset ? iso.replace('Z', offset) : iso;
    } catch {
        return undefined;
    }
}

export async function extractEXIF(loadable) {
    function getTag(tags, key) {
        return tags[key] ? tags[key].value : undefined;
    }
    const tags = await ExifReader.load(loadable);
    const result = {};

    const datetime = getTag(tags, 'DateTimeOriginal');
    const offset = getTag(tags, 'OffsetTimeOriginal') || [];
    if (datetime) {
        const timestamp = exifToISO8601(datetime[0], offset[0]);
        if (filterTimestamp(timestamp))
            result["timestamp"] = timestamp;
    }

    const altitude = getTag(tags, 'GPSAltitude');
    const altitudeRef = getTag(tags, 'GPSAltitudeRef') || 0;
    if (altitude)
        result['altitude'] = (altitude[0] / altitude[1]) * (altitudeRef[0] == 1 ? -1 : 1);

    const longitude = getTag(tags, 'GPSLongitude');
    if (longitude)
        result['longitude'] = degreesToFloat(longitude[0], longitude[1], longitude[2]);
    const latitude = getTag(tags, 'GPSLatitude');
    if (latitude)
        result['latitude'] = degreesToFloat(latitude[0], latitude[1], latitude[2]);

    if (pilot)
        result['pilot'] = pilot;

    return result;
}

export function extractDuration(element, timeout) {
    /* No duration on the element */
    if (element.tagName != "VIDEO")
        return Promise.resolve({});
    if (element.duration)
        return Promise.resolve({ "duration": element.duration });

    return new Promise((resolve) => {
        const timer = window.setTimeout(function() {
            element.removeEventListener("loadedmetadata", listener);
            window.clearTimeout(timer);

            /* No duration found, not an error but return null */
            console.warn("Timeout finding duration of video");
            resolve({});
        }, timeout || 10000);
        const listener = element.addEventListener("loadedmetadata", function() {
            element.removeEventListener("loadedmetadata", listener);
            window.clearTimeout(timer);
            resolve({ "duration": element.duration });
        });
    });
}

export async function extractMetadata(element, filename) {
    let result = null;
    if (element.tagName == "VIDEO") {
        const sources = element.getElementsByTagName("source");
        const url = sources.length > 0 ? sources[0].getAttribute("src") : null;
        if (!url)
            return { };
        const response = await fetch(url);
        result = await extractMP4(response.body.getReader(), filename || url);
    } else {
        const url = element.getAttribute('src');
        const response = await fetch(url);
        const arraybuffer = await response.arrayBuffer();
        result = await extractEXIF(arraybuffer);
    }
    return result;
}

/*
 * We could also parse file names like this
 *
const FILENAME_RES = [
    // 20170913_163816.jpg
    /^(\d{4})(\d{2})(\d{2)_(\d{2})(\d{2})(\d{2})\./,
    // VID_20241021_114923_00_174.mp4
    /^VID_(\d{4})(\d{2})(\d{2)_(\d{2})(\d{2})(\d{2})_/,
];
 */

export async function extractFile(file) {
    let timestamp = undefined;

    /* This is the file modified date. No TZ here, but Date.now() means no modified date */
    if (!timestamp && file && file.lastModified && file.lastModified < Date.now() - 10000) {
        timestamp = JulianDate.toIso8601(parseTimestamp(file.lastModified));
    }

    return { timestamp: timestamp };
}

export async function extractIGC(igcData) {
    console.assert(igcData);

    /* IGC files have timezone in floating point hours, we need it in seconds */
    if (typeof igcData.timezone == "number")
        learnTimezone(igcData.timezone * 3600, true);

    if (typeof igcData.pilot == "string")
        learnPilot(igcData.pilot, true);

    return {
        "pilot": igcData.pilot,
    };
}
