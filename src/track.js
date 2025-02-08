import {
    extractIGC,
} from './extract.js';

import {
    Pilot,
} from './pilot.js';

import {
    allIntervals,
} from './timeline.js';

import {
    assert,
    parseTimestamp,
    qualifiedUrl,
    warning,
} from './util.js';

import {
    viewer,
} from './viewer.js';

import {
    Cartesian3,
    Color,
    ColorMaterialProperty,
    JulianDate,
    PathGraphics,
    SampledPositionProperty,
    TimeInterval,
    TimeIntervalCollection,
    VelocityOrientationProperty,
} from 'cesium';

import IGCParser from "igc-parser";

export class Track {
    constructor(igcData, filename) {
        this.igcData = igcData;
        this.name = filename;

        this.timezone = null;
        this.paraglider = null;
        this.tracker = null;
        this.entities = null;
        this.interval = null;
    }

    save() {
        /* The JSON for this is just the filename */
        return this.name;
    }

    async create() {
        const igcData = this.igcData;
        let startTime = null;
        let endTime = null;

        const pilot = Pilot.ensure(igcData.pilot);

        /* IGC files have timezone in floating point hours, we need it in seconds */
        if (typeof igcData.timezone == "number")
            this.timezone = igcData.timezone * 3600;

        /* Feed context to our extraction functions */
        extractIGC(igcData);

        // The SampledPositionedProperty stores the position/timestamp for each sample along the series.
        const paragliderPositions = new SampledPositionProperty();
        const trackerPositions = new SampledPositionProperty();
        const trackerCartesian = new Cartesian3(0, 0, 0);
        const trackerStack = new Array();

        const TRACKER_WINDOW = 128;

        function updateTracker(drain) {
            if (drain || trackerStack.length >= TRACKER_WINDOW) {
                const bottom = trackerStack.shift();
                Cartesian3.subtract(trackerCartesian, bottom.position, trackerCartesian);
            }

            if ((drain && trackerStack.length) || trackerStack.length > TRACKER_WINDOW / 2) {
                const average = new Cartesian3(0, 0, 0);
                Cartesian3.divideByScalar(trackerCartesian, trackerStack.length, average);

                const index = Math.max(0, trackerStack.length - TRACKER_WINDOW / 2);
                trackerPositions.addSample(trackerStack[index].time, average);
            }
        }

        const entities = [ ];
        const length = igcData.fixes.length;

        // Create a point for each.
        for (let i = 0; i < length; i++) {
            const fix = igcData.fixes[i];

            // const altitude = (fix.gpsAltitude + fix.pressureAltitude) / 2;
            const time = parseTimestamp(fix.timestamp);
            const altitude = fix.gpsAltitude - 70;
            const position = Cartesian3.fromDegrees(fix.longitude, fix.latitude, altitude);

            /*
             * The starting, stopping point, an invisible marker.
             * To debug, trace entire track just change condition and pixelSize
             */
            if (i == 0 || i == length - 1) {
                entities.push(viewer.entities.add({
                    position: position,
                    point: { pixelSize: 0, color: Color.BLUE }
                }));
            }

            paragliderPositions.addSample(time, position);

            trackerStack.push({ position: position, time: time });
            Cartesian3.add(trackerCartesian, position, trackerCartesian);
            updateTracker();

            startTime = startTime || time;
            endTime = time;
        }


        /* Update the remaining average position of the tracker */
        while (trackerStack.length > 0)
            updateTracker(true);

        const interval = new TimeInterval({
            start: startTime,
            stop: endTime,
            isStopIncluded: false,
            data: this
        });

        /* Extend track availability by default to 12 hours after landing */
        const extended = endTime.clone();
        if (Track.trailing)
            JulianDate.addSeconds(endTime, Track.trailing, extended);
        else
            JulianDate.addHours(endTime, 12, extended);

        const paraglider = viewer.entities.add({
            availability: new TimeIntervalCollection([
                interval, /* The actual time of the track, extended avalability below */
                new TimeInterval({ start: endTime, stop: extended })
            ]),
            position: paragliderPositions,
            point: { pixelSize: 10, color: pilot.color },
            // Automatically compute the orientation from the position.
            orientation: new VelocityOrientationProperty(trackerPositions),
            path: new PathGraphics({
                width: 1,
                leadTime: 0,
                trailTime: Track.trailing || undefined,
                material: new ColorMaterialProperty(pilot.color)
            })
        });

        const tracker = viewer.entities.add({
            availability: new TimeIntervalCollection([ new TimeInterval({
                start: startTime,
                stop: endTime
            }) ]),
            position: trackerPositions,
            point: { pixelSize: 0, color: Color.BLUE },
            // viewFrom: DEFAULT_VIEW,
            parent: paraglider,

            /*
             * Change pixelSize above to > 0 to visualize tracker position
             * path: new PathGraphics( { width: 3 })
             */
        });

        /* Used for finding our track based on the entity/interval */
        paraglider.data = this;
        tracker.data = this;
        entities.push(paraglider, tracker);

        this.entities = entities;
        this.paraglider = paraglider;
        this.tracker = tracker;
        this.interval = interval;

        pilot.add(this);
        assert(this.pilot == pilot);

        // TODO: This uses a private API
        assert(!this.range);
        this.range = viewer.timeline.addHighlightRange(pilot.color.toCssHexString(),
            3, pilot.index * 2);
        this.range.setRange(interval.start, interval.stop);
    }

    destroy() {
        // TODO: This uses private API
        assert(this.range);
        this.range.setRange(null, null);
        this.range = null;
        viewer.timeline.resize();

        while (this.entities && this.entities.length) {
            const entity = this.entities.pop();
            viewer.entities.remove(entity);
            entity.data = null;
        }
        this.entities = null;

        /* These entities are removed above */
        this.paraglider = null;
        this.tracker = null;

        this.pilot.remove(this);
        assert(this.pilot == null);

        this.interval.data = null;
        this.interval = null;

        viewer.timeline.zoomTo(allIntervals.start, allIntervals.stop);
    }
};

Track.load = async function loadTrack(filename) {
    let igcData = { fixes: [ ], pilot: "" };

    try {
        const response = await fetch(qualifiedUrl(filename));
        if (response.ok) {
            const data = await response.text();
            igcData = IGCParser.parse(data);
        } else {
            if (response.status == 404)
                warning("IGC track log file not found", filename);
            else
                warning("Couldn't load track log file file", filename, response.status, response.statusText);
        }
    } catch (ex) {
        warning("Failure to parse IGC track log file", filename, ":", ex);
    }

    var track = new Track(igcData, filename);
    await track.create();

    return track;
};
