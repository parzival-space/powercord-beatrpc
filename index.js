// powercord modules
const { Plugin } = require("powercord/entities");
const { getModule } = require("powercord/webpack");

// external modules
const { WebSocket } = require("./modules/ws");

// get set_activity
const { SET_ACTIVITY } = getModule(["SET_ACTIVITY"], false);

// store rpc data
var rpc = {
  client_id: "923576268765687818", // discord client id
  name: "Beat Saber", // name of the game
  state: "Taking a break", // song author
  details: "Main Menu", // song title
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
    ws.addEventListener("message", (event) => {
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

        // no forced rpc update required
      }

      // handle finished event
      if (data.event == "finished") {
        // update rpc data
        rpc.details = "Main Menu";
        rpc.state = "Taking a break";

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

      // warn
      console.log(
        `%c[BeatRPC]%c Lost connection to Beat Saber. Reconnecting in 5 seconds...`,
        "color: #ff0000;",
        "color: #ffffff;"
      );

      // try to reconnect after 2 seconds
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
            small_image: undefined, // not needed
            large_text: undefined, // not needed
            small_text: undefined, // not needed
          },
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
};
