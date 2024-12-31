import { expect, test } from 'vitest';
import { knockout } from 'cesium';

import {
    DisplayOptions,
    DisplayOptionsButton
} from './displayoptions';

test('DisplayOptions', function() {
    const options = new DisplayOptions();
    expect(options.seamless).toBe(false);

    let value = null;
    knockout.getObservable(options, 'seamless').subscribe((val) => value = val);
    options.seamless = true;
    expect(value).toBe(true);
});

test('DisplayOptionsButton', function() {
    const container = document.createElement("div");
    container.setAttribute("id", "button-container");
    document.body.appendChild(container);

    const options = new DisplayOptions();

    const button = new DisplayOptionsButton("button-container", { viewModel: options });
    expect(button.container).toBe(container);
    expect(button.element).toBe(container.firstChild);
    expect(button.viewModel).toBe(options);

    expect(button.element.classList.contains("toggled")).toBe(false);
    button.element.click();
    expect(options.seamless).toBe(true);
    expect(button.element.classList.contains("toggled")).toBe(true);

    options.seamless = false;
    expect(button.element.classList.contains("toggled")).toBe(false);
});

test('DisplayOptionsButton.destroy', function() {
    const container = document.createElement("div");
    container.setAttribute("id", "button-destroy");
    document.body.appendChild(container);

    const options = new DisplayOptions();

    const button = new DisplayOptionsButton("button-destroy", { viewModel: options });
    expect(button.container).toBe(container);

    const element = button.element;
    expect(element.parentNode).toBe(container);

    element.click();
    expect(options.seamless).toBe(true);
    element.click();
    expect(options.seamless).toBe(false);

    expect(button.isDestroyed()).toBe(false);
    button.destroy();
    expect(button.isDestroyed()).toBe(true);

    expect(element.parentNode).toBe(null);
    element.click();
    expect(options.seamless).toBe(false); /* Does not change */
});

test('DisplayOptionsButton.optional', function() {
    const container = document.createElement("div");
    document.body.appendChild(container);

    const button = new DisplayOptionsButton(container);
    expect(button.container).toBe(container);
    expect(button.viewModel).toBeInstanceOf(DisplayOptions);
    expect(button.viewModel.seamless).toBe(false);

    button.element.click();
    expect(button.viewModel.seamless).toBe(true);
});


