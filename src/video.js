import {
    extractDuration,
    extractMetadata,
} from './extract.js';

import {
    Pilot,
} from './pilot.js';

import {
    spinner,
} from './spinner.js';

import {
    allIntervals,
} from './timeline.js';

import {
    assert,
    guessMimeType,
    qualifiedUrl,
    parseDuration,
    parseTimestamp,
    warning,
} from './util.js';

import {
    viewer,
} from './viewer.js';

import {
    Cartesian3,
    JulianDate,
    Math as CMath,
    TimeInterval,
} from 'cesium';

/* Default duration of new images */
const DEFAULT_DURATION = 5;

/* The graphic for the play button */
export const PLAY_BUTTON = 'data:image/svg+xml;utf8,<svg width="32" height="32" version="1.1" viewBox="0 0 2.4 2.4" xml:space="preserve" xmlns="http://www.w3.org/2000/svg"><path d="m1.2 0c-0.66168 0-1.2 0.53832-1.2 1.2s0.53832 1.2 1.2 1.2 1.2-0.53832 1.2-1.2-0.53832-1.2-1.2-1.2zm-0.42618 0.56016c0.00923 4.05e-4 0.018423 0.002725 0.026367 0.006885l1.1047 0.6c0.014127 0.00744 0.022559 0.019719 0.022559 0.032959s-0.00843 0.025666-0.022559 0.033106l-1.1047 0.6c-0.00875 0.0046-0.018954 0.00688-0.02915 0.00688-0.00828 0-0.01661-0.00142-0.02417-0.00454-0.016976-0.0069168-0.027539-0.020606-0.027539-0.035446v-1.2c0-0.01484 0.010615-0.028383 0.027539-0.035303 0.00849-0.00346 0.017721-0.004946 0.026953-0.004541z" stroke-width="0" fill="black"/></svg>';

export class Video {
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

            const pilot = Pilot.ensure(metadata["person"] || "");

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
                    position = Cartesian3.fromDegrees(longitude, latitude, altitude);
                }
            }

            /* Otherwise find a track that overlaps this video's start */
            if (!position) {
                const track = pilot.tracks.findDataForIntervalContainingDate(start);
                if (track)
                    position = track.paraglider.position.getValue(start);
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
            JulianDate.addSeconds(start, duration * that.rate, stop);

            const interval = new TimeInterval({
                start: start,
                stop: stop,
                isStopIncluded: false,
                data: that,
            });

            interval.data = that;
            that.interval = interval;

            /* We assume the extracted metadata is an update of our videoData */
            that.videoData = metadata;

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
            extractMetadata(isImage ? source : that.element, videoData),
            extractDuration(isImage ? source : that.element, videoData),
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

        viewer.timeline.zoomTo(allIntervals.start, allIntervals.stop);
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

            const at = JulianDate.secondsDifference(clock.currentTime, interval.start) / that.rate;
            if (!CMath.equalsEpsilon(at, element.currentTime, CMath.EPSILON1, 1)) {
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
