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

/* The entire set of intervals for the timeline */
export const allIntervals = new TimeIntervalCollection();

/*
 * Jump the timeline with these booleans
 *
 * forward: true or backwards = false
 * edge: boolean to the next start/stop of video or track
 * small: boolean try to do a smaller jump
 */
export function jumpTimeline(forward, edge, small) {
    const current = viewer.clock.currentTime;
    const jump = new JulianDate(0, 0, TimeStandard.UTC);
    const seconds = JUMP_SECONDS * (forward ? 1 : -1) * Math.abs(small ? 1 : viewer.clock.multiplier);

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
        if (!forward && JulianDate.equalsEpsilon(current, interval.start, 1)) {
            console.log("Jump assuming before", name());
            index = ~index; /* This is how we indicate we're before this interval */
        } else if (forward && JulianDate.equalsEpsilon(current, interval.stop)) {
            console.log("Jumping assuming after", name());
            index = ~(index + 1);
        }
    }
    if (index < 0) {
        if (forward) {
            interval = allIntervals.get(~index);
            if (interval && JulianDate.equalsEpsilon(current, interval.start, 1)) {
                console.log("Jump assuming within", name());
                index = ~index;
            }
        } else {
            interval = allIntervals.get((~index) - 1);
            if (interval && JulianDate.equalsEpsilon(current, interval.stop, 1)) {
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
            JulianDate.equalsEpsilon(current, interval.start, 1)) {

            console.log("Jumping to beginning");
            JulianDate.clone(viewer.clock.startTime, jump);

            /* We're at the end of the very last interval */
        } else if (index == allIntervals.length && edge && forward &&
            JulianDate.equalsEpsilon(current, interval.stop)) {

            /* We're at the end of the very last interval */
            if (edge && index == allIntervals.length < 1) {
                console.log("Jumping to ending");
                JulianDate.clone(viewer.clock.stopTime, jump);
            }

            /* Jump to the start of the interval */
        } else if (edge && !forward) {
            console.log("Jumping to start", name());
            JulianDate.clone(interval.start, jump);

            /* Jump to the stop of the interval */
        } else if (edge && forward) {
            console.log("Jumping to stop", name());
            JulianDate.clone(interval.stop, jump);

            /* Plain Arrow key */
        } else if (!edge) {
            JulianDate.addSeconds(current, seconds, jump);

            /* Jumping out of this interval, fall through to code below */
            if (allIntervals.indexOf(jump) != index)
                jump.dayNumber = jump.secondsOfDay = 0;
            else
                console.log("Jumping", seconds, forward ? "forwards in" : "backwards in", name());
        }
    }


    if (!jump.dayNumber) {

        /* Not in an interval. Ctrl jumps to the previous */
        if (edge && !forward) {
            interval = allIntervals.get((~index) - 1);
            if (interval) {
                console.log("Jumping to prev stop", name());
                JulianDate.clone(interval.stop, jump);
            } else {
                console.log("Jumping to beginning");
                JulianDate.clone(viewer.clock.startTime, jump);
            }

            /* Ctrl outside of a video jumping forwards */
        } else if (edge && forward) {
            interval = allIntervals.get(~index);
            if (interval) {
                console.log("Jumping to next start", name());
                JulianDate.clone(interval.start, jump);
            } else {
                console.log("Jumping to ending");
                JulianDate.clone(viewer.clock.stopTime, jump);
            }

            /* And the standard jump outside of an interval */
        } else {
            JulianDate.addSeconds(current, seconds, jump);
            console.log("Jumping", seconds, forward ? "forwards" : "backwards");
        }
    }

    if (!jump.dayNumber) {
        /* Again, if we're still in an interval, then jump to edge */
        if (index >= 0) {
            interval = allIntervals.get(index);
            console.log("Jumping to", forward ? "stop of" : "start of", name());
            JulianDate.clone(forward ? interval.stop : interval.start, jump);
        }
    }


    /* By now we should have reached a decision on where to go */
    assert(jump.dayNumber);

    /* See if we need to expand */
    let expanded = false;
    if (forward) {
        if (JulianDate.greaterThan(jump, viewer.clock.stopTime)) {
            viewer.clock.stopTime = jump.clone();
            console.log("Expanding end of timeline", jump.toString());
            expanded = true;
        }
    } else {
        if (JulianDate.lessThan(jump, viewer.clock.startTime)) {
            viewer.clock.startTime = jump.clone();
            console.log("Expanding beginning of timeline", jump.toString());
            expanded = true;
        }
    }

    if (expanded)
        viewer.timeline.zoomTo(viewer.clock.startTime, viewer.clock.stopTime);

    /* One shouldn't be able to expand with Ctrl */
    assert(!expanded || !edge);

    /* Actually do the jump here */
    viewer.clock.currentTime = jump;
}

