import { expect, test } from 'vitest';

import {
    extractDuration,
    extractMetadata,
    extractMP4,
    extractEXIF,
    extractFile,
    extractIGC,
    learnPilot,
    learnTimezone,
} from './extract';

import {
    JulianDate
} from 'cesium';

test('iphone.MOV', async function() {
    const response = await fetch("/fixtures/iphone.MOV");
    expect(response.ok).toBeTruthy();

    const reader = response.body.getReader();
    const data = await extractMP4(reader);
    expect(data).toStrictEqual({
        "altitude": 2083.109,
        "duration": 2.433333333333333,
        "latitute": 32.0532,
        "longitude": 76.705,
        "person": null,
        "timestamp": "2024-10-08T14:52:09+0530",
    });
});

test('iphone.MP4', async function() {
    const response = await fetch("/fixtures/iphone.MP4");
    expect(response.ok).toBeTruthy();

    const reader = response.body.getReader();
    const data = await extractMP4(reader);
    expect(data).toStrictEqual({
        "altitude": 2408.05810546875,
        "duration": 13.868333333333334,
        "latitude": 32.05848693847656,
        "longitude": 76.74400329589844,
        "person": null,
        "timestamp": "2024-10-03T11:16:14+0530",
    });
});

test('iphone-invalid.MP4', async function() {
    const response = await fetch("/fixtures/iphone-invalid.MP4");
    expect(response.ok).toBeTruthy();

    const reader = response.body.getReader();
    const data = await extractMP4(reader);
    expect(data).toStrictEqual({
        "altitude": 2408.05810546875,
        "duration": 13.868333333333334,
        "latitude": 32.05848693847656,
        "longitude": 76.74400329589844,
        "person": null,

        /* Invalid date Box causes different date here */
        "timestamp": "2024-10-03T08:24:35Z"
    });
});

test('iphone.JPEG', async function() {
    const response = await fetch("/fixtures/iphone.JPEG");
    expect(response.ok).toBeTruthy();

    const arraybuffer = await response.arrayBuffer();
    const data = await extractEXIF(arraybuffer);
    expect(data).toStrictEqual({
        "altitude": 2404.6015727391873,
        "latitude": 32.03055555555555,
        "longitude": 76.74504166666667,
        "timestamp": "2024-10-06T10:51:58+05:30",
        "person": null,
    });
});

test('pixel.mp4', async function() {
    const response = await fetch("/fixtures/pixel.mp4");
    expect(response.ok).toBeTruthy();

    const reader = response.body.getReader();
    const data = await extractMP4(reader);
    expect(data).toStrictEqual({
        "duration": 1.7074,
        "altitude": null,
        "latitute": 48.9498,
        "longitude": 8.3958,
        "person": null,
        "timestamp": "2025-01-27T04:32:02Z",
    });
});

test('pixel.jpg', async function() {
    const response = await fetch("/fixtures/pixel.jpg");
    expect(response.ok).toBeTruthy();

    const arraybuffer = await response.arrayBuffer();
    const data = await extractEXIF(arraybuffer);
    expect(data).toStrictEqual({
        "altitude": 176.7,
        "latitude": 48.949755555555555,
        "longitude": 8.395772222222222,
        "timestamp": "2025-01-27T05:31:38+01:00",
        "person": null,
    });
});

test('Sony_HDR-HC3.jpg', async function() {
    const response = await fetch("/fixtures/Sony_HDR-HC3.jpg");
    expect(response.ok).toBeTruthy();

    /* Force it to +01:00 as timezone */
    learnTimezone(3600, true);

    const arraybuffer = await response.arrayBuffer();
    const data = await extractEXIF(arraybuffer);
    expect(data).toStrictEqual({
        "timestamp": "2007-06-15T03:42:32Z",
        "altitude": null,
        "latitude": null,
        "longitude": null,
        "person": null,
    });
});

test('Sony_HDR-HC3.jpg local timezone', async function() {
    const response = await fetch("/fixtures/Sony_HDR-HC3.jpg");
    expect(response.ok).toBeTruthy();

    /* Force extract to use the local timezone */
    learnTimezone(undefined, true);

    const local = (new Date("1970-01-01T00:00:00").valueOf()) / 1000;
    const julian = JulianDate.fromIso8601("2007-06-15T04:42:32Z");
    JulianDate.addSeconds(julian, local, julian);

    const arraybuffer = await response.arrayBuffer();
    const data = await extractEXIF(arraybuffer);
    expect(data).toStrictEqual({
        "timestamp": JulianDate.toIso8601(julian, 0),
        "person": null,
        "altitude": null,
        "latitude": null,
        "longitude": null,
    });
});

test('Sony_HDR-HC3-invalid.jpg', async function() {
    const response = await fetch("/fixtures/Sony_HDR-HC3-invalid.jpg");
    expect(response.ok).toBeTruthy();

    /* Force it to +01:00 as timezone */
    learnTimezone(3600, true);

    const arraybuffer = await response.arrayBuffer();
    const data = await extractEXIF(arraybuffer);
    expect(data).toStrictEqual({
        "altitude": null,
        "latitude": null,
        "longitude": null,
        "person": null,
        "timestamp": null,
    });
});


test('invalid.txt', async function() {
    let eargs = null;
    const old = console.error;
    console.error = function(/* ... */) {
        eargs = Array.from(arguments);
    };

    const response = await fetch("/fixtures/invalid.txt");
    expect(response.ok).toBeTruthy();

    const reader = response.body.getReader();
    const data = await extractMP4(reader);
    expect(data).toStrictEqual({ });
    // expect(eargs).toStrictEqual(["my", "test", 5]);

    console.error = old;
});

test('Duration', async function() {
    const video = document.createElement("video");
    video.setAttribute("preload", "metadata");
    const source = document.createElement("source");
    /* We use OGV because chromium (running our tests) doesn't support MP4 */
    source.setAttribute('src', "/fixtures/Test.ogv");
    video.appendChild(source);
    document.body.appendChild(video);

    const data = await extractDuration(video);
    expect(data).toStrictEqual({ "duration": 12.701315 });
});

test('Duration Error', async function() {
    const video = document.createElement("video");
    video.setAttribute("preload", "metadata");
    const source = document.createElement("source");
    source.setAttribute('src', "/fixtures/does-not-exist.ogv");
    video.appendChild(source);
    document.body.appendChild(video);

    const data = await extractDuration(video, null, 500);
    expect(data).toStrictEqual({ });
});

test('Duration Timeout', async function() {
    const video = document.createElement("video");
    video.setAttribute("preload", "metadata");
    const source = document.createElement("source");
    source.setAttribute('src', "/fixtures/invalid.txt");
    video.appendChild(source);
    document.body.appendChild(video);

    const data = await extractDuration(video, null, 500);
    expect(data).toStrictEqual({ });
});

test('Duration Already', function() {
    const video = document.createElement("video");
    video.setAttribute("preload", "metadata");
    const source = document.createElement("source");
    /* We use OGV because chromium (running our tests) doesn't support MP4 */
    source.setAttribute('src', "/fixtures/Test.ogv");
    video.appendChild(source);
    document.body.appendChild(video);

    return new Promise(function(resolve) {
        video.addEventListener("loadedmetadata", function() {
            extractDuration(video).then(function(data) {
                expect(data).toStrictEqual({ "duration": 12.701315 });
                resolve();
            });
        });
    });
});

test('Duration IMG', async function() {
    const img = document.createElement("img");
    img.setAttribute('src', "/fixtures/iphone.JPEG");
    document.body.appendChild(img);
    const data = await extractDuration(img);
    expect(data).toStrictEqual({ });
});

test('Metadata VIDEO', async function() {
    const video = document.createElement("video");
    const source = document.createElement("source");
    source.setAttribute('src', "/fixtures/iphone.MP4");
    video.appendChild(source);
    document.body.appendChild(video);

    learnPilot("Alice");

    const data = await extractMetadata(video);
    expect(data).toStrictEqual({
        "altitude": 2408.05810546875,
        "duration": 13.868333333333334,
        "latitude": 32.05848693847656,
        "longitude": 76.74400329589844,
        "timestamp": "2024-10-03T11:16:14+0530",
        "filename": "iphone.MP4",
        "person": "Alice",
    });
});

test('Metadata VIDEO empty', async function() {
    const video = document.createElement("video");
    const data = await extractMetadata(video);
    expect(data).toStrictEqual({ });
});

test('Metadata IMG', async function() {
    const img = document.createElement("img");
    img.setAttribute('src', "/fixtures/iphone.JPEG");
    document.body.appendChild(img);

    learnPilot("Alice");

    const data = await extractMetadata(img);
    expect(data).toStrictEqual({
        "filename": "iphone.JPEG",
        "altitude": 2404.6015727391873,
        "latitude": 32.03055555555555,
        "longitude": 76.74504166666667,
        "timestamp": "2024-10-06T10:51:58+05:30",
        "person": "Alice",
    });
});

test('File', async function() {
    const mock = { name: "blah.txt", lastModified: 1737918577000 };

    const data = await extractFile(mock);
    expect(data).toStrictEqual({
        "timestamp": "2025-01-26T19:09:37Z",
    });
});

test('File now', async function() {
    const mock = { name: "blah.txt", lastModified: Date.now() };

    const data = await extractFile(mock);
    expect(data).toStrictEqual({
        "timestamp": null,
    });
});

test('IGC', async function() {
    const mock = { "timezone": 5.5, "pilot": "Max" };

    learnTimezone(undefined, true);
    const data = await extractIGC(mock);
    expect(data).toStrictEqual({ "person": "Max" });
    expect(learnTimezone(undefined)).toBe(19800);
    expect(learnPilot(undefined)).toBe("Max");
});

