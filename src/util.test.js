import { expect, test } from 'vitest';
import { JulianDate } from "cesium";

import * as util from './util';

function julianToString(x) {
    if (x instanceof JulianDate)
        return x.toString();
    return `${x}`
}

expect.extend({
    toEqualJulian(received, expected) {
        const { isNot } = this;
        return {
            pass: received == expected || (received && expected && JulianDate.equals(received, expected)),
            message: () => julianToString(received) + ` is${isNot ? ' not' : ''} ` + julianToString(expected)
        }
    }
});

test('warning', function() {
    let wargs = null;
    const old = console.warn;
    console.warn = function(/* ... */) {
        wargs = Array.from(arguments);
    };

    let pargs = null;
    util.problem.addEventListener(function(/* ... */) {
        pargs = Array.from(arguments);
    });

    util.warning("my", "test", 5);
    expect(wargs).toStrictEqual(["my", "test", 5]);
    expect(pargs).toStrictEqual(["Warning", "my test 5", null]);

    const ex = new Error("blah");
    util.warning("my", "test", 4, ex);
    expect(pargs).toStrictEqual(["Warning", "my test 4", ex]);

    console.warn = old;
});

test('failure', function() {
    let eargs = null;
    const old = console.error;
    console.error = function(/* ... */) {
        eargs = Array.from(arguments);
    };

    let pargs = null;
    util.problem.addEventListener(function(/* ... */) {
        pargs = Array.from(arguments);
    });

    util.failure("my", "test", 5);
    expect(eargs).toStrictEqual(["my", "test", 5]);
    expect(pargs).toStrictEqual(["Failure", "my test 5", null]);

    const ex = new Error("blah");
    util.failure("my", "test", 5, ex);
    expect(pargs).toStrictEqual(["Failure", "my test 5", ex]);

    console.error = old;
});

test('message', function() {
    let iargs = null;
    const old = console.info;
    console.info = function(/* ... */) {
        iargs = Array.from(arguments);
    };

    let pargs = null;
    util.problem.addEventListener(function(/* ... */) {
        pargs = Array.from(arguments);
    });

    util.message("my", "test", 5);
    expect(iargs).toStrictEqual(["my", "test", 5]);
    expect(pargs).toStrictEqual(null);

    const ex = new Error("blah");
    util.message("my", "test", 3, ex);
    expect(pargs).toStrictEqual(null);

    console.error = old;
});

test('assert', function() {
    let eargs = null;
    const old = console.assert;
    console.assert = function(/* ... */) {
        eargs = Array.from(arguments);
    };

    let pargs = null;
    util.problem.addEventListener(function(/* ... */) {
        pargs = Array.from(arguments);
    });

    util.assert(false);
    expect(eargs).toStrictEqual([false]);
    expect(pargs).toStrictEqual(["Code problem", "See javascript console for details", null]);

    console.assert = old;
});

test('parseTimestamp', function() {
    const old = console.warn;
    console.warn = function() { }

    let warning = null;
    util.problem.addEventListener(function(title, message, ex) {
        warning = message;
    });

    expect(util.parseTimestamp(1735649255000))
        .toEqualJulian(JulianDate.fromIso8601('2024-12-31T12:47:35Z'));
    expect(util.parseTimestamp(new Date('2024-12-31T12:47:35Z')))
        .toEqualJulian(JulianDate.fromIso8601('2024-12-31T12:47:35Z'));
    expect(util.parseTimestamp('2024-12-31T12:47:35Z'))
        .toEqualJulian(JulianDate.fromIso8601('2024-12-31T12:47:35Z'));

    /* No warnings so far */
    expect(warning).toBe(null);
    expect(util.parseTimestamp('2024-12-31T12:47:bad')).toBe(undefined);
    expect(warning).toMatch('parse');
    expect(warning).toMatch(':bad');

    console.warn = old;
});

test('parseTimezone', function() {
    const old = console.warn;
    console.warn = function() { }

    let warning = null;
    util.problem.addEventListener(function(title, message, ex) {
        warning = message;
    });

    expect(util.parseTimezone(19800)).toBe(19800); // Seconds
    expect(util.parseTimezone(0)).toBe(0); // Seconds
    expect(util.parseTimezone("+05:30")).toBe(19800); // Seconds
    expect(util.parseTimezone("-05:30")).toBe(-19800); // Seconds
    expect(util.parseTimezone(null)).toBe(undefined); // Calculate elsewhere
    expect(util.parseTimezone(undefined)).toBe(undefined); // Calculate elsewhere

    /* No warnings so far */
    expect(warning).toBe(null);
    expect(util.parseTimezone("+9:00")).toBe(undefined);
    expect(warning).toMatch('parse');
    expect(warning).toMatch('+9:00');

    console.warn = old;
});

test('parseDuration', function() {
    const old = console.warn;
    console.warn = function() { }

    let warning = null;
    util.problem.addEventListener(function(title, message, ex) {
        warning = message;
    });

    expect(util.parseDuration(5)).toBe(5); // Seconds
    expect(util.parseDuration(0)).toBe(0); // Seconds
    expect(util.parseDuration(null)).toBe(undefined); // Calculate elsewhere
    expect(util.parseDuration(undefined)).toBe(undefined); // Calculate elsewhere
    expect(util.parseDuration("05:30:20")).toBe(5 * 3600 + 30 * 60 + 20);

    /* No warnings so far */
    expect(warning).toBe(null);
    expect(util.parseDuration("badtimestamp")).toBe(undefined);
    expect(warning).toMatch('parse');
    expect(warning).toMatch('badtimestamp');

    console.warn = old;
});

test('guessMimeType', function() {
    expect(util.guessMimeType('test.igc', "text/plain")).toBe("text/plain");
    expect(util.guessMimeType('test.igc', "")).toBe("application/x-igc");
    expect(util.guessMimeType('test.igc', null)).toBe("application/x-igc");
    expect(util.guessMimeType('test.igc')).toBe('application/x-igc');
    expect(util.guessMimeType('test.IGC')).toBe('application/x-igc');
    expect(util.guessMimeType('test.mp4')).toBe('video/mp4');
    expect(util.guessMimeType('test.MP4')).toBe('video/mp4');
    expect(util.guessMimeType('test.mov')).toBe('video/quicktime');
    expect(util.guessMimeType('test.MOV')).toBe('video/quicktime');
    expect(util.guessMimeType('test.JPG')).toBe('image/jpeg');
    expect(util.guessMimeType('test.jpg')).toBe('image/jpeg');
    expect(util.guessMimeType('test.JPEG')).toBe('image/jpeg');
    expect(util.guessMimeType('test.jpeg')).toBe('image/jpeg');
    expect(util.guessMimeType('test.png')).toBe('image/png');
    expect(util.guessMimeType('test.PNG')).toBe('image/png');
    expect(util.guessMimeType('with-folder/test.PNG')).toBe('image/png');
    expect(util.guessMimeType('with-multiple-extensions.txt.PNG')).toBe('image/png');
    expect(util.guessMimeType('with spaces.png')).toBe('image/png');
    expect(util.guessMimeType('test.txt')).toBe("application/binary");
    expect(util.guessMimeType('test')).toBe("application/binary");
});
