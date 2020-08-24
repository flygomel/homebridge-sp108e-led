"use strict";
let hap;

const Sync = require("../lib/sync");
const Color = require("color-converter").default;
const ct = require("color-temperature");

const modes = [
	"STATIC",
	"METEOR",
	"BREATHING",
	"WAVE",
	"CATCHUP",
	"STACK",
	"FLASH",
	"FLOW",
];

class LedStripColor {
	constructor(log, config, api) {
		this.log = log;
		this.config = config;
		this.api = api;
		this.Service = this.api.hap.Service;
		this.Characteristic = this.api.hap.Characteristic;

		this.init();
	}

	async init() {
		this.sync = new Sync({
			tv_ip: this.config.tv_ip,
			led_strip_ip: this.config.led_strip_ip,
		});

		this.informationService = new hap.Service.AccessoryInformation()
			.setCharacteristic(
				hap.Characteristic.Manufacturer,
				"Custom Manufacturer"
			)
			.setCharacteristic(hap.Characteristic.Model, "Custom Model");

		this.colorService = new hap.Service.Lightbulb(this.config.name);
		this.colorService
			.getCharacteristic(hap.Characteristic.On)
			.on("get", (callback) => {
				this.log.info("GET On " + this.state.enabled);
				callback(undefined, this.state.enabled);
			})
			.on("set", (value, callback) => {
				this.state.enabled = value;
				this.log.info("SET On " + this.state.enabled);
				this.updateColor();
				callback();
			});
		this.colorService
			.getCharacteristic(hap.Characteristic.Brightness)
			.on("get", (callback) => {
				this.log.info("GET Brightness " + this.state.brightness);
				callback(undefined, this.state.brightness);
			})
			.on("set", (value, callback) => {
				this.state.brightness = value;
				this.log.info("SET Brightness " + this.state.brightness);
				this.sync.setBrightness(this.state.brightness);
				callback();
			});

		this.colorService
			.getCharacteristic(hap.Characteristic.Hue)
			.on("get", (callback) => {
				this.log.info("GET Hue " + this.state.hue);
				callback(undefined, this.state.hue);
			})
			.on("set", (value, callback) => {
				this.state.hue = value;
				this.log.info("SET Hue " + this.state.hue);
				this.updateColor();
				callback();
			});
		this.colorService
			.getCharacteristic(hap.Characteristic.Saturation)
			.on("get", (callback) => {
				this.log.info("GET Saturation " + this.state.saturation);
				callback(undefined, this.state.saturation);
			})
			.on("set", (value, callback) => {
				this.state.saturation = value;
				this.log.info("SET Saturation " + this.state.saturation);
				this.updateColor();
				callback();
			});

		this.tvSyncSwitchService = new hap.Service.Switch(
			this.config.name + " TV Sync"
		);
		this.tvSyncSwitchService
			.getCharacteristic(hap.Characteristic.On)
			.on("get", (callback) => {
				this.log.info("GET TV Sync " + this.sync.sync_enabled);
				callback(undefined, this.sync.enabled);
			})
			.on("set", (value, callback) => {
				if (value) this.sync.sync();
				else this.sync.sync_enabled = false;

				this.log.info("SET TV Sync " + this.sync.sync_enabled);
				callback();
			});

		this.modesSwitchService = new hap.Service.Fanv2(
			this.config.name + " Modes"
		);
		this.modesSwitchService
			.getCharacteristic(hap.Characteristic.Active)
			.on("get", (callback) => {
				this.log.info("GET Active " + this.state.dream_mode_enabled);
				callback(undefined, this.state.dream_mode_enabled);
			})
			.on("set", (value, callback) => {
				// this.state.dream_mode_enabled = value;
				this.log.info("SET Active " + this.state.dream_mode_enabled);
				// value
				// 	? this.sync.setAnimationMode(0)
				// 	: this.sync.setAnimationMode("STATIC");
				callback();
			});
		this.modesSwitchService
			.getCharacteristic(hap.Characteristic.RotationSpeed)
			.on("get", (callback) => {
				this.log.info("GET Speed " + this.state.speed);
				callback(undefined, this.state.speed);
			})
			.on("set", (value, callback) => {
				this.state.speed = value;
				this.log.info("SET Speed " + this.state.speed);
				this.sync.setSpeed(this.state.speed);
				callback();
			});

		this.modesSwitchService
			.getCharacteristic(hap.Characteristic.SwingMode)
			.on("get", (callback) => {
				this.log.info(
					"GET MonoColorModeSwitch " + this.state.staticColorIndex
				);
				callback(undefined, this.state.staticColorIndex);
			})
			.on("set", (value, callback) => {
				this.log.info(
					"SET MonoColorModeSwitch " + this.state.staticColorIndex
				);

				this.tvSyncSwitchService.setCharacteristic(
					hap.Characteristic.On,
					false
				);

				this.state.colorModeIdx = -1;

				if (this.state.staticModeIdx >= modes.length - 1)
					this.state.staticModeIdx = -1;

				this.state.staticModeIdx++;
				this.log.info("MODE " + modes[this.state.staticModeIdx]);
				this.sync.setAnimationMode(modes[this.state.staticModeIdx]);
				callback();
			});

		this.modesSwitchService
			.getCharacteristic(hap.Characteristic.TargetFanState)
			.on("get", (callback) => {
				this.log.info(
					"GET MultiColorModeSwitch " + this.state.colorModeIdx
				);
				callback(undefined, this.state.colorModeIdx);
			})
			.on("set", (value, callback) => {
				this.state.staticModeIdx = -1;
				this.state.colorModeIdx++;
				this.log.info(
					"SET MultiColorModeSwitch " + this.state.colorModeIdx
				);
				this.tvSyncSwitchService.setCharacteristic(
					hap.Characteristic.On,
					false
				);
				this.sync.setAnimationMode(this.state.colorModeIdx);
				callback();
			});

		const settings = await this.sync.getSettings();
		const color = Color.fromHex("#" + settings.color).toHSV();
		console.log({ settings });

		this.state = {
			enabled: !!color.v,
			staticModeIdx: -1,
			colorModeIdx:
				settings.currentAnimation <= 180
					? settings.currentAnimation
					: -1,
			speed: settings.animationSpeed,
			hue: Math.round(color.h * 360),
			saturation: Math.round(color.s * 100),
			brightness: settings.brightness,
			color_temperature: 200,
			color: settings.color,
		};

		this.log.info("Led Strip finished initializing!");
	}

	updateColor(colorTemp = false) {
		console.log(this.state);

		if (this.state.colorModeIdx >= 0) {
			this.state.colorModeIdx = -1;
			this.sync.setAnimationMode("STATIC");
			this.tvSyncSwitchService.setCharacteristic(
				hap.Characteristic.On,
				false
			);
		}

		let color = "#000000";
		if (colorTemp) {
			const rgb = ct.colorTemperature2rgb(
				1000000 / this.state.color_temperature
			);
			color = Color.fromRGB(rgb.red, rgb.green, rgb.blue);
			color.value = this.state.enabled ? this.state.brightness / 100 : 0;
		} else {
			color = Color.fromHSV(
				this.state.hue / 360,
				this.state.saturation / 100,
				1
			);
		}
		color = color.toHex().slice(1);
		console.log({ color });
		this.state.color = color;
		this.sync.setColor(color);
	}

	getServices() {
		return [
			this.informationService,
			// this.tvSyncSwitchService,
			this.colorService,
			this.modesSwitchService,
		];
	}
}

module.exports = (api) => {
	hap = api.hap;
	api.registerAccessory("sp108eLedStripColor", LedStripColor);
	// api.registerAccessory("ExampleLightbulbPlugin", ExampleLightbulbAccessory);
};
