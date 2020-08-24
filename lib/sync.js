const net = require("net");
const assert = require("assert");
const fetch = require("node-fetch");
const gradient = require("tinygradient");
const { PromiseSocket } = require("promise-socket");

const cmd = {
  CMD_FRAME_START: 0x38,
  CMD_FRAME_END: 0x83,
  CMD_CUSTOM_PREVIEW: 0x24,
  CMD_SET_BRIGHTNESS: 0x2a,
  CMD_SET_COLOR: 0x22,
  CMD_SET_SPEED: 0x03,
  CMD_SET_ANIMATION_MODE: 0x2c,
  CMD_TOGGLE: 0xaa,
  CMD_SET_MIXED_ANIMATION_AUTO_MODE: 0x06,
  CMD_GET_STATUS: 0x10,
};
const modes = {
  ANIM_MODE_METEOR: "CD",
  ANIM_MODE_BREATHING: "CE",
  ANIM_MODE_WAVE: "D1",
  ANIM_MODE_CATCHUP: "D4",
  ANIM_MODE_STATIC: "D3",
  ANIM_MODE_STACK: "CF",
  ANIM_MODE_FLASH: "D2",
  ANIM_MODE_FLOW: "D0",
};

cmd.frame = (_cmd, data) => {
  if (data === undefined) data = "000000";
  else if (data.length < 3) data = data.padEnd(6, "0");
  // else if (data.length > 3) throw new Error("data length max is 3");
  data = Buffer.from(data, "hex");

  return Buffer.concat([
    Buffer.from([cmd.CMD_FRAME_START]),
    data,
    Buffer.from([_cmd, cmd.CMD_FRAME_END]),
  ]);
};

class Sync {
  constructor(options) {
    this.options = options;
    this.sync_enabled = false;

    this.connect();
  }

  async connect() {
    // console.log("connection...");
    this.s = new net.Socket();
    this.socket = new PromiseSocket(this.s);
    await this.socket.connect(8189, this.options.led_strip_ip);
    // console.log("connected");
    // this.sync();
  }

  async getSettings() {
    const result = await this.txn_sync_expect(
      this.socket,
      cmd.frame(cmd.CMD_GET_STATUS)
    );

    return {
      powerEnabled: result[1],
      currentAnimation: result[2],
      animationSpeed: Math.round((result[3] / 255) * 100),
      brightness: Math.round((result[4] / 255) * 100),
      color:
        result[10].toString(16).padStart(2, "0") +
        result[11].toString(16).padStart(2, "0") +
        result[12].toString(16).padStart(2, "0"),
    };
  }

  setBrightness(value) {
    value = toHex(parseInt((255 * value) / 100));
    this.txn_sync_expect(
      this.socket,
      cmd.frame(cmd.CMD_SET_BRIGHTNESS, value),
      0x31
    );
  }

  setSpeed(value) {
    value = toHex(parseInt((255 * value) / 100));
    this.txn_sync_expect(
      this.socket,
      cmd.frame(cmd.CMD_SET_SPEED, value),
      0x31
    );
  }

  setColor(color) {
    this.txn_sync_expect(
      this.socket,
      cmd.frame(cmd.CMD_SET_COLOR, color),
      0x31
    );
  }

  setAnimationMode(mode) {
    if (mode === "TV") this.sync();
    else {
      this.sync_enabled = false;
      this.txn_sync_expect(
        this.socket,
        cmd.frame(
          cmd.CMD_SET_ANIMATION_MODE,
          typeof mode === "number" ? toHex(mode) : modes[`ANIM_MODE_${mode}`]
        ),
        0x31
      );
    }
  }

  async togglePower() {
    let result = await this.txn_sync_expect(
      this.socket,
      cmd.frame(cmd.CMD_TOGGLE)
    );
  }

  async startMixedAnimationAutoMode() {
    this.txn_sync_expect(
      this.socket,
      cmd.frame(cmd.CMD_SET_MIXED_ANIMATION_AUTO_MODE)
    );
  }

  async sync() {
    this.sync_enabled = true;
    await this.txn_sync_expect(
      this.socket,
      cmd.frame(cmd.CMD_CUSTOM_PREVIEW),
      0x31
    );
    while (true) {
      if (!this.sync_enabled) break;

      const {
        layer1: { left, right },
      } = await fetch(
        `http://${this.options.tv_ip}:1925/ambilight/processed`
      ).then((_) => _.json());

      // console.log(left);
      const colors = Buffer.from(
        gradient([left[2], left[1], left[0]])
          .rgb(300, true)
          .map((_) => _.toHex())
          .join(""),
        "hex"
      );
      await this.txn_sync_expect(this.socket, colors, 0x31);
      // await sleep(1000 / 60);
    }
  }

  async txn_sync_expect(sock, sendbytes, expectbytes) {
    if (this.s.readyState === "closed") await this.connect();
    // console.log(
    //   "2 Perform a txn_sync() and confirm the result is as expected "
    // );
    const r = await txn_sync(sock, sendbytes);
    if (expectbytes) assert(r.equals(Buffer.from([expectbytes])));
    return r;
  }
}

module.exports = Sync;

function toHex(value) {
  return value.toString(16).padStart(2, "0");
}

function sleep(time) {
  return new Promise((resolve) => setTimeout(resolve, time));
}

function random(max) {
  return Math.floor(Math.random() * Math.floor(max));
}

const txn = async (sock, sendbytes) => {
  // console.log("4 Perform a tx transaction");

  // console.log(`> ${sendbytes.toString("hex")}`);

  return await sock.write(sendbytes);
};

const rxn = async (sock) => {
  // console.log("5 Listen for a reply packet");
  recvbytes = await sock.read();

  // console.log(`< ${recvbytes.toString("hex")}`);

  return recvbytes;
};

const txn_sync = async (sock, sendbytes) => {
  // console.log("3 Perform a synchronous tx/rx transaction");

  await txn(sock, sendbytes);
  return await rxn(sock);
};
