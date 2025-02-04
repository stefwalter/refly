"use strict";

// TODO: Eventually remove this and do individual imports
import * as Cesium from "cesium";

import IGCParser from "igc-parser";
import {
    DisplayOptions,
    SkipGapsButton,
    HighResolutionButton,
} from "./displayoptions.js";
import { problem, assert, failure, warning, message } from './util.js';
import { parseTimestamp, parseTimezone, parseDuration } from './util.js';
import { guessMimeType } from './util.js';

import {
    extractMetadata,
    extractDuration,
    extractFile,
    extractIGC,
    learnPilot,
} from './extract.js';

import "cesium/Build/Cesium/Widgets/widgets.css";
import "./style.css";

/* Default playback rate of flights */
const DEFAULT_RATE = 50;

/* Default duration of new images */
const DEFAULT_DURATION = 5;

/* Seconds to jump when seeking */
const JUMP_SECONDS = 10;

/* Default camera offset to track from */
const DEFAULT_VIEW = new Cesium.Cartesian3(50, -500, 2000);

/* The graphic for the play button */
const PLAY_BUTTON = 'data:image/svg+xml;utf8,<svg width="32" height="32" version="1.1" viewBox="0 0 2.4 2.4" xml:space="preserve" xmlns="http://www.w3.org/2000/svg"><path d="m1.2 0c-0.66168 0-1.2 0.53832-1.2 1.2s0.53832 1.2 1.2 1.2 1.2-0.53832 1.2-1.2-0.53832-1.2-1.2-1.2zm-0.42618 0.56016c0.00923 4.05e-4 0.018423 0.002725 0.026367 0.006885l1.1047 0.6c0.014127 0.00744 0.022559 0.019719 0.022559 0.032959s-0.00843 0.025666-0.022559 0.033106l-1.1047 0.6c-0.00875 0.0046-0.018954 0.00688-0.02915 0.00688-0.00828 0-0.01661-0.00142-0.02417-0.00454-0.016976-0.0069168-0.027539-0.020606-0.027539-0.035446v-1.2c0-0.01484 0.010615-0.028383 0.027539-0.035303 0.00849-0.00346 0.017721-0.004946 0.026953-0.004541z" stroke-width="0" fill="black"/></svg>';

/* Ticks for the playback rate dial */
const DIAL_TICKS = [ 0.25, 0.5, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 8.0, 10.0, 12.0, 15.0, 16.0,
  20.0, 25.0, 30.0, 40.0, 50.0, 75.0, 100.0, 200.0, 300.0, 500.0, 1000.0 ];

/* Defined in config.js */
Cesium.Ion.defaultAccessToken = window.defaultAccessToken;

class State extends DisplayOptions {
    constructor() {
        super();
        this.pilots = { };

        /* The entire set of intervals for the timeline */
        this.intervals = new Cesium.TimeIntervalCollection();

        /* Timezone from the timeline.json */
        this.timezone = 0;

        /* Trailing time for drawing flights */
        this.trailing = null;

        /* Sub-folder currently being used */
        this.folder = null;

        /* Currently being displayed */
        this.pilot = null;
        this.any = null;

        /* Loaded from the client */
        this.blobs = { };
    }
};

/* Share these in our console for Javascript debugging */
const state = window.state = new State();
const viewer = window.viewer = new Cesium.Viewer('cesiumContainer', {
    terrain: Cesium.Terrain.fromWorldTerrain(),
    // TODO: Figure out why this works
    baseLayer: Cesium.ImageryLayer.fromProviderAsync( Cesium.ArcGisMapServerImageryProvider.fromUrl('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer', { })),
    // baseLayer: state.imageProvider,
    selectionIndicator: false,
    geocoder: false,
    scene3DOnly: true,
    projectionPicker: false,
    baseLayerPicker: false,
});

/*
 * All colors available
 * https://htmlcolorcodes.com/color-chart/
 */
const colors = [
    "#3498db", "#F1C40F", "#E67E22", "#2ecc71", "#27AE60", "#16A085", "#1ABC9C",
    "#3498DB", "#8E44AD", "#9B59B6", "#E74C3C", "#C0392B", "#F39C12", "#D35400",
];

const spinners = new Object();
function spinner(identifier, waiting, timeout) {
    function visibility() {
        document.getElementById("spinner").style.display = Object.keys(spinners).length > 0 ? "block" : "none";
    }
    if (waiting && !(identifier in spinners)) {
        spinners[identifier] = window.setTimeout(function() {
            visibility();
            if (identifier in spinners)
                spinners[identifier] = null;
        }, timeout || 100);
    } else if (!waiting && identifier in spinners) {
        window.clearTimeout(spinners[identifier]);
        delete spinners[identifier];
        visibility();
    }
}

class Flight {
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
        const paragliderPositions = new Cesium.SampledPositionProperty();
        const trackerPositions = new Cesium.SampledPositionProperty();
        const trackerCartesian = new Cesium.Cartesian3(0, 0, 0);
        const trackerStack = new Array();

        const TRACKER_WINDOW = 128;

        function updateTracker(drain) {
            if (drain || trackerStack.length >= TRACKER_WINDOW) {
                const bottom = trackerStack.shift();
                Cesium.Cartesian3.subtract(trackerCartesian, bottom.position, trackerCartesian);
            }

            if ((drain && trackerStack.length) || trackerStack.length > TRACKER_WINDOW / 2) {
                const average = new Cesium.Cartesian3(0, 0, 0);
                Cesium.Cartesian3.divideByScalar(trackerCartesian, trackerStack.length, average);

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
            const position = Cesium.Cartesian3.fromDegrees(fix.longitude, fix.latitude, altitude);

            /*
             * The starting, stopping point, an invisible marker.
             * To debug, trace entire track just change condition and pixelSize
             */
            if (i == 0 || i == length - 1) {
                entities.push(viewer.entities.add({
                    position: position,
                    point: { pixelSize: 0, color: Cesium.Color.BLUE }
                }));
            }

            paragliderPositions.addSample(time, position);

            trackerStack.push({ position: position, time: time });
            Cesium.Cartesian3.add(trackerCartesian, position, trackerCartesian);
            updateTracker();

            startTime = startTime || time;
            endTime = time;
        }


        /* Update the remaining average position of the tracker */
        while (trackerStack.length > 0)
            updateTracker(true);

        const interval = new Cesium.TimeInterval({
            start: startTime,
            stop: endTime,
            isStopIncluded: false,
            data: this
        });

        /* Extend flight availability by default to 12 hours after landing */
        const extended = endTime.clone();
        if (state.trailing)
            Cesium.JulianDate.addSeconds(endTime, state.trailing, extended);
        else
            Cesium.JulianDate.addHours(endTime, 12, extended);

        const paraglider = viewer.entities.add({
            availability: new Cesium.TimeIntervalCollection([
                interval, /* The actual time of the flight, extended avalability below */
                new Cesium.TimeInterval({ start: endTime, stop: extended })
            ]),
            position: paragliderPositions,
            point: { pixelSize: 10, color: pilot.color },
            // Automatically compute the orientation from the position.
            orientation: new Cesium.VelocityOrientationProperty(trackerPositions),
            path: new Cesium.PathGraphics({
                width: 1,
                leadTime: 0,
                trailTime: state.trailing || undefined,
                material: new Cesium.ColorMaterialProperty(pilot.color)
            })
        });

        const tracker = viewer.entities.add({
            availability: new Cesium.TimeIntervalCollection([ new Cesium.TimeInterval({
                start: startTime,
                stop: endTime
            }) ]),
            position: trackerPositions,
            point: { pixelSize: 0, color: Cesium.Color.BLUE },
            viewFrom: DEFAULT_VIEW,
            parent: paraglider,

            /*
             * Change pixelSize above to > 0 to visualize tracker position
             * path: new Cesium.PathGraphics( { width: 3 })
             */
        });

        /* Used for finding our flight based on the entity/interval */
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

        viewer.timeline.zoomTo(state.intervals.start, state.intervals.stop);
    }
};

Flight.load = async function loadFlight(filename) {
    let igcData = { fixes: [ ], pilot: "" };

    try {
        const response = await fetch(qualifiedUrl(filename));
        if (response.ok) {
            const data = await response.text();
            igcData = IGCParser.parse(data);
        } else {
            if (response.status == 404)
                warning("IGC flight log file not found", filename);
            else
                warning("Couldn't load flight log file file", filename, response.status, response.statusText);
        }
    } catch (ex) {
        warning("Failure to parse IGC flight log file", filename, ":", ex);
    }

    var flight = new Flight(igcData, filename);
    await flight.create();

    /* Use the first valid timezone in a flight */
    if (typeof state.timezone != "number")
        state.timezone = flight.timezone;

    return flight;
};

class Video {
    constructor(videoData) {
        this.name = this.filename = videoData.filename;
        this.videoData = videoData;
        this.element = null;
        this.entities = [ ];
        this.rate = 1;

        this.ticker = null;
        this.originalRate = null;
    }

    save() {
        /* The JSON for this is the videoData */
        return this.videoData;
    }

    /* The hints are optional, default metadata */
    create(hints) {
        const that = this;
        const videoData = that.videoData;

        if (videoData.rate) {
            if (typeof videoData.rate != "number" || videoData.rate <= 0)
                warning("Invalid rate for video:", videoData.rate);
            else
                that.rate = videoData.rate;
        }

        const isImage = guessMimeType(videoData.filename, videoData.type).startsWith("image/");
        const element = document.createElement(isImage ? "div" : "video");
        element.setAttribute("class", "content");
        element.style.visibility = "hidden";

        const source = document.createElement(isImage ? 'img' : 'source');
        source.setAttribute('src', qualifiedUrl(videoData.filename));
        element.appendChild(source);

        /* Identifier for spinners */
        const identifier = videoData.filename + crypto.randomUUID;

        /* Special code for the video */
        if (element.pause) {
            element.setAttribute("loop", "false");
            element.setAttribute("preload", "metadata");

            element.addEventListener("playing", function() {
                spinner(identifier, false, 500);
                console.log("Playing", videoData.filename);
            });
            element.addEventListener("waiting", function() {
                spinner(identifier, true, 500);
                console.log("Waiting", videoData.filename);
            });

            element.addEventListener("seeking", function() {
                console.log("Seeking", videoData.filename);
            });
        }
        document.body.appendChild(element);

        that.entities = [ ];

        /* Passed an array of possible metadata objects about the video/image */
        function completeVideo(metadatas) {
            spinner(identifier, false);

            /* Collapse all the provided metadata */
            const metadata = metadatas.reduce(function(metadata, data) {
                for (const key in data) {
                    if (data[key] !== undefined)
                        metadata[key] = data[key];
                }
                return metadata;
            }, { });

            const start = parseTimestamp(metadata.timestamp);

            const pilot = Pilot.ensure(metadata.pilot || "");

            /* The position of the video */
            let position = null;

            /* These values have to be correct or we wont see the video billboard. Shrug */
            if (metadata.longitude || metadata.latitude || metadata.altitude) {
                const longitude = metadata.longitude || 0;
                const latitude = metadata.latitude || 0;
                const altitude = metadata.altitude || 0;

                if (typeof longitude != "number" || Math.abs(longitude) > 180 ||
                    typeof latitude != "number" ||  Math.abs(latitude) > 90 ||
                    typeof altitude != "number" || altitude < 0) {
                    warning("Invalid latitude/longitude/altitude position:",
                            latitude, longitude, altitude);
                } else {
                    position = Cesium.Cartesian3.fromDegrees(longitude, latitude, altitude);
                }
            }

            /* Otherwise find a flight that overlaps this video's start */
            if (!position) {
                const flight = pilot.flights.findDataForIntervalContainingDate(start);
                if (flight)
                    position = flight.paraglider.position.getValue(start);
            }

            /* A billboard to see the video */
            if (position) {
                const datauri = PLAY_BUTTON.replace("black", pilot.color.toCssHexString()).replace('#', '%23');
                const billboard = viewer.entities.add({
                    position: position,
                    billboard: { image: datauri, width: 32, height: 32 },
                });

                billboard.data = that;
                that.entities.push(billboard);
            }

            /* If no duration provided (such as an image), just use the default */
            const duration = parseDuration(metadata.duration) || DEFAULT_DURATION;
            const stop = start.clone();
            Cesium.JulianDate.addSeconds(start, duration * that.rate, stop);

            const interval = new Cesium.TimeInterval({
                start: start,
                stop: stop,
                isStopIncluded: false,
                data: that,
            });

            interval.data = that;
            that.interval = interval;

            pilot.add(that);
            assert(that.pilot == pilot);

            // TODO: This uses a private API
            assert(!that.range);
            that.range = viewer.timeline.addHighlightRange(pilot.color.toCssHexString(),
                3, pilot.index * 2 + 5);
            that.range.setRange(interval.start, interval.stop);
        }

        that.element = element;
        that.element.data = that;
        spinner(identifier, true);

        /* Provide all the metadata sources, in ascending order of importance/override */
        return Promise.all([
            hints || { },
            extractMetadata(isImage ? source : that.element, videoData.filename),
            extractDuration(isImage ? source : that.element),
            videoData,
        ]).then(completeVideo);
    }

    destroy() {
        this.stop();

        assert(this.element);
        document.body.removeChild(this.element);
        this.element.data = null;

        while (this.entities && this.entities.length) {
            const entity = this.entities.pop();
            viewer.entities.remove(entity);
            entity.data = null;
        }
        this.entities = null;

        // TODO: This uses private API
        assert(this.range);
        this.range.setRange(null, null);
        this.range = null;
        viewer.timeline.resize();

        this.pilot.remove(this);
        assert(this.pilot == null);

        this.interval.data = null;
        this.interval = null;

        viewer.timeline.zoomTo(state.intervals.start, state.intervals.stop);
    }

    start() {
        const element = this.element;
        const interval = this.interval;
        const clock = viewer.clock;
        const name = this.name;
        const that = this;

        function syncVideo() {

            /* Changing the rate during video play changes the metadata of the rate */
            // TODO: We should be updating all the intervals for this video. Hard
            that.rate = that.videoData.rate = Math.abs(clock.multiplier);

            const at = Cesium.JulianDate.secondsDifference(clock.currentTime, interval.start) / that.rate;
            if (!Cesium.Math.equalsEpsilon(at, element.currentTime, Cesium.Math.EPSILON1, 1)) {
                console.log("Syncing", name, element.currentTime, "->", at);
                element.currentTime = at;
            }

            const direction = clock.multiplier < 0 ? 0.1 : 1;
            if (direction != element.playbackRate)
                element.playbackRate = direction;

            if (clock.shouldAnimate && element.paused)
                element.play();
            else if (!clock.shouldAnimate && !element.paused)
                element.pause();
        }

        const direction = viewer.clock.multiplier < 0 ? -1 : 1;
        this.originalRate = viewer.clock.multiplier;
        viewer.clock.multiplier = this.rate * direction;

        /* If this is a <video>, do a synchronizer */
        if (this.element.play) {
            this.ticker = viewer.clock.onTick.addEventListener(syncVideo);
            syncVideo(true);
        }

        /* Actually show the video */
        this.element.style.visibility = "visible";
    }

    stop() {
        this.element.style.visibility = "hidden";
        if (this.ticker)
            this.ticker(); /* Remove the onTick handler */
        this.ticker = null;
        if (this.element.pause)
            this.element.pause();
        var direction = viewer.clock.multiplier < 0 ? -1 : 1;
        viewer.clock.multiplier = Math.abs(this.originalRate) * direction;
    }
};

/* The videoData is JSON, and file is an optional File object */
Video.load = async function loadVideo(videoData, hints) {
    const video = new Video(videoData);
    await video.create(hints);
    return video;
};

class Pilot {
    constructor(name) {
        assert(typeof name == "string");

        this.name = name;
        this.index = Object.keys(state.pilots).length;
        this.flights = new Cesium.TimeIntervalCollection();
        this.videos = new Cesium.TimeIntervalCollection();

        /* Each pilot gets a color, and keep them unique based on pilot string*/
        this.color = new Cesium.Color(0, 0, 0);
        Cesium.Color.fromCssColorString(colors.shift(), this.color);

        assert(!state.pilots[this.name]);

        const first = Object.values(state.pilots).at(0);
        state.pilots[this.name] = this;

        /* A linked list between all pilots */
        this.next = first || this;
        this.prev = this.next.prev || this;
        this.prev.next = this;
        this.next.prev = this;
    }

    add(obj) {
        assert(obj);
        assert(obj instanceof Flight || obj instanceof Video);
        assert(obj.interval.data == obj);

        /* Two interval collections depending on the type */
        const intervals = obj instanceof Flight ? this.flights : this.videos;

        /* Make sure this can be called multiple times */
        intervals.removeInterval(obj.interval);
        intervals.addInterval(obj.interval);

        /* This governs the whole timeline */
        state.intervals.addInterval(obj.interval.clone());

        obj.pilot = this;
    }

    remove(obj) {
        assert(obj);
        assert(obj instanceof Flight || obj instanceof Video);
        assert(obj.interval.data == obj);

        /* Two interval collections depending on the type */
        const intervals = obj instanceof Flight ? this.flights : this.videos;
        intervals.removeInterval(obj.interval);

        obj.pilot = null;
    }
};

Pilot.ensure = function ensurePilot(name) {
    assert(typeof name == "string");

    const pilot = state.pilots[name] || new Pilot(name);
    assert(state.pilots[name]);

    return pilot;
};

Pilot.change = function changePilot(pilot) {
    // Assume that the onTick will change
    state.pilot = pilot;
    const element = document.getElementById("pilot");
    element.innerText = pilot.name || "Any pilot";
    element.style.color = pilot.color.toCssHexString();
    learnPilot(pilot || undefined);
    console.log("Pilot", pilot.name);
};

function qualifiedUrl(path) {
    if (path in state.blobs)
        return state.blobs[path];
    path = path.replace(/^[/.]+|[/]+$/g, '');
    if (state.folder)
        path = "/media/" + state.folder + "/" + path;
    return path;
}

async function load(folder) {
    let metadata = { };

    /* The folder we retrieve all data from */
    state.folder = folder;

    try {
        const response = await fetch(qualifiedUrl("timeline.json"));
        if (response.ok) {
            metadata = await response.json();
        } else {
            if (response.status == 404)
                message("No timeline.json, starting with a blank screen");
            else
                warning("Couldn't load timeline.json file", response.status, response.statusText);
        }
    } catch (ex) {
        warning("Couldn't load timeline.json", ex);
    }

    /* Number of seconds to offset the timestamps, or null */
    state.timezone = parseTimezone(metadata.timezone);

    /* Number of seconds to show flight trail behind active spot */
    state.trailing = parseDuration(metadata.trailing);

    const flights = metadata.flights || [];
    const videos = metadata.videos || [];

    for (let i = 0; i < flights.length; i++)
        await Flight.load(flights[i]);

    for (let i = 0; i < videos.length; i++)
        await Video.load(videos[i]);

    loaded(null);
}

function save() {
    const data = {
        flights: [],
        videos: [],
        timezone: state.timezone,
        trailing: state.trailing,
    };

    Object.values(state.pilots).forEach(function(pilot) {
        for(let i = 0; i < pilot.flights.length; i++) {
            const item = pilot.flights.get(i).data.save();
            data.flights.push(item);
        }
        for(let i = 0; i < pilot.videos.length; i++) {
            const item = pilot.videos.get(i).data.save();
            data.videos.push(item);
        }
    });

    return JSON.stringify(data, null, 4);
}

function loaded(last) {
    let current = null;

    /* Recreate the global intervals, videos overlay flights */
    state.intervals = new Cesium.TimeIntervalCollection();
    Object.values(state.pilots).forEach(function(pilot) {
        for(let i = 0; i < pilot.flights.length; i++)
            state.intervals.addInterval(pilot.flights.get(i));
    });
    Object.values(state.pilots).forEach(function(pilot) {
        for(let i = 0; i < pilot.videos.length; i++)
            state.intervals.addInterval(pilot.videos.get(i));
    });

    /* Set up the timeline */
    if (state.intervals.length) {
        viewer.clock.startTime = state.intervals.start.clone();
        viewer.clock.stopTime = state.intervals.stop.clone();
        viewer.clock.clockRange = Cesium.ClockRange.CLAMPED;
        viewer.timeline.zoomTo(state.intervals.start, state.intervals.stop);
        current = state.intervals.start;
    }

    if (last)
        current = last.interval.start;

    if (current)
        viewer.clock.currentTime = current.clone();

    let entities = [];

    /* Fly to the item that was dropped */
    if (last) {
        Pilot.change(last.pilot);
        if (last instanceof Flight) {
            viewer.camera.position = DEFAULT_VIEW;
            entities = last.entities;
        }

    } else if (viewer.entities.values.length) {
        viewer.camera.position = DEFAULT_VIEW;
        entities = viewer.entities;
    }

    /* Do this after onTick */
    window.setTimeout(function() {
        viewer.flyTo(entities || [])
            .catch((ex) => console.error("Couldn't fly", ex));
    }, 0);
}

function initialize() {
    let currentFlight = null;
    let currentVideo = null;
    const trackedCamera = Cesium.Cartesian3.clone(DEFAULT_VIEW);

    /* Connects to util.problem */
    problem.addEventListener(function(title, message, error) {
        viewer.cesiumWidget.showErrorPanel(title, message, error);
    });

    /* Our ticks are also good defaults for video rate */
    viewer.animation.viewModel.setShuttleRingTicks(DIAL_TICKS);

    /* We initially have a any pilot */
    Pilot.change(state.any = Pilot.ensure(""));

    /* Change the tracked flight */
    function changeFlight(flight) {
        if (flight && flight.tracker) {
            flight.tracker.viewFrom = trackedCamera;
            viewer.trackedEntity = flight.tracker;
        } else {
            viewer.trackedEntity = null;
        }

        const old = currentFlight ? currentFlight.name : null;
        currentFlight = flight;

        console.log("Flight", old, "->", flight ? flight.name : null);
    }

    var timeout = null;
    var visible = true;

    function hideCesium() {
        if (visible) {
            document.getElementById("cesiumContainer").style.visibility = "hidden";
            viewer.cesiumWidget.targetFrameRate = 1;
        }
        visible = false;

        if (timeout !== null) {
            window.clearTimeout(timeout);
            timeout = null;
        }
    }

    function displayCesium() {
        if (timeout !== null) {
            window.clearTimeout(timeout);
            timeout = null;
        }
        if (currentVideo)
            timeout = window.setTimeout(hideCesium, 1000);
        if (!visible) {
            document.getElementById("cesiumContainer").style.visibility = "visible";
            viewer.cesiumWidget.targetFrameRate = undefined;
        }
        visible = true;
    }

    function changeVideo(video) {
        const old = currentVideo ? currentVideo.name : null;
        if (currentVideo)
            currentVideo.stop();
        currentVideo = video;
        if (video) {
            hideCesium();
            currentVideo.start(viewer.clock.currentTime);
        } else {
            displayCesium();
        }

        console.log("Video", old, "->", video ? video.name : null);
    }

    window.addEventListener("mousemove", function() {
        displayCesium();
        viewer.clock.onTick.raiseEvent(viewer.clock);
    });

    /*
     * Jump the timeline with these booleans
     *
     * forward: true or backwards = false
     * edge: boolean to the next start/stop of video or track
     * small: boolean try to do a smaller jump
     */
    function jumpTimeline(forward, edge, small) {
        const current = viewer.clock.currentTime;
        const jump = new Cesium.JulianDate(0, 0, Cesium.TimeStandard.UTC);
        const seconds = JUMP_SECONDS * (forward ? 1 : -1) * Math.abs(small ? 1 : viewer.clock.multiplier);

        let index = state.intervals.indexOf(current);
        let interval = null;

        function name() {
            assert(interval);
            return interval.data ? interval.data.name : index;
        }

        /* Do our boundary epsilon matching here */
        if (index >= 0) {
            interval = state.intervals.get(index);
            assert(interval);
            if (!forward && Cesium.JulianDate.equalsEpsilon(current, interval.start, 1)) {
                console.log("Jump assuming before", name());
                index = ~index; /* This is how we indicate we're before this interval */
            } else if (forward && Cesium.JulianDate.equalsEpsilon(current, interval.stop)) {
                console.log("Jumping assuming after", name());
                index = ~(index + 1);
            }
        }
        if (index < 0) {
            if (forward) {
                interval = state.intervals.get(~index);
                if (interval && Cesium.JulianDate.equalsEpsilon(current, interval.start, 1)) {
                    console.log("Jump assuming within", name());
                    index = ~index;
                }
            } else {
                interval = state.intervals.get((~index) - 1);
                if (interval && Cesium.JulianDate.equalsEpsilon(current, interval.stop, 1)) {
                    console.log("Jump assuming within", name());
                    index = (~index) - 1;
                }
            }
        }

        if (index >= 0) {
            interval = state.intervals.get(index);
            assert(interval);

            /* We're at the start of the first interval */
            if (index == 0 && edge && !forward &&
                Cesium.JulianDate.equalsEpsilon(current, interval.start, 1)) {

                console.log("Jumping to beginning");
                Cesium.JulianDate.clone(viewer.clock.startTime, jump);

                /* We're at the end of the very last interval */
            } else if (index == state.intervals.length && edge && forward &&
                Cesium.JulianDate.equalsEpsilon(current, interval.stop)) {

                /* We're at the end of the very last interval */
                if (edge && index == state.intervals.length < 1) {
                    console.log("Jumping to ending");
                    Cesium.JulianDate.clone(viewer.clock.stopTime, jump);
                }

                /* Jump to the start of the interval */
            } else if (edge && !forward) {
                console.log("Jumping to start", name());
                Cesium.JulianDate.clone(interval.start, jump);

                /* Jump to the stop of the interval */
            } else if (edge && forward) {
                console.log("Jumping to stop", name());
                Cesium.JulianDate.clone(interval.stop, jump);

                /* Plain Arrow key */
            } else if (!edge) {
                Cesium.JulianDate.addSeconds(current, seconds, jump);

                /* Jumping out of this interval, fall through to code below */
                if (state.intervals.indexOf(jump) != index)
                    jump.dayNumber = jump.secondsOfDay = 0;
                else
                    console.log("Jumping", seconds, forward ? "forwards in" : "backwards in", name());
            }
        }


        if (!jump.dayNumber) {

            /* Not in an interval. Ctrl jumps to the previous */
            if (edge && !forward) {
                interval = state.intervals.get((~index) - 1);
                if (interval) {
                    console.log("Jumping to prev stop", name());
                    Cesium.JulianDate.clone(interval.stop, jump);
                } else {
                    console.log("Jumping to beginning");
                    Cesium.JulianDate.clone(viewer.clock.startTime, jump);
                }

            /* Ctrl outside of a video jumping forwards */
            } else if (edge && forward) {
                interval = state.intervals.get(~index);
                if (interval) {
                    console.log("Jumping to next start", name());
                    Cesium.JulianDate.clone(interval.start, jump);
                } else {
                    console.log("Jumping to ending");
                    Cesium.JulianDate.clone(viewer.clock.stopTime, jump);
                }

            /* And the standard jump outside of an interval */
            } else {
                Cesium.JulianDate.addSeconds(current, seconds, jump);
                console.log("Jumping", seconds, forward ? "forwards" : "backwards");
            }
        }

        if (!jump.dayNumber) {
            /* Again, if we're still in an interval, then jump to edge */
            if (index >= 0) {
                interval = state.intervals.get(index);
                console.log("Jumping to", forward ? "stop of" : "start of", name());
                Cesium.JulianDate.clone(forward ? interval.stop : interval.start, jump);
            }
        }


        /* By now we should have reached a decision on where to go */
        assert(jump.dayNumber);

        /* See if we need to expand */
        let expanded = false;
        if (forward) {
            if (Cesium.JulianDate.greaterThan(jump, viewer.clock.stopTime)) {
                viewer.clock.stopTime = jump.clone();
                console.log("Expanding end of timeline", jump.toString());
                expanded = true;
            }
        } else {
            if (Cesium.JulianDate.lessThan(jump, viewer.clock.startTime)) {
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

    window.addEventListener("keydown", function(e) {

        /* The Home key */
        if (e.keyCode == 36) {
            viewer.clock.currentTime = viewer.clock.startTime;

        /* The End key */
        } else if (e.keyCode == 35) {
            viewer.clock.currentTime = viewer.clock.stopTime;

        /* PageUp and Page Down */
        } else if (e.keyCode == 33 || e.keyCode == 34) {
            if (e.keyCode == 33)
                Pilot.change(state.pilot.prev);
            else
                Pilot.change(state.pilot.next);

        /* Left or Right arrow keys (and optionally Ctrl modifier) */
        } else if (e.keyCode == 37 || e.keyCode == 39) {
            if (state.intervals.length)
                jumpTimeline(e.keyCode == 39, e.ctrlKey, e.shiftKey);
        }

        viewer.clock.onTick.raiseEvent(viewer.clock);
    }, true);

    window.addEventListener("keypress", function(e) {
        /* Spacebar: pause/play clock */
        if (e.keyCode == 32) {
            viewer.animation.viewModel.pauseViewModel.command();
            viewer.clock.onTick.raiseEvent(viewer.clock);
            e.preventDefault();
            return true;

        /* Delete: delete the object */
        } else if (e.keyCode == 127) {
            console.log("delete", currentVideo, currentFlight);
            if (currentVideo) {
                const video = currentVideo;
                changeVideo(null);
                video.destroy();
            } else if (currentFlight) {
                const flight = currentFlight;
                changeFlight(null);
                flight.destroy();
            }
        }
    }, true);

    function formatIso8601(date) {
        const offset = typeof state.timezone == "number" ? state.timezone :
            -(new Date("1970-01-01T00:00:00").valueOf()) / 1000;
        const display = new Cesium.JulianDate();
        Cesium.JulianDate.addSeconds(date, offset, display);
        return Cesium.JulianDate.toIso8601(display, 0);
    }

    viewer.animation.viewModel.dateFormatter = function(date/*, viewModel */) {
        return formatIso8601(date).slice(0, 10);
    };

    viewer.animation.viewModel.timeFormatter = function(date/*, viewModel */) {
        return formatIso8601(date).slice(11, 19);
    };

    viewer.timeline.makeLabel = function(date) {
        return formatIso8601(date).slice(11, 16);
    };

    viewer.selectedEntityChanged.addEventListener(function(entity) {
        if (!entity || !entity.data)
            return;

        const obj = entity.data;
        const interval = obj.interval;
        if (!interval || !obj.pilot)
            return;

        let change = false;

        /* Make sure a valid pilot is selected for this entity */
        if (state.pilot != obj.pilot) {
            Pilot.change(obj.pilot);
            change = true;
        }

        /* And jump to the entity */
        if (obj instanceof Video ||
            !Cesium.TimeInterval.contains(interval, viewer.clock.currentTime)) {
            viewer.clock.currentTime = interval.start;
            change = true;
        }

        /* Start playing if we changed something */
        if (change)
            viewer.clock.shouldAnimate = true;
    });

    /* Here we store the base playback rate (ie: clock multiplier) */
    viewer.clock.multiplier = DEFAULT_RATE;

    viewer.clock.onTick.addEventListener(function(clock) {
        const pilot = state.pilot;
        const any = state.any;

        /* Note the tracked entity's camera position for use when changing trackers */
        if (viewer.trackedEntity)
            Cesium.Cartesian3.clone(viewer.camera.position, trackedCamera);

        const current = clock.currentTime;
        let video = null;
        let flight = null;
        let found = false;

        /* If it's the any pilot then look for all videos */
        if (pilot == any) {
            const aint = state.intervals.findIntervalContainingDate(current);
            if (aint) {
                video = aint.data instanceof Video ? aint.data : null;

                /* Found anything, so this spot in timeline is relevant */
                found = true;
            }

        /* Specific pilot, look for flight or video */
        } else {
            const fint = pilot.flights.findIntervalContainingDate(current);
            flight = fint ? fint.data : null;
            const vint = pilot.videos.findIntervalContainingDate(current);
            video = vint ? vint.data : null;

            /* Look for videos on the any pilot regardless of  */
            if (!video && pilot != any) {
                const xint = any.videos.findIntervalContainingDate(current);
                video = xint ? xint.data : null;
            }

            /* Anything found means we're at a relevent place in the timeline */
            found = !!flight || !!video;
        }

        /* Do we need to change the flight, or clear it? */
        if (flight != currentFlight)
            changeFlight(flight);

        /* Do we need to change the video, or clear it? */
        if (video != currentVideo)
            changeVideo(video);

        /* If in seamless mode, and no video/flight displayed then jump to next one */
        if (!found && clock.shouldAnimate && state.skipGaps && state.intervals.length)
            jumpTimeline(clock.multiplier > 0 ? true : false, true);

    });

    var dragEntity = null;

    function dragEvent(ev) {
        ev.preventDefault();
        ev.stopPropagation();

        const over = (ev.type == "dragover" || ev.type == "dragenter");
        document.body.classList.toggle("highlight", over);

        if (ev.type == "drop" || ev.type == "dragleave") {
            viewer.entities.remove(dragEntity);
            dragEntity = null;
            return true;
        }

        let position = null;

        if (currentFlight) {
            position = currentFlight.paraglider.position.getValue(viewer.clock.currentTime);
        } else {
            const ray = viewer.camera.getPickRay(new Cesium.Cartesian2(ev.clientX, ev.clientY));
            position = viewer.scene.globe.pick(ray, viewer.scene);
        }

        const item = ev.dataTransfer.items[0] || { };
        const type = guessMimeType("", item.type);

        if (dragEntity) {
            dragEntity.position = position;

        } else if (type.startsWith("image/") || type.startsWith("video/")) {
            const datauri = PLAY_BUTTON.replace("black", state.pilot.color.toCssHexString()).replace('#', '%23');
            dragEntity = viewer.entities.add({
                position: position,
                billboard: { image: datauri, width: 32, height: 32 },
            });
        }

        return true;
    }

    function pixelToLocation(x, y) {
        const ray = viewer.camera.getPickRay(new Cesium.Cartesian2(x, y));
        var cartesian = viewer.scene.globe.pick(ray, viewer.scene);
        if (!cartesian)
            return null;
        const cartographic = viewer.scene.globe.ellipsoid.cartesianToCartographic(cartesian);
        return {
            latitude: Cesium.Math.toDegrees(cartographic.latitude),
            longitude: Cesium.Math.toDegrees(cartographic.longitude),
            altitude: Math.max(0, cartographic.height)
        };
    }


    window.addEventListener("dragenter", dragEvent);
    window.addEventListener("dragover", dragEvent);
    window.addEventListener("dragleave", dragEvent);

    function dropOne(ev) {
        assert(ev.dataTransfer && ev.dataTransfer.files);
        assert(ev.dataTransfer.files.length == 1);

        const file = ev.dataTransfer.files[0];
        const item = ev.dataTransfer.items[0];
        const url = URL.createObjectURL(file);
        state.blobs[file.name] = url;

        let promise = null;
        const type = guessMimeType(file.name, item.type || "");
        if (type.startsWith("image/") || type.startsWith("video/")) {
            const coordinates = currentFlight ? null : pixelToLocation(ev.clientX, ev.clientY);
            promise = Video.load(Object.assign({
                filename: file.name,
                pilot: state.pilot.name,
                timestamp: Cesium.JulianDate.toIso8601(viewer.clock.currentTime, 0),
                type: type,
            }, coordinates), extractFile(file));

        } else if (type == "application/x-igc") {
            promise = Flight.load(file.name);

        } else {
            warning ("Couldn't load unsupported dropped item:", file.name);
        }

        if (promise) {
            promise.then(function(obj) {
                loaded(obj);
            }).catch(function(ex) {
                failure("Couldn't load file", file.name, ex);
            });
        }
    }

    window.addEventListener("drop", function(ev) {
        dragEvent(ev);

        if (!ev.dataTransfer || !ev.dataTransfer.files || !ev.dataTransfer.files.length)
            warning("Drag and drop a flight, video or image to add");
        else if (ev.dataTransfer.files.length == 1)
            dropOne(ev);
        else
            warning("Don't drop multiple files at once");

        return false;
    });

    /* On clickable things make us a nice mouse pointer */
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction(function(movement) {
        var pickedObject = viewer.scene.pick(movement.endPosition);
        if (Cesium.defined(pickedObject))
            viewer.canvas.style.cursor = 'pointer';
        else
            viewer.canvas.style.cursor = 'default';
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    /* Override the Ctrl-C to provide timeline.json */
    document.addEventListener('copy', function(ev) {
        ev.preventDefault();
        ev.clipboardData.setData('text/plain', save());
    });

    /* The hash is our folder, we need to start fresh when it changes */
    window.addEventListener("hashchange", function(/* ev */) {
        location.reload();
    });

    viewer.homeButton.viewModel.command.beforeExecute.addEventListener(function(ev) {
        ev.cancel = true;
        viewer.flyTo(viewer.entities || []);
    });

    document.getElementById("pilot").addEventListener("click", function(/* ev */) {
        Pilot.change(state.pilot.next);
    });

    document.getElementById("open-button").addEventListener("click", function(/* ev */) {
        document.getElementById("file-upload").click();
    });

    document.getElementById("save-button").addEventListener("click", function(/* ev */) {
        const config = new Blob([save()], { type: 'text/json;charset=utf-8' });
        const url = URL.createObjectURL(config);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = "timeline.json";
        anchor.click();
        URL.revokeObjectURL(url);
    });

    document.getElementById("add-button").addEventListener("click", function(/* ev */) {
        document.getElementById("file-add").click();
    });

    document.getElementById("file-upload").addEventListener("change", function(ev) {
        const files = ev.target.files;
        let metadata = null;
        for (let i = 0; i < files.length; i++) {
            const url = URL.createObjectURL(files[i]);
            state.blobs[files[i].name] = url;
            if (files[i].name == "timeline.json")
                metadata = files[i];
        }

        if (files.length == 0)
            return;
        if (!metadata)
            warning("The selected folder does not have a timeline.json");

        load(null);
    });

    async function addFiles(files) {

        /* Load all the fligths, since they contain metadata for images */
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const type = guessMimeType(file.name, file.type);

            if (type == "application/x-igc") {
                state.blobs[file.name] = URL.createObjectURL(file);
                await Flight.load(file.name);
            }
        }

        /* Load all the images and videos */
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const type = guessMimeType(file.name, file.type);

            if (type.startsWith("image/") || type.startsWith("video/")) {
                state.blobs[file.name] = URL.createObjectURL(file);
                await Video.load({
                    filename: file.name,
                    type: type,
                }, extractFile(file));

            } else if (type != "application/x-igc") {
                warning("Couldn't load unsupported dropped item:", file.name);
            }
        }

    }

    document.getElementById("file-add").addEventListener("change", function(ev) {
        addFiles(ev.target.files).then(function() {
            loaded(null);
        }).catch(function(ex) {
            failure("Couldn't load files", ex);
        });
    });

    viewer.scene.globe.tileLoadProgressEvent.addEventListener(function(ev) {
        spinner("tiles", !currentVideo && ev > 0, 5000);
    });

    /* Add the help button instructions */
    (function() {
        const element = document.querySelector(".cesium-navigation-help TABLE");
        const extra = document.getElementById("extra-help");
        while (extra.childNodes.length)
            element.appendChild(extra.childNodes[0]);
    }());

    /* Set up the right base layer */
    Cesium.knockout.getObservable(state, 'imageProvider').subscribe(function(val) {
        val.then(function(provider) {
            console.log("Changing imagery base layer to", provider);
            const layers = viewer.scene.globe.imageryLayers;
            layers.remove(layers.get(0));
            layers.addImageryProvider(provider);
        }).catch(function(ex) {
            failure("Coludn't load image provider", ex);
        });
    });

    // TODO: Need to call destroy() on this when we implement resetting screen
    const element = document.getElementsByClassName("cesium-viewer-toolbar")[0];
    new SkipGapsButton(element, { viewModel: state });
    new HighResolutionButton(element, { viewModel: state });

    /* Finally make the widget visible */
    viewer.container.style.display = 'block';
}

initialize();

/* Load the folder described by the #bookmark in URI */
load(location.hash ? location.hash.substr(1) : null);
