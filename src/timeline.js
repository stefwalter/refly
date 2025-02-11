import {
    JulianDate,
    TimeStandard,
    TimeIntervalCollection,
} from 'cesium';

import {
    assert,
} from './util.js';

import {
    viewer,
} from './viewer.js';

/* Seconds to jump when seeking */
const JUMP_SECONDS = 10;

/* Epsilon seconds to treat near edge of video */
const EDGE_SECONDS = 2;

/* The entire set of intervals for the timeline */
export const allIntervals = new TimeIntervalCollection();

/*
 * Jump the timeline with these booleans
 *
 * REVERSE: jump backwards
 * EDGE: boolean to the next start/stop of video or track
 * SMALL: boolean try to do a smaller jump
 * COLLAPSE: Skip gaps
 */
export function jump(flags) {
    const forward = !(flags & jump.REVERSE);
    const edge = !!(flags & jump.EDGE);
    const small = !!(flags & jump.SMALL);
    const collapse = !!(flags & jump.COLLAPSE);

    const current = viewer.clock.currentTime;
    const to = new JulianDate(0, 0, TimeStandard.UTC);
    const seconds = JUMP_SECONDS * (forward ? 1 : -1) * Math.abs(small ? 1 : viewer.clock.multiplier);
    const epsilon = EDGE_SECONDS * viewer.clock.multiplier;

    let index = allIntervals.indexOf(current);
    let interval = null;

    function name() {
        assert(interval);
        return interval.data ? interval.data.name : index;
    }

    /* Do our boundary epsilon matching here */
    if (index >= 0) {
        interval = allIntervals.get(index);
        assert(interval);
        if (!forward && JulianDate.equalsEpsilon(current, interval.start, epsilon)) {
            console.log("Jump assuming before", name());
            index = ~index; /* This is how we indicate we're before this interval */
        } else if (forward && JulianDate.equalsEpsilon(current, interval.stop, epsilon)) {
            console.log("Jumping assuming after", name());
            index = ~(index + 1);
        }
    }
    if (index < 0) {
        if (forward) {
            interval = allIntervals.get(~index);
            if (interval && JulianDate.equalsEpsilon(current, interval.start, epsilon)) {
                console.log("Jump assuming within", name());
                index = ~index;
            }
        } else {
            interval = allIntervals.get((~index) - 1);
            if (interval && JulianDate.equalsEpsilon(current, interval.stop, epsilon)) {
                console.log("Jump assuming within", name());
                index = (~index) - 1;
            }
        }
    }

    if (index >= 0) {
        interval = allIntervals.get(index);
        assert(interval);

        /* We're at the start of the first interval */
        if (index == 0 && edge && !forward &&
            JulianDate.equalsEpsilon(current, interval.start, epsilon)) {

            console.log("Jumping to beginning");
            JulianDate.clone(viewer.clock.startTime, to);

        /* We're at the end of the very last interval */
        } else if (index == allIntervals.length - 1 && edge && forward &&
            JulianDate.equalsEpsilon(current, interval.stop, epsilon)) {

            console.log("Jumping to ending");
            JulianDate.clone(viewer.clock.stopTime, to);

        /* Jump to the start of the interval */
        } else if (edge && !forward) {
            console.log("Jumping to start", name());
            JulianDate.clone(interval.start, to);

        /* Jump to the stop of the interval */
        } else if (edge && forward) {
            if (collapse) {
                assert(index < allIntervals.length - 1);
                index++;
                interval = allIntervals.get(index);
                console.log("Jumping to start of later", name());
                JulianDate.clone(interval.start, to);
            } else {
                console.log("Jumping to stop", name());
                JulianDate.clone(interval.stop, to);
            }

        /* Plain Arrow key */
        } else if (!edge) {
            JulianDate.addSeconds(current, seconds, to);

            /* Jumping out of this interval, fall through to code below */
            if (allIntervals.indexOf(to) != index)
                to.dayNumber = to.secondsOfDay = 0;
            else
                console.log("Jumping", seconds, forward ? "forwards in" : "backwards in", name());
        }
    }


    if (!to.dayNumber) {

        /* Not in an interval. Ctrl jumps to the previous */
        if (edge && !forward) {
            interval = allIntervals.get((~index) - 1);
            if (interval) {
                console.log("Jumping to prev", collapse ? "start" : "stop", name());
                JulianDate.clone(collapse ? interval.start : interval.stop, to);
            } else {
                console.log("Jumping to beginning");
                JulianDate.clone(viewer.clock.startTime, to);
            }

        /* Ctrl outside of a video jumping forwards */
        } else if (edge && forward) {
            interval = allIntervals.get(~index);
            if (interval) {
                console.log("Jumping to next", collapse ? "stop" : "start", name());
                JulianDate.clone(collapse ? interval.stop : interval.start, to);
            } else {
                console.log("Jumping to ending");
                JulianDate.clone(viewer.clock.stopTime, to);
            }

        /* And the standard jump outside of an interval */
        } else {
            JulianDate.addSeconds(current, seconds, to);
            console.log("Jumping", seconds, forward ? "forwards" : "backwards");
        }
    }

    if (!to.dayNumber) {
        /* Again, if we're still in an interval, then jump to edge */
        if (index >= 0) {
            interval = allIntervals.get(index);
            console.log("Jumping to", forward ? "stop of" : "start of", name());
            JulianDate.clone(forward ? interval.stop : interval.start, to);
        }
    }

    /* By now we should have reached a decision on where to go */
    assert(to.dayNumber);

    if (forward) {
        if (JulianDate.greaterThan(to, viewer.clock.stopTime)) {
            JulianDate.clone(viewer.clock.stopTime, to);
            console.log("Limiting to end of timeline", to.toString());
        }
    } else {
        if (JulianDate.lessThan(to, viewer.clock.startTime)) {
            JulianDate.clone(viewer.clock.startTime, to);
            console.log("Limiting to beginning of timeline", to.toString());
        }
    }

    /* Actually do the jump here */
    viewer.clock.currentTime = to;
}

/* The flags from the above function */
jump.REVERSE = 0x01;
jump.EDGE = 0x02;
jump.SMALL = 0x04;
jump.COLLAPSE = 0x08;
