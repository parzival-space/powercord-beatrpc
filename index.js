// powercord modules
const { Plugin } = require("powercord/entities");
const { getModule } = require("powercord/webpack");

// external modules
const { WebSocket } = require("./modules/ws");

// get set_activity
const { SET_ACTIVITY } = getModule(["SET_ACTIVITY"], false);

// node native modules
const https = require('https');

// store rpc data
var rpc = {
  client_id: "923576268765687818", // discord client id
  name: "Beat Saber", // name of the game
  state: "Taking a break", // song author
  details: "Main Menu", // song title
  small_image: undefined, // difficulty icon
  small_text: undefined, // difficulty name
  buttons: undefined, // buttons (BeatSaver)
};

// stores
var ws = null;  // websocket
var ut = null;  // update timer
var rt = null;  // reconnect timer

module.exports = class BeatRPC extends Plugin {
  // main function
  startPlugin() {
    // connect to beat saber websocket
    ws = new WebSocket("ws://localhost:6557/socket");

    // handle websocket events
    ws.addEventListener("message", async (event) => {
      // convert data
      let data = {};

      // try to parse data
      try {
        data = JSON.parse(event.data);
      } catch (e) {
        // soft error
        console.log(
          `%c[BeatRPC]%c Could not parse data: ${e} (${event.data})`,
          "color: #ff0000;",
          "color: #ffffff;"
        );
      }

      // handle hello and songStart events
      if (data.event == "hello" || data.event == "songStart") {
        // ignore if no beatmap info is available
        if (!data.status.beatmap) return;

        // update rpc data
        rpc.details = data.status.beatmap.songName;
        rpc.state = data.status.beatmap.songAuthorName;
        rpc.small_image = this.getDifficultyIcon(data.status.beatmap.difficultyEnum);
        rpc.small_text = data.status.beatmap.difficultyEnum;

        if (data.status.beatmap.songHash) {
          // get song by hash
          let song = await this.getSongByHash(data.status.beatmap.songHash)
            .catch(_ => console.log("%c[BeatRPC]%c Could not get song by hash", "color: #ff0000;", "color: #ffffff;"));

          // add button
          rpc.buttons = [{ label: 'View on BeatSaver', url: `https://beatsaver.com/maps/${song.id}` }];
        }

        // no forced rpc update required
      }

      // handle finished event
      if (data.event == "finished") {
        // update rpc data
        rpc.details = "Main Menu";
        rpc.state = "Taking a break";
        rpc.small_image = undefined;
        rpc.small_text = undefined;
        rpc.buttons = undefined;

        // no forced rpc update required
      }

      // everything else is ignored
    });

    // handle websocket close
    ws.addEventListener("close", (event) => {
      // a disconnect basically means: the game is closed

      // stop the interval
      if (ut) clearInterval(ut);
      ut = null;

      // end rpc
      this.closeRPC();

      // try to reconnect after 5 seconds
      if (rt) return;
      rt = setInterval(() => {
        this.pluginWillUnload();
        this.startPlugin();
      }, 5000);
    });

    // handle connection
    ws.addEventListener("open", (event) => {
      // clear any active reconnect timer
      if (rt) clearInterval(rt);
      rt = null;

      // reset rpc data if they are for whatever reason not default
      rpc.details = "Main Menu";
      rpc.state = "Taking a break";
      rpc.small_image = undefined;
      rpc.small_text = undefined;
      rpc.buttons = undefined;

      // start the interval
      if (!ut) ut = setInterval(() => this.updateRPC(), 2000);

      // start rpc
      this.updateRPC();
    });

    // best error handling
    ws.addEventListener("error", (_) => null);
  }

  // unload function
  pluginWillUnload() {
    // disconnect from websocket
    if (ws.readyState != WebSocket.CLOSED) ws.close();

    // desroy websocket
    ws = null;
  }

  // update rpc data
  updateRPC() {
    SET_ACTIVITY.handler({
      isSocketConnected: () => true,
      socket: {
        id: 100,
        application: {
          id: rpc.client_id,
          name: rpc.name,
        },
        transport: "ipc",
      },
      args: {
        pid: 10,
        activity: {
          details: rpc.details,
          state: rpc.state,
          timestamps: undefined,
          assets: {
            large_image: "game", // game logo
            small_image: rpc.small_image, // not needed
            large_text: undefined, // not needed
            small_text: undefined, // not needed
          },
          buttons: rpc.buttons,
        },
      },
    });
  }

  // close rpc
  closeRPC() {
    SET_ACTIVITY.handler({
      isSocketConnected: () => true,
      socket: {
        id: 100,
        application: {
          id: rpc.client_id,
          name: rpc.name,
        },
        transport: "ipc",
      },
      args: {
        pid: 10,
        activity: undefined,
      },
    });
  }

  // get difficulity icon name from difficulty name
  getDifficultyIcon(difficulty) {
    switch (difficulty) {
      case "Easy":
        return "easy";

      case "Normal":
        return "normal";

      case "Hard":
        return "hard";

      case "Expert":
        return "expert";

      case "ExpertPlus":
        return "expertplus";

      default:
        return null;
    }
  }

  // get current song song from beatsaver by hash
  getSongByHash(hash) {
    return new Promise((resolve, reject) => {
      let options = {
        rejectUnauthorized: false,
        host: "api.beatsaver.com",
        path: `/maps/hash/${hash}`,
        method: "GET",
        port: 443,
      }

      https.get(options, (res) => {
        let data = '';

        // collect data
        res.on('data', (chunk) => data += chunk);

        // parse data
        res.on('end', () => {
          let result = data;

          // parse data
          try {
            result = JSON.parse(data);
          }
          catch (e) {
            // do nothing
          }

          resolve(result);
        }).on('error', (e) => {
          reject(e);
        });
      })
    });
  }
};
