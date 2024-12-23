
const viewer = new Cesium.Viewer('cesiumContainer', {
    terrain: Cesium.Terrain.fromWorldTerrain(),
});

const osmBuildings = await Cesium.createOsmBuildingsAsync();
viewer.scene.primitives.add(osmBuildings);

async function loadData(filename) {

    // TODO: Escape properly
    // TODO: Hnadle errors
    const response = await fetch("./route/" + filename);
    const igcData = await response.json();

    let startTime = null;
    let endTime = null;

    // The SampledPositionedProperty stores the position/timestamp for each sample along the radar sample series.
    const trackerPositions = new Cesium.SampledPositionProperty();
    const cameraPositions = new Cesium.SampledPositionProperty();
    const cameraCartesian = new Cesium.Cartesian3(0, 0, 0);
    const cameraStack = new Array();

    const JULIAN_TO_UNIX = 2440588; /* Days from Julian Epoch to Unix Epoch */
    const CAMERA_WINDOW = 128;

    function updateCamera(drain) {
        if (drain || cameraStack.length >= CAMERA_WINDOW) {
            const bottom = cameraStack.shift();
            Cesium.Cartesian3.subtract(cameraCartesian, bottom.position, cameraCartesian);
        }

        if ((drain && cameraStack.length) || cameraStack.length > CAMERA_WINDOW / 2) {
            const average = new Cesium.Cartesian3(0, 0, 0);
            Cesium.Cartesian3.divideByScalar(cameraCartesian, cameraStack.length, average);

            const index = Math.max(0, cameraStack.length - CAMERA_WINDOW / 2);
            cameraPositions.addSample(cameraStack[index].time, average);
        }
    }

    // Create a point for each.
    for (let i = 0; i < igcData.fixes.length; i++) {
        const fix = igcData.fixes[i];

        // const altitude = (fix.gpsAltitude + fix.pressureAltitude) / 2;
        const unix = Math.floor(fix.timestamp / 1000);
        const time = new Cesium.JulianDate(JULIAN_TO_UNIX + unix / 86400, unix % 86400);
        const altitude = fix.gpsAltitude - 70;
        const position = Cesium.Cartesian3.fromDegrees(fix.longitude, fix.latitude, altitude);

        trackerPositions.addSample(time, position);

        cameraStack.push({ position: position, time: time });
        Cesium.Cartesian3.add(cameraCartesian, position, cameraCartesian);
        updateCamera();

        /*
        const point = viewer.entities.add({
            description: `Location: (${fix.longitude}, ${fix.latitude}, ${altitude})`,
            position: position,
            point: { pixelSize: 10, color: Cesium.Color.RED }
        });
        */

        if (!startTime) {
            startTime = time;
        }

        endTime = time;
    }

    while (cameraStack.length > 0)
        updateCamera(true);

    // Load the glTF model from Cesium ion.
    const paragliderUri = await Cesium.IonResource.fromAssetId(2944256);
    viewer.entities.add({
        availability: new Cesium.TimeIntervalCollection([ new Cesium.TimeInterval({
            start: startTime,
            stop: endTime
        }) ]),
        position: trackerPositions,
        // Attach the 3D model instead of the green point.
        model: { uri: paragliderUri },
        // Automatically compute the orientation from the position.
        orientation: new Cesium.VelocityOrientationProperty(trackerPositions),
        path: new Cesium.PathGraphics({ width: 1, leadTime: 0 })
    });
/*
    // Create an entity to both visualize the sample series with a line and create a tracker
    viewer.entities.add({
        availability: new Cesium.TimeIntervalCollection([ new Cesium.TimeInterval({
            start: startTime,
            stop: endTime
        }) ]),
        position: trackerPositions,
        point: { pixelSize: 30, color: Cesium.Color.GREEN },
        path: new Cesium.PathGraphics( { width: 3 })
    });
*/
    const camera = viewer.entities.add({
        availability: new Cesium.TimeIntervalCollection([ new Cesium.TimeInterval({
            start: startTime,
            stop: endTime
        }) ]),
        position: cameraPositions,
        point: { pixelSize: 0, color: Cesium.Color.BLUE },
        // path: new Cesium.PathGraphics( { width: 3 })
    });

    viewer.clock.startTime = startTime.clone();
    viewer.clock.stopTime = endTime.clone();
    viewer.clock.currentTime = startTime.clone();
    viewer.timeline.zoomTo(startTime, endTime);

    // Fly the camera to this point.
    await viewer.camera.zoomOut(1000000);
    viewer.trackedEntity = camera;
    viewer.clock.multiplier = 50;
    viewer.clock.shouldAnimate = true;
}

await loadData("DHV-XC-2024-10-21-SWA-Billing_-_Bir-1958965.igc");

