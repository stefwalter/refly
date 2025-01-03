import { expect, test } from 'vitest';
import { knockout } from 'cesium';

import {
    DisplayOptions,
    DisplayToggleButton,
    HighResolutionButton,
    PROVIDER_IDS,
    SkipGapsButton,
} from './displayoptions';

/* Make sure we don't mkae Bing requests during testing */
PROVIDER_IDS["bing"] = PROVIDER_IDS["sentinel"];

test('DisplayOptions', function() {
    const options = new DisplayOptions();
    expect(options.skipGaps).toBe(false);

    let value = null;
    knockout.getObservable(options, 'skipGaps').subscribe((val) => value = val);
    options.skipGaps = true;
    expect(value).toBe(true);
});

test('DisplayToggleButton', function() {
    const container = document.createElement("div");
    container.setAttribute("id", "button-container");
    document.body.appendChild(container);

    const options = new DisplayOptions();

    const button = new DisplayToggleButton("button-container", {
        viewModel: options,
        field: "skipGaps",
        innerHTML: "Skip Gaps"
    });
    expect(button.container).toBe(container);
    expect(button.element).toBe(container.firstChild);
    expect(button.viewModel).toBe(options);

    expect(button.element.classList.contains("toggled")).toBe(false);
    button.element.click();
    expect(options.skipGaps).toBe(true);
    expect(button.element.classList.contains("toggled")).toBe(true);

    options.skipGaps = false;
    expect(button.element.classList.contains("toggled")).toBe(false);
});

test('DisplayToggleButton.destroy', function() {
    const container = document.createElement("div");
    container.setAttribute("id", "button-destroy");
    document.body.appendChild(container);

    const options = new DisplayOptions();

    const button = new DisplayToggleButton("button-destroy", {
        viewModel: options,
        field: "skipGaps",
        innerHTML: "Destroy"
    });
    expect(button.container).toBe(container);

    const element = button.element;
    expect(element.parentNode).toBe(container);

    element.click();
    expect(options.skipGaps).toBe(true);
    element.click();
    expect(options.skipGaps).toBe(false);

    expect(button.isDestroyed()).toBe(false);
    button.destroy();
    expect(button.isDestroyed()).toBe(true);

    expect(element.parentNode).toBe(null);
    element.click();
    expect(options.skipGaps).toBe(false); /* Does not change */
});

test('SkipGapsButton', function() {
    const container = document.createElement("div");
    document.body.appendChild(container);

    const options = new DisplayOptions();
    const button = new SkipGapsButton(container, { viewModel: options });
    expect(button.container).toBe(container);
    expect(button.viewModel).toBe(options);
    expect(button.viewModel.skipGaps).toBe(false);

    button.element.click();
    expect(button.viewModel.skipGaps).toBe(true);
});

test('SkipGapsButton.optional', function() {
    const container = document.createElement("div");
    document.body.appendChild(container);

    const button = new SkipGapsButton(container);
    expect(button.container).toBe(container);
    expect(button.viewModel).toBeInstanceOf(DisplayOptions);
    expect(button.viewModel.skipGaps).toBe(false);

    button.element.click();
    expect(button.viewModel.skipGaps).toBe(true);
});

test('HighResolutionButton', function() {
    const container = document.createElement("div");
    document.body.appendChild(container);

    const options = new DisplayOptions();
    const button = new HighResolutionButton(container, { viewModel: options });

    expect(button.container).toBe(container);
    expect(button.viewModel).toBe(options);
    expect(button.viewModel.highResolution).toBe(false);

    button.element.click();
    expect(button.viewModel.highResolution).toBe(true);
    button.element.click();
    expect(button.viewModel.highResolution).toBe(false);

    let value = null;
    knockout.getObservable(button.viewModel, 'highResolution').subscribe((val) => value = val);
    button.viewModel.highResolution = true;
    expect(value).toBe(true);
});



test('HighResolutionButton.optional', function() {
    const container = document.createElement("div");
    document.body.appendChild(container);

    const button = new HighResolutionButton(container);
    expect(button.container).toBe(container);
    expect(button.viewModel).toBeInstanceOf(DisplayOptions);
    expect(button.viewModel.highResolution).toBe(false);

    button.element.click();
    expect(button.viewModel.highResolution).toBe(true);
    button.element.click();
    expect(button.viewModel.highResolution).toBe(false);

    let value = null;
    knockout.getObservable(button.viewModel, 'highResolution').subscribe((val) => value = val);
    button.viewModel.highResolution = true;
    expect(value).toBe(true);
});


