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
    expect(options.collapse).toBe(true);

    let value = null;
    knockout.getObservable(options, 'collapse').subscribe((val) => value = val);
    options.collapse = false;
    expect(value).toBe(false);
});

test('DisplayToggleButton', function() {
    const container = document.createElement("div");
    container.setAttribute("id", "button-container");
    document.body.appendChild(container);

    const options = new DisplayOptions();

    const button = new DisplayToggleButton("button-container", {
        viewModel: options,
        field: "collapse",
        innerHTML: "Collapse gaps in timeline"
    });
    expect(button.container).toBe(container);
    expect(button.element).toBe(container.firstChild);
    expect(button.viewModel).toBe(options);

    expect(button.element.classList.contains("toggled")).toBe(true);
    button.element.click();
    expect(options.collapse).toBe(false);
    expect(button.element.classList.contains("toggled")).toBe(false);

    options.collapse = true;
    expect(button.element.classList.contains("toggled")).toBe(true);
});

test('DisplayToggleButton.destroy', function() {
    const container = document.createElement("div");
    container.setAttribute("id", "button-destroy");
    document.body.appendChild(container);

    const options = new DisplayOptions();

    const button = new DisplayToggleButton("button-destroy", {
        viewModel: options,
        field: "collapse",
        innerHTML: "Destroy"
    });
    expect(button.container).toBe(container);

    const element = button.element;
    expect(element.parentNode).toBe(container);

    element.click();
    expect(options.collapse).toBe(false);
    element.click();
    expect(options.collapse).toBe(true);

    expect(button.isDestroyed()).toBe(false);
    button.destroy();
    expect(button.isDestroyed()).toBe(true);

    expect(element.parentNode).toBe(null);
    element.click();
    expect(options.collapse).toBe(true); /* Does not change */
});

test('SkipGapsButton', function() {
    const container = document.createElement("div");
    document.body.appendChild(container);

    const options = new DisplayOptions();
    const button = new SkipGapsButton(container, { viewModel: options });
    expect(button.container).toBe(container);
    expect(button.viewModel).toBe(options);
    expect(button.viewModel.collapse).toBe(true);

    button.element.click();
    expect(button.viewModel.collapse).toBe(false);
});

test('SkipGapsButton.optional', function() {
    const container = document.createElement("div");
    document.body.appendChild(container);

    const button = new SkipGapsButton(container);
    expect(button.container).toBe(container);
    expect(button.viewModel).toBeInstanceOf(DisplayOptions);
    expect(button.viewModel.collapse).toBe(true);

    button.element.click();
    expect(button.viewModel.collapse).toBe(false);
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


