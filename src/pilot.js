import {
    allIntervals,
} from './timeline.js';

import {
    Track,
} from './track.js';

import {
    assert,
} from './util.js';

import {
    Video,
} from './video.js';

import {
    Color,
    TimeIntervalCollection
} from 'cesium';

/*
 * All colors available
 * https://htmlcolorcodes.com/color-chart/
 */
const colors = [
    "#3498db", "#F1C40F", "#E67E22", "#2ecc71", "#27AE60", "#16A085", "#1ABC9C",
    "#3498DB", "#8E44AD", "#9B59B6", "#E74C3C", "#C0392B", "#F39C12", "#D35400",
];

export const pilots = { };

export class Pilot {
    constructor(name) {
        assert(typeof name == "string");

        this.name = name;
        this.index = Object.keys(pilots).length;
        this.tracks = new TimeIntervalCollection();
        this.videos = new TimeIntervalCollection();

        /* Each pilot gets a color, and keep them unique based on pilot string*/
        this.color = new Color(0, 0, 0);
        Color.fromCssColorString(colors.shift(), this.color);

        assert(!pilots[this.name]);

        const first = Object.values(pilots).at(0);
        pilots[this.name] = this;

        /* A linked list between all pilots */
        this.next = first || this;
        this.prev = this.next.prev || this;
        this.prev.next = this;
        this.next.prev = this;
    }

    add(obj) {
        assert(obj);
        assert(obj instanceof Track || obj instanceof Video);
        assert(obj.interval.data == obj);

        /* Two interval collections depending on the type */
        const intervals = obj instanceof Track ? this.tracks : this.videos;

        /* Make sure this can be called multiple times */
        intervals.removeInterval(obj.interval);
        intervals.addInterval(obj.interval);

        /* This governs the whole timeline */
        allIntervals.addInterval(obj.interval.clone());

        obj.pilot = this;
    }

    remove(obj) {
        assert(obj);
        assert(obj instanceof Track || obj instanceof Video);
        assert(obj.interval.data == obj);

        /* Two interval collections depending on the type */
        const intervals = obj instanceof Track ? this.tracks : this.videos;
        intervals.removeInterval(obj.interval);

        obj.pilot = null;
    }
};

Pilot.ensure = function ensurePilot(name) {
    assert(typeof name == "string");

    const pilot = pilots[name] || new Pilot(name);
    assert(pilots[name]);

    return pilot;
};

