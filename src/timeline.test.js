import {
    afterEach,
    beforeEach,
    expect,
    test,
} from 'vitest';

import {
    allIntervals,
    jump,
} from './timeline.js';

import {
    Video,
} from './video.js';

import {
    createViewer,
    destroyViewer,
} from './viewer.js';

import {
    qualifyBase,
    qualifiedUrl,
} from './util.js';

import {
    ClockRange,
    JulianDate,
} from 'cesium';

beforeEach(async (context) => {
    context.container = document.createElement('div');
    document.body.appendChild(context.container);
    createViewer(context.container, true);
});

afterEach(async (context) => {
    destroyViewer();
    document.body.removeChild(context.container);
    context.container = null;
});

async function loadTimeline(json) {
    qualifyBase("/fixtures");

    const response = await fetch(qualifiedUrl(json));
    expect(response.ok).toBeTruthy();

    const timeline = await response.json();
    expect(timeline).toHaveProperty("videos");

    // TODO: Perhaps export loaded() and that functionality?
    for (let i = 0; i < timeline.videos.length; i++) {
        const video = await Video.load(timeline.videos[i]);
        allIntervals.addInterval(video.interval);
        // console.log(video.videoData);
    }

    viewer.clock.startTime = allIntervals.start.clone();
    viewer.clock.stopTime = allIntervals.stop.clone();
    viewer.clock.currentTime = allIntervals.start.clone();
    viewer.clock.clockRange = ClockRange.CLAMPED;
    viewer.timeline.zoomTo(allIntervals.start, allIntervals.stop);
}

test('Jump basic', async function() {
    await loadTimeline("timeline.json");

    expect(JulianDate.toIso8601(viewer.clock.startTime)).equals("2024-10-03T05:46:14Z");
    expect(JulianDate.toIso8601(viewer.clock.currentTime)).equals("2024-10-03T05:46:14Z");
    expect(JulianDate.toIso8601(viewer.clock.stopTime)).equals("2025-01-27T04:32:03.7073999999993248Z");
    viewer.clock.multiplier = 6;

    /* Normal jump forward. Should now be at 60 seconds after start */
    jump();
    expect(JulianDate.toIso8601(viewer.clock.currentTime)).equals("2024-10-03T05:47:14Z");

    /* Normal jump forward. Should now be at 120 seconds after start */
    jump();
    expect(JulianDate.toIso8601(viewer.clock.currentTime)).equals("2024-10-03T05:48:14Z");

    /* Small jump forward. Should now be at 130 seconds after start */
    jump(jump.SMALL);
    expect(JulianDate.toIso8601(viewer.clock.currentTime)).equals("2024-10-03T05:48:24Z");

    /* Normal jump backward. Should now be at 70 seconds after start */
    jump(jump.REVERSE);
    expect(JulianDate.toIso8601(viewer.clock.currentTime)).equals("2024-10-03T05:47:24Z");

    /* Normal jump backward. Should now be at 10 seconds after start */
    jump(jump.REVERSE);
    expect(JulianDate.toIso8601(viewer.clock.currentTime)).equals("2024-10-03T05:46:24Z");

    /* Normal jump backward. Should now be at start */
    jump(jump.REVERSE);
    expect(JulianDate.toIso8601(viewer.clock.currentTime)).equals("2024-10-03T05:46:14Z");

    /* Small jump backward. Should now be at 0 seconds after start */
    jump(jump.REVERSE | jump.SMALL);
    expect(viewer.clock.currentTime).toStrictEqual(viewer.clock.startTime);

    /* End of timeline */
    viewer.clock.currentTime = viewer.clock.stopTime.clone();

    /* Small jump backwards */
    jump(jump.REVERSE | jump.SMALL);
    expect(JulianDate.toIso8601(viewer.clock.currentTime)).equals("2025-01-27T04:31:53.7073999999993248Z");

    /* Jump forward past end, should clamp to end */
    jump();
    expect(viewer.clock.currentTime).toStrictEqual(viewer.clock.stopTime);
});

test('Edge jump forward', async function() {
    await loadTimeline("timeline.json");

    expect(JulianDate.toIso8601(viewer.clock.startTime)).equals("2024-10-03T05:46:14Z");
    expect(JulianDate.toIso8601(viewer.clock.currentTime)).equals("2024-10-03T05:46:14Z");
    expect(JulianDate.toIso8601(viewer.clock.stopTime)).equals("2025-01-27T04:32:03.7073999999993248Z");

    /* Jump into the middle of iphone.MP4 */
    jump(jump.SMALL);
    expect(JulianDate.toIso8601(viewer.clock.currentTime)).equals("2024-10-03T05:46:24Z");

    /* Should now be at the end of iphone.MP4, which is about 13 seconds long */
    jump(jump.EDGE);
    expect(JulianDate.toIso8601(viewer.clock.currentTime)).equals("2024-10-03T05:46:27.8683333333319752Z");

    /* Should now be at the start of the iphone.JPEG */
    jump(jump.EDGE);
    expect(JulianDate.toIso8601(viewer.clock.currentTime)).equals("2024-10-06T05:21:58Z");

    /* Should now be at the end of the iphone.JPEG, which has a default duration of 5 seconds */
    jump(jump.EDGE);
    expect(JulianDate.toIso8601(viewer.clock.currentTime)).equals("2024-10-06T05:22:03Z");

    /* Should now be at the start of the iphone.MOV */
    jump(jump.EDGE);
    expect(JulianDate.toIso8601(viewer.clock.currentTime)).equals("2024-10-08T09:22:09Z");

    /* Should now be at the end of the iphone.MOV which has a duration of about 2 seconds */
    jump(jump.EDGE);
    expect(JulianDate.toIso8601(viewer.clock.currentTime)).equals("2024-10-08T09:22:11.4333333333343035Z");

    /* Should now be at the start of pixel.MP4 */
    jump(jump.EDGE);
    expect(JulianDate.toIso8601(viewer.clock.currentTime)).equals("2025-01-27T04:32:02Z");

    /* Should now be at the end of pixel.MP4 which has a duration of almost 2 seconds */
    jump(jump.EDGE);
    expect(JulianDate.toIso8601(viewer.clock.currentTime)).equals("2025-01-27T04:32:03.7073999999993248Z");

    /* End of the timeline, should still be at the same mark */
    jump(jump.EDGE);
    expect(JulianDate.toIso8601(viewer.clock.currentTime)).equals("2025-01-27T04:32:03.7073999999993248Z");

    /* End of the timeline, should still be at the same mark */
    jump(jump.EDGE);
    expect(JulianDate.toIso8601(viewer.clock.currentTime)).equals("2025-01-27T04:32:03.7073999999993248Z");
});

test('Edge jump forward collapse', async function() {
    await loadTimeline("timeline.json");

    expect(JulianDate.toIso8601(viewer.clock.startTime)).equals("2024-10-03T05:46:14Z");
    expect(JulianDate.toIso8601(viewer.clock.currentTime)).equals("2024-10-03T05:46:14Z");
    expect(JulianDate.toIso8601(viewer.clock.stopTime)).equals("2025-01-27T04:32:03.7073999999993248Z");

    /* Jump into the middle of iphone.MP4 */
    jump(jump.SMALL | jump.COLLAPSE);
    expect(JulianDate.toIso8601(viewer.clock.currentTime)).equals("2024-10-03T05:46:24Z");

    /* Should now be at the end of iphone.MP4, which is about 13 seconds long */
    jump(jump.EDGE | jump.COLLAPSE);
    expect(JulianDate.toIso8601(viewer.clock.currentTime)).equals("2024-10-03T05:46:27.8683333333319752Z");

    /* Should now be at the end of the iphone.JPEG (since the time between is collapsed) */
    jump(jump.EDGE | jump.COLLAPSE);
    expect(JulianDate.toIso8601(viewer.clock.currentTime)).equals("2024-10-06T05:22:03Z");

    /* Should now be at the end of the iphone.MOV (since the time beween is collapsed) */
    jump(jump.EDGE | jump.COLLAPSE);
    expect(JulianDate.toIso8601(viewer.clock.currentTime)).equals("2024-10-08T09:22:11.4333333333343035Z");

    /* Should now be at the end of pixel.MP4 (since the time between is collapsed) */
    jump(jump.EDGE | jump.COLLAPSE);
    expect(JulianDate.toIso8601(viewer.clock.currentTime)).equals("2025-01-27T04:32:03.7073999999993248Z");

    /* End of the timeline, should still be at the same mark */
    jump(jump.EDGE | jump.COLLAPSE);
    expect(JulianDate.toIso8601(viewer.clock.currentTime)).equals("2025-01-27T04:32:03.7073999999993248Z");

    /* End of the timeline, should still be at the same mark */
    jump(jump.EDGE | jump.COLLAPSE);
    expect(JulianDate.toIso8601(viewer.clock.currentTime)).equals("2025-01-27T04:32:03.7073999999993248Z");
});

test('Edge jump backward', async function() {
    await loadTimeline("timeline.json");

    expect(JulianDate.toIso8601(viewer.clock.startTime)).equals("2024-10-03T05:46:14Z");
    expect(JulianDate.toIso8601(viewer.clock.stopTime)).equals("2025-01-27T04:32:03.7073999999993248Z");
    viewer.clock.currentTime = viewer.clock.stopTime.clone();

    /* End of the timeline, should still be at the same mark */
    expect(JulianDate.toIso8601(viewer.clock.currentTime)).equals("2025-01-27T04:32:03.7073999999993248Z");

    /* Should now be at the start of pixel.MP4 */
    jump(jump.REVERSE | jump.EDGE);
    expect(JulianDate.toIso8601(viewer.clock.currentTime)).equals("2025-01-27T04:32:02Z");

    /* Should now be at the end of the iphone.MOV which has a duration of about 2 seconds */
    jump(jump.REVERSE | jump.EDGE);
    expect(JulianDate.toIso8601(viewer.clock.currentTime)).equals("2024-10-08T09:22:11.4333333333343035Z");

    /* Should now be at the start of the iphone.MOV */
    jump(jump.REVERSE | jump.EDGE);
    expect(JulianDate.toIso8601(viewer.clock.currentTime)).equals("2024-10-08T09:22:09Z");

    /* Should now be at the end of the iphone.JPEG, which has a default duration of 5 seconds */
    jump(jump.REVERSE | jump.EDGE);
    expect(JulianDate.toIso8601(viewer.clock.currentTime)).equals("2024-10-06T05:22:03Z");

    /* Jump into the middle of iphone.JPEG */
    viewer.clock.multiplier = 0.3;
    jump(jump.REVERSE);
    expect(JulianDate.toIso8601(viewer.clock.currentTime)).equals("2024-10-06T05:22:00Z");

    /* Should now be at the start of the iphone.JPEG */
    jump(jump.REVERSE | jump.EDGE);
    expect(JulianDate.toIso8601(viewer.clock.currentTime)).equals("2024-10-06T05:21:58Z");

    /* Should now be at the end of iphone.MP4, which is about 13 seconds long */
    jump(jump.REVERSE | jump.EDGE);
    expect(JulianDate.toIso8601(viewer.clock.currentTime)).equals("2024-10-03T05:46:27.8683333333319752Z");

    /* Should now be at the start of iphone.MP4 */
    jump(jump.REVERSE | jump.EDGE);
    expect(JulianDate.toIso8601(viewer.clock.currentTime)).equals("2024-10-03T05:46:14Z");

    /* Should still be at the beginning */
    jump(jump.REVERSE | jump.EDGE);
    expect(JulianDate.toIso8601(viewer.clock.currentTime)).equals("2024-10-03T05:46:14Z");

    /* Should still be at the beginning */
    jump(jump.REVERSE | jump.EDGE);
    expect(JulianDate.toIso8601(viewer.clock.currentTime)).equals("2024-10-03T05:46:14Z");
});

test('Edge jump backward collapse', async function() {
    await loadTimeline("timeline.json");

    expect(JulianDate.toIso8601(viewer.clock.startTime)).equals("2024-10-03T05:46:14Z");
    expect(JulianDate.toIso8601(viewer.clock.stopTime)).equals("2025-01-27T04:32:03.7073999999993248Z");
    viewer.clock.currentTime = viewer.clock.stopTime.clone();

    /* End of the timeline, should still be at the same mark */
    expect(JulianDate.toIso8601(viewer.clock.currentTime)).equals("2025-01-27T04:32:03.7073999999993248Z");

    /* Should now be at the start of pixel.MP4 */
    jump(jump.REVERSE | jump.EDGE | jump.COLLAPSE);
    expect(JulianDate.toIso8601(viewer.clock.currentTime)).equals("2025-01-27T04:32:02Z");

    /* Should now be at the start of the iphone.MOV (since time between collapsed) */
    jump(jump.REVERSE | jump.EDGE | jump.COLLAPSE);
    expect(JulianDate.toIso8601(viewer.clock.currentTime)).equals("2024-10-08T09:22:09Z");

    /* Should now be at the end of the iphone.JPEG, which has a default duration of 5 seconds */
    jump(jump.REVERSE | jump.EDGE);
    expect(JulianDate.toIso8601(viewer.clock.currentTime)).equals("2024-10-06T05:22:03Z");

    /* Jump into the middle of iphone.JPEG */
    viewer.clock.multiplier = 0.3;
    jump(jump.REVERSE);
    expect(JulianDate.toIso8601(viewer.clock.currentTime)).equals("2024-10-06T05:22:00Z");

    /* Should now be at the start of the iphone.JPEG */
    jump(jump.REVERSE | jump.EDGE | jump.COLLAPSE);
    expect(JulianDate.toIso8601(viewer.clock.currentTime)).equals("2024-10-06T05:21:58Z");

    /* Should now be at the start of iphone.MP4 (since time between is collapsed) */
    jump(jump.REVERSE | jump.EDGE | jump.COLLAPSE);
    expect(JulianDate.toIso8601(viewer.clock.currentTime)).equals("2024-10-03T05:46:14Z");

    /* Should still be at the beginning */
    jump(jump.REVERSE | jump.EDGE | jump.COLLAPSE);
    expect(JulianDate.toIso8601(viewer.clock.currentTime)).equals("2024-10-03T05:46:14Z");

    /* Should still be at the beginning */
    jump(jump.REVERSE | jump.EDGE | jump.COLLAPSE);
    expect(JulianDate.toIso8601(viewer.clock.currentTime)).equals("2024-10-03T05:46:14Z");
});

test('Edge jump forward epsilon', async function() {
    await loadTimeline("timeline.json");
    viewer.clock.multiplier = 0.1;

    expect(JulianDate.toIso8601(viewer.clock.startTime)).equals("2024-10-03T05:46:14Z");
    expect(JulianDate.toIso8601(viewer.clock.stopTime)).equals("2025-01-27T04:32:03.7073999999993248Z");

    /* Jump to end of second video */
    jump(jump.EDGE);
    jump(jump.EDGE);
    jump(jump.EDGE);
    expect(JulianDate.toIso8601(viewer.clock.currentTime)).equals("2024-10-06T05:22:03Z");

    /* Jump one second back in */
    jump(jump.REVERSE);
    expect(JulianDate.toIso8601(viewer.clock.currentTime)).equals("2024-10-06T05:22:02Z");

    /* Now do an edge jump forward, we should end up at third */
    jump(jump.EDGE);
    expect(JulianDate.toIso8601(viewer.clock.currentTime)).equals("2024-10-08T09:22:09Z");

    /* Jump one second back */
    jump(jump.REVERSE);
    expect(JulianDate.toIso8601(viewer.clock.currentTime)).equals("2024-10-08T09:22:08Z");

    /* Now do an edge jump forward, we should end up at end of third */
    jump(jump.EDGE);
    expect(JulianDate.toIso8601(viewer.clock.currentTime)).equals("2024-10-08T09:22:11.4333333333343035Z");
});

test('Edge collapse forward epsilon', async function() {
    await loadTimeline("timeline.json");
    viewer.clock.multiplier = 0.1;

    expect(JulianDate.toIso8601(viewer.clock.startTime)).equals("2024-10-03T05:46:14Z");
    expect(JulianDate.toIso8601(viewer.clock.stopTime)).equals("2025-01-27T04:32:03.7073999999993248Z");

    /* Jump to end of second video */
    jump(jump.EDGE | jump.COLLAPSE);
    jump(jump.EDGE | jump.COLLAPSE);
    expect(JulianDate.toIso8601(viewer.clock.currentTime)).equals("2024-10-06T05:22:03Z");

    /* Jump one second back in */
    jump(jump.REVERSE | jump.COLLAPSE);
    expect(JulianDate.toIso8601(viewer.clock.currentTime)).equals("2024-10-06T05:22:02Z");

    /* Now do an edge jump forward, we should end up at end of third */
    jump(jump.EDGE | jump.COLLAPSE);
    expect(JulianDate.toIso8601(viewer.clock.currentTime)).equals("2024-10-08T09:22:11.4333333333343035Z");
});

test('Edge jump backward epsilon', async function() {
    await loadTimeline("timeline.json");
    viewer.clock.multiplier = 0.1;

    expect(JulianDate.toIso8601(viewer.clock.startTime)).equals("2024-10-03T05:46:14Z");
    expect(JulianDate.toIso8601(viewer.clock.stopTime)).equals("2025-01-27T04:32:03.7073999999993248Z");

    /* Jump to start of third video */
    jump(jump.EDGE);
    jump(jump.EDGE);
    jump(jump.EDGE);
    jump(jump.EDGE);
    expect(JulianDate.toIso8601(viewer.clock.currentTime)).equals("2024-10-08T09:22:09Z");

    /* Jump one second in */
    jump();
    expect(JulianDate.toIso8601(viewer.clock.currentTime)).equals("2024-10-08T09:22:10Z");

    /* Now do an edge jump backwards, we should end up at end of previous */
    jump(jump.REVERSE | jump.EDGE);
    expect(JulianDate.toIso8601(viewer.clock.currentTime)).equals("2024-10-06T05:22:03Z");

    /* Jump one second past */
    jump();
    expect(JulianDate.toIso8601(viewer.clock.currentTime)).equals("2024-10-06T05:22:04Z");

    /* Now do an edge jump backwards, we should end up at start */
    jump(jump.REVERSE | jump.EDGE);
    expect(JulianDate.toIso8601(viewer.clock.currentTime)).equals("2024-10-06T05:21:58Z");
});

test('Edge collapse backward epsilon', async function() {
    await loadTimeline("timeline.json");
    viewer.clock.multiplier = 0.1;

    expect(JulianDate.toIso8601(viewer.clock.startTime)).equals("2024-10-03T05:46:14Z");
    expect(JulianDate.toIso8601(viewer.clock.stopTime)).equals("2025-01-27T04:32:03.7073999999993248Z");

    /* Jump to start of third video */
    jump(jump.EDGE);
    jump(jump.EDGE);
    jump(jump.EDGE);
    expect(JulianDate.toIso8601(viewer.clock.currentTime)).equals("2024-10-06T05:22:03Z");

    /* Jump one second in */
    jump();
    expect(JulianDate.toIso8601(viewer.clock.currentTime)).equals("2024-10-06T05:22:04Z");

    /* Now do an edge jump backwards, we should end up at start of previous */
    jump(jump.REVERSE | jump.EDGE | jump.COLLAPSE);
    expect(JulianDate.toIso8601(viewer.clock.currentTime)).equals("2024-10-06T05:21:58Z");
});

test('Edge jump before/after', async function() {
    await loadTimeline("timeline.json");

    /* Expand the timeline more than just the content */
    JulianDate.addSeconds(viewer.clock.startTime, -10, viewer.clock.startTime);
    JulianDate.addSeconds(viewer.clock.stopTime, 10, viewer.clock.stopTime);

    expect(JulianDate.toIso8601(viewer.clock.startTime)).equals("2024-10-03T05:46:04Z");
    expect(JulianDate.toIso8601(viewer.clock.stopTime)).equals("2025-01-27T04:32:13.7073999999993248Z");

    /* Jump a second before the first video */
    viewer.clock.multiplier = 0.1;
    jump(jump.REVERSE);
    expect(JulianDate.toIso8601(viewer.clock.currentTime)).equals("2024-10-03T05:46:13Z");

    /* Now edge jump backwards, should get to beginning of timeline */
    jump(jump.REVERSE | jump.EDGE);
    expect(viewer.clock.currentTime).toStrictEqual(viewer.clock.startTime);
});
