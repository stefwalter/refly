const viewer = new Cesium.Viewer('cesiumContainer', {
    terrain: Cesium.Terrain.fromWorldTerrain(),
});

const state = {
    flights: []
};

/*
 * All colors available
 * https://htmlcolorcodes.com/color-chart/
 */
const colors = [
    "#F1C40F", "#E67E22", "#2ecc71", "#27AE60", "#16A085", "#1ABC9C",
    "#3498DB", "#8E44AD", "#9B59B6", "#E74C3C", "#C0392B", "#F39C12", "#D35400",
];

/* A mapping of all pilots to their colors */
const pilots = {

};

async function loadFlight(filename) {

    // TODO: Escape properly
    // TODO: Hnadle errors
    const response = await fetch("./flight/" + filename);
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
         * Example code for tracing the entire track
         *
         * const point = viewer.entities.add({
         *   description: `Location: (${fix.longitude}, ${fix.latitude}, ${altitude})`,
         *   position: position,
         *   point: { pixelSize: 10, color: Cesium.Color.RED }
         *});
         */

        startTime = startTime || time;
        endTime = time;
    }

    /* Update the remaining average position of the camera */
    while (cameraStack.length > 0)
        updateCamera(true);

    /* Each pilot gets a color, and keep them unique based on pilot string*/
    const pilot = igcData.pilot;
    const color = pilots[pilot] || new Cesium.Color(0, 0, 0);
    if (!pilots[pilot]) {
        Cesium.Color.fromCssColorString(colors.pop(), color);
        pilots[pilot] = color;
    }

    // Load the glTF model from Cesium ion.
    const paragliderUri = await Cesium.IonResource.fromAssetId(2944256);
    const paraglider = viewer.entities.add({
        availability: new Cesium.TimeIntervalCollection([ new Cesium.TimeInterval({
            start: startTime,
            stop: endTime
        }) ]),
        position: trackerPositions,
        // Attach the 3D model instead of the green point.
        model: { uri: paragliderUri },
        // Automatically compute the orientation from the position.
        orientation: new Cesium.VelocityOrientationProperty(trackerPositions),
        path: new Cesium.PathGraphics({
            width: 1,
            leadTime: 0,
            material: new Cesium.ColorMaterialProperty(color)
        })
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
        viewFrom: new Cesium.Cartesian3(50, -500, 1000),
        parent: paraglider,

        /*
         * Change pixelSize above to > 0 to visualize camera position
         * path: new Cesium.PathGraphics( { width: 3 })
         */
    });

    const flight = {
        name: filename,
        pilot: pilot,
        paraglider: paraglider,
        camera: camera,
        start: startTime,
        stop: endTime,
    };

    /* Used for finding our flight based on the entity */
    paraglider.flight = flight;
    camera.flight = flight;

    return flight;
}

async function load() {
    const response = await fetch("./metadata.json");
    const metadata = await response.json();

    let start = null;
    let stop = null;

    for (let i = 0; i < metadata.flights.length; i++) {
        const flight = await loadFlight(metadata.flights[i]);

        /* Linked list between flights */
        flight.next = state.flights[0] || flight;
        flight.prev = flight.next.prev || flight;
        state.flights.push(flight);
        flight.prev.next = flight;
        flight.next.prev = flight;

        /* Expand the timeframe to include this flight */
        if (!start || Cesium.JulianDate.lessThan(flight.start, start))
            start = flight.start;
        if (!stop || Cesium.JulianDate.greaterThan(flight.stop, stop))
            stop = flight.stop;
    }

    /* Set up the timeline and camera */
    if (start && stop) {
        viewer.clock.startTime = start.clone();
        viewer.clock.stopTime = stop.clone();
        viewer.clock.currentTime = start.clone();
        viewer.timeline.zoomTo(start, stop);
        viewer.trackedEntity = state.flights[0].camera;
        viewer.clock.multiplier = 50;
        viewer.clock.shouldAnimate = true;
        viewer.clock.clockRange = Cesium.ClockRange.CLAMPED;
    }
}

function findAvailableFlight(start, direction) {
    let check = start;
    do {
        check = check[direction];
        if (check.camera.isAvailable(viewer.clock.currentTime))
            break;
    } while (check != start);
    return check;
}

function changeTracking(old, flight) {
    const position = viewer.camera.position.clone();
    viewer.trackedEntity = flight.camera;
    viewer.camera.position = position;
    flight.camera.viewFrom = position;
    console.log("Tracking", old.name, "->", flight.name, position);
}

function initialize()
{
    // TODO: Fix Alt-Tab behavior, where we switch cameras when switching windows
    window.addEventListener("keyup", function(e) {
        if (e.keyCode == 9) {
            const old = viewer.trackedEntity.flight;
            if (old) {
                const flight = findAvailableFlight(old, e.shiftKey ? "prev" : "next");
                if (flight) {
                    changeTracking(old, flight);
                    e.preventDefault();
                    return true;
                }
            }
        }
    }, true);
}

initialize();
load();
