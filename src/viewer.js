
import {
    ArcGisMapServerImageryProvider,
    ImageryLayer,
    Terrain,
    Viewer,
} from 'cesium';

export const viewer = window.viewer = new Viewer('cesiumContainer', {
    terrain: Terrain.fromWorldTerrain(),
    // TODO: Figure out why this works
    baseLayer: ImageryLayer.fromProviderAsync( ArcGisMapServerImageryProvider.fromUrl('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer', { })),
    // baseLayer: state.imageProvider,
    selectionIndicator: false,
    geocoder: false,
    scene3DOnly: true,
    projectionPicker: false,
    baseLayerPicker: false,
});
