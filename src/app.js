"use strict";

// TODO: Eventually remove this and do individual imports
import * as Cesium from "cesium";

import {
    DisplayOptions,
    SkipGapsButton,
    HighResolutionButton,
} from "./displayoptions.js";
import { problem, assert, failure, warning, message } from './util.js';
import { parseTimezone, parseDuration } from './util.js';

import {
    guessMimeType,
    qualifiedUrl,
    qualifyBase,
    qualifyFile,
} from './util.js';

import {
    createViewer,
    viewer,
} from './viewer.js';

import {
    extractFile,
    learnPilot,
    learnTimezone,
} from './extract.js';

import {
    Pilot,
    pilots,
} from './pilot.js';

import {
    allIntervals,
    jump,
} from './timeline.js';

import {
    Track,
} from './track.js';

import {
    spinner,
} from './spinner.js';

import {
    PLAY_BUTTON,
    Video,
} from './video.js';

import "cesium/Build/Cesium/Widgets/widgets.css";
import "./style.css";

/* Default playback rate of track */
const DEFAULT_RATE = 50;

/* Default camera offset to track from */
const DEFAULT_VIEW = new Cesium.Cartesian3(50, -500, 2000);

/* Ticks for the playback rate dial */
const DIAL_TICKS = [ 0.25, 0.5, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 8.0, 10.0, 12.0, 15.0, 16.0,
  20.0, 25.0, 30.0, 40.0, 50.0, 75.0, 100.0, 200.0, 300.0, 500.0, 1000.0 ];

/* Defined in config.js */
Cesium.Ion.defaultAccessToken = window.defaultAccessToken;

/* Initialize the Cesium.Viewer in this div */
createViewer('cesiumContainer');

class State extends DisplayOptions {
    constructor() {
        super();

        /* Timezone from the timeline.json */
        this.timezone = 0;

        /* Currently being displayed */
        this.pilot = null;
        this.any = null;
    }
};

/* Share these in our console for Javascript debugging */
const state = window.state = new State();
function changePilot(pilot) {
    // Assume that the onTick will change
    state.pilot = pilot;
    const element = document.getElementById("pilot");
    element.innerText = pilot.name || "Any pilot";
    element.style.color = pilot.color.toCssHexString();
    learnPilot(pilot.name || undefined);
    console.log("Pilot", pilot.name);
};

async function load() {
    let metadata = { };

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

    /* Number of seconds to show track trail behind active spot */
    Track.trailing = parseDuration(metadata.trailing);

    const tracks = metadata.tracks || metadata.flights || [];
    const videos = metadata.videos || [];

    for (let i = 0; i < tracks.length; i++)
        await Track.load(tracks[i]);

    for (let i = 0; i < videos.length; i++)
        await Video.load(videos[i]);

    loaded(null);
}

function save() {
    const data = {
        tracks: [],
        videos: [],
        timezone: state.timezone,
        trailing: Track.trailing,
    };

    Object.values(pilots).forEach(function(pilot) {
        for(let i = 0; i < pilot.tracks.length; i++) {
            const item = pilot.tracks.get(i).data.save();
            data.tracks.push(item);
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

    /* Use the first valid timezone in a track */
    if (typeof state.timezone != "number")
        state.timezone = learnTimezone();

    /* Recreate the global intervals, videos overlay tracks */
    allIntervals.removeAll();
    Object.values(pilots).forEach(function(pilot) {
        for(let i = 0; i < pilot.tracks.length; i++)
            allIntervals.addInterval(pilot.tracks.get(i));
    });
    Object.values(pilots).forEach(function(pilot) {
        for(let i = 0; i < pilot.videos.length; i++)
            allIntervals.addInterval(pilot.videos.get(i));
    });

    /* Set up the timeline */
    if (allIntervals.length) {
        viewer.clock.startTime = allIntervals.start.clone();
        viewer.clock.stopTime = allIntervals.stop.clone();
        viewer.clock.clockRange = Cesium.ClockRange.CLAMPED;
        viewer.timeline.zoomTo(allIntervals.start, allIntervals.stop);
        current = allIntervals.start;
    }

    if (last)
        current = last.interval.start;

    if (current)
        viewer.clock.currentTime = current.clone();

    let entities = [];

    /* Fly to the item that was dropped */
    if (last) {
        changePilot(last.pilot);
        if (last instanceof Track) {
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
    let currentTrack = null;
    let currentVideo = null;
    const trackedCamera = Cesium.Cartesian3.clone(DEFAULT_VIEW);

    /* Connects to util.problem */
    problem.addEventListener(function(title, message, error) {
        viewer.cesiumWidget.showErrorPanel(title, message, error);
    });

    /* Our ticks are also good defaults for video rate */
    viewer.animation.viewModel.setShuttleRingTicks(DIAL_TICKS);

    /* We initially have a any pilot */
    changePilot(state.any = Pilot.ensure(""));

    /* Change the tracked track */
    function changeTrack(track) {
        if (track && track.tracker) {
            track.tracker.viewFrom = trackedCamera;
            viewer.trackedEntity = track.tracker;
        } else {
            viewer.trackedEntity = null;
        }

        const old = currentTrack ? currentTrack.name : null;
        currentTrack = track;

        console.log("Track", old, "->", track ? track.name : null);
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
                changePilot(state.pilot.prev);
            else
                changePilot(state.pilot.next);

        /* Left or Right arrow keys (and optionally Ctrl modifier) */
        } else if (e.keyCode == 37 || e.keyCode == 39) {
            if (allIntervals.length) {
                jump((e.keyCode == 37 ? jump.REVERSE : 0) |
                     (e.ctrlKey ? jump.EDGE : 0) |
                     (e.shiftKey ? jump.SMALL : 0) |
                     (state.skipGaps ? jump.COLLAPSE : 0));
            }
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
            console.log("delete", currentVideo, currentTrack);
            if (currentVideo) {
                const video = currentVideo;
                changeVideo(null);
                video.destroy();
            } else if (currentTrack) {
                const track = currentTrack;
                changeTrack(null);
                track.destroy();
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
            changePilot(obj.pilot);
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

    function clockTick(clock, nested) {
        const pilot = state.pilot;
        const any = state.any;

        /* Note the tracked entity's camera position for use when changing trackers */
        if (viewer.trackedEntity)
            Cesium.Cartesian3.clone(viewer.camera.position, trackedCamera);

        const current = clock.currentTime;
        let video = null;
        let track = null;
        let found = false;

        /* If it's the any pilot then look for all videos */
        if (pilot == any) {
            const aint = allIntervals.findIntervalContainingDate(current);
            if (aint) {
                video = aint.data instanceof Video ? aint.data : null;

                /* Found anything, so this spot in timeline is relevant */
                found = true;
            }

        /* Specific pilot, look for track or video */
        } else {
            const fint = pilot.tracks.findIntervalContainingDate(current);
            track = fint ? fint.data : null;
            const vint = pilot.videos.findIntervalContainingDate(current);
            video = vint ? vint.data : null;

            /* Look for videos on the any pilot regardless of  */
            if (!video && pilot != any) {
                const xint = any.videos.findIntervalContainingDate(current);
                video = xint ? xint.data : null;
            }

            /* Anything found means we're at a relevent place in the timeline */
            found = !!track || !!video;
        }

        /* Do we need to change the track, or clear it? */
        if (track != currentTrack)
            changeTrack(track);

        /* Do we need to change the video, or clear it? */
        if (video != currentVideo)
            changeVideo(video);

        /* If in seamless mode, and no video/track displayed then jump to next one */
        if (!found && !nested && clock.shouldAnimate && state.skipGaps && allIntervals.length) {
            jump((clock.multiplier > 0 ? 0 : jump.REVERSE) | jump.EDGE);

            /* Run the tick again */
            clockTick(clock, true);
        }

    }

    viewer.clock.onTick.addEventListener(clockTick);

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

        if (currentTrack) {
            position = currentTrack.paraglider.position.getValue(viewer.clock.currentTime);
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
        qualifyFile(file);

        let promise = null;
        const type = guessMimeType(file.name, item.type || "");
        if (type.startsWith("image/") || type.startsWith("video/")) {
            const coordinates = currentTrack ? null : pixelToLocation(ev.clientX, ev.clientY);
            promise = Video.load(Object.assign({
                filename: file.name,
                person: state.pilot.name,
                timestamp: Cesium.JulianDate.toIso8601(viewer.clock.currentTime, 0),
                type: type,
            }, coordinates), extractFile(file));

        } else if (type == "application/x-igc") {
            promise = Track.load(file.name);

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
            warning("Drag and drop a track, video or image to add");
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
        changePilot(state.pilot.next);
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
            qualifyFile(files[i]);
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
                qualifyFile(file);
                await Track.load(file.name);
            }
        }

        /* Load all the images and videos */
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const type = guessMimeType(file.name, file.type);

            if (type.startsWith("image/") || type.startsWith("video/")) {
                qualifyFile(file);
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

if (location.hash)
    qualifyBase("/media/" + location.hash.substr(1));

/* Load the folder described by the #bookmark in URI */
load();
