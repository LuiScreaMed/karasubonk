const { app, Menu, Tray, BrowserWindow, ipcMain, session, Notification } = require("electron");
const fs = require("fs");
const { KeepLiveWS, getRoomid, KeepLiveTCP, LiveTCP, LiveWS } = require("bilibili-live-ws");
const log = require("electron-log");
const axios = require('axios');
const https = require('https');

// 创建忽略 SSL 的 axios 实例
const request = axios.default.create({
  httpsAgent: new https.Agent({
    rejectUnauthorized: false
  })
});

if (process.platform === 'win32') {
  app.setAppUserModelId('Karasubonk Bilibili');
}

var mainWindow;

const isPrimary = app.requestSingleInstanceLock();

if (!isPrimary)
  app.quit()
else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized())
        mainWindow.restore();
      mainWindow.focus();
    }
  })
}

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    minWidth: 1024,
    minHeight: 768,
    icon: __dirname + "/icon.ico",
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    autoHideMenuBar: true,
    useContentSize: true,
    fullscreenable: false,
  })

  // mainWindow.webContents.openDevTools();

  mainWindow.loadFile("index.html")

  // Minimizing to and restoring from tray
  mainWindow.on("minimize", () => {
    if (data.minimizeToTray) {
      setTray();
      mainWindow.setSkipTaskbar(true);
    }
    else {
      if (tray != null) {
        setTimeout(() => {
          tray.destroy()
        }, 100);
      }

      mainWindow.setSkipTaskbar(false);
    }
  });

  mainWindow.on("restore", () => {
    if (tray != null) {
      setTimeout(() => {
        tray.destroy()
      }, 100);
    }

    mainWindow.setSkipTaskbar(false);
  });

  mainWindow.on("close", () => {
    exiting = true;
  });
}

function setTray() {
  tray = new Tray(__dirname + "/icon.ico");
  contextMenu = Menu.buildFromTemplate([
    { label: "Open", click: () => { mainWindow.restore(); } },
    { label: "Quit", role: "quit" }
  ]);
  tray.setContextMenu(contextMenu);
  tray.on("click", () => { mainWindow.restore(); });
}

var tray = null, contextMenu;
app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
});

ipcMain.on("getUserDataPath", () => {
  mainWindow.webContents.send("userDataPath", app.getPath("userData"));
});

ipcMain.on("logger", (_, ...args) => {
  Logger.info("Renderer Log");
  Logger.info(...args);
  Logger.info("Renderer Log End");
})

// --------------
// Authentication
// --------------

var biliClient, connected = false, connecting = false, listenersActive = false, closeRetry = 0, conf = {}, connectId, danmuInfo, hostIndex, uid, buvid;

//连接至房间
async function connect(roomid) {
  connecting = true;
  if (!biliClient) {
    Logger.info("bilibili connecting");
    mainWindow.webContents.send("connectStatus", 1);
    if (!roomid) {
      return mainWindow.webContents.send("roomidEmptyError");
    }

    connectId = parseInt(roomid);
    try {
      Logger.info("getting room_id and uid");
      const roomData = (await request.get(`https://api.live.bilibili.com/room/v1/Room/mobileRoomInit?id=${roomid}`)).data;
      // const roomData = await (await fetch(`https://api.live.bilibili.com/room/v1/Room/mobileRoomInit?id=${roomid}`)).json();
      Logger.info(roomData);
      Logger.info("getting room_id and uid end");
      connectId = roomData.data.room_id;
      uid = roomData.data.uid;
      if (connectId === undefined) {
        return mainWindow.webContents.send("roomidEmptyError");
      }
      Logger.info("getting buvid");
      const buvidData = (await request.get("https://api.bilibili.com/x/frontend/finger/spi")).data;
      // const buvidData = (await (await fetch("https://api.bilibili.com/x/frontend/finger/spi")).json()).data;
      buvid = buvidData.b_3;
      Logger.info(buvid);
      Logger.info("getting buvid end");
      hostIndex = 0;
      danmuInfo = (await request.get(`https://api.live.bilibili.com/xlive/web-room/v1/index/getDanmuInfo?id=${roomid}`)).data;
      // danmuInfo = (await (await fetch(`https://api.live.bilibili.com/xlive/web-room/v1/index/getDanmuInfo?id=${roomid}`)).json()).data;
      Logger.info("danmuInfo");
      Logger.info(danmuInfo);
      Logger.info("danmuInfo end");
      connectToBilibili();
    } catch (e) {
      mainWindow.webContents.send("connectStatus", 0);
      connectFailed();
      Logger.error("Getting roomid or conf error");
      Logger.error(e);
      Logger.error("Getting roomid or conf error end");
    }

  } else {
    Logger.info("bilibili disconnecting");
    disconnect();
  }
}

function getConf() {
  if (hostIndex >= danmuInfo.host_list.length) hostIndex = 0;
  let host = danmuInfo.host_list[hostIndex].host;
  let wwsPort = danmuInfo.host_list[hostIndex].wss_port;
  hostIndex++;

  return {
    key: danmuInfo.token,
    host,
    // host: "broadcastlv.chat.bilibili.com",
    address: `wss://${host}:${wwsPort}/sub`,
    // address: `wss://broadcastlv.chat.bilibili.com/sub`,
    protover: 3,
    buvid,
    uid: 0
  }
}

// 连接B站并开启监听
function connectToBilibili() {
  conf = getConf();
  Logger.info("connect conf");
  Logger.info(conf);
  Logger.info("connect conf end");

  biliClient = new LiveWS(connectId, conf);

  biliClient.on("open", connectOpen);
  biliClient.on("heartbeat", onHeartBeat);
  biliClient.on("msg", onMessage);
  biliClient.on("error", onError);
  biliClient.on("close", onClose);
}

// 关闭监听并断开B站的连接
function disconnectFromBilibili() {
  if (biliClient) {
    biliClient.off("open", connectOpen);
    biliClient.off("heartbeat", onHeartBeat);
    biliClient.off("msg", onMessage);
    biliClient.off("error", onError);
    biliClient.off("close", onClose);
    biliClient.close();
    biliClient = undefined;
  }
}

// 连接开启时
function connectOpen(...args) {
  Logger.info(...args);
  mainWindow.webContents.send("connectStatus", 2);
  setData("roomid", connectId);
  Logger.info("bilibili connection opened.");
  connected = true;
  connecting = false;
  listenersActive = true;
}

// 连接出错时
function onError(error) {
  Logger.error("bilibili connection error:")
  Logger.error(typeof (error) == 'object' ? JSON.stringify(error) : toString(error))
  Logger.error("bilibili connection error end.")
}

// 连接失败通知
function connectFailed() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) {
    let notification = new Notification({
      body: "B站直播间连接失败，请重试",
      title: "Karasubonk Bilibili",

    });
    notification.on("click", () => {
      if (!mainWindow) return;
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
    });
    notification.show();
  } else {
    mainWindow.webContents.send('biliConnectFailed');
  }
}

let connectErrTimer = null;
// 连接关闭时
function onClose() {
  Logger.error("bilibili connection closed")
  if (closeRetry < 5) {
    closeRetry++;
    disconnectFromBilibili();
    connectErrTimer = setTimeout(() => {
      connectToBilibili();
    }, 500);
  } else {
    closeRetry = 0;
    connectFailed();
    disconnect();
  }
}

// 断开连接
function disconnect() {
  clearTimeout(connectErrTimer);
  connected = false;
  connecting = false;
  listenersActive = false;
  disconnectFromBilibili();
  mainWindow.webContents.send("connectStatus", 0);
  Logger.info("bilibili disconnected");
}

// 心跳
function onHeartBeat(online) { }

// 当点击了连接/断开连接按钮后
ipcMain.on("connect", (_, roomid) => {
  if (connected)
    disconnect();
  else
    connect(roomid);
})

// 添加事件listener
// 弹幕、广播等全部信息
function onMessage(data) {
  let cmd = data.cmd;
  switch (cmd) {
    case 'SUPER_CHAT_MESSAGE_JPN':
    case 'SUPER_CHAT_MESSAGE':  // 醒目留言
      Logger.info("Received Message: Super Chat");
      onSuperChatHandler(data);
      break;
    case 'SEND_GIFT': // 礼物
      Logger.info("Received Message: Gift");
      onGiftHandler(data);
      break;
    case 'GUARD_BUY': // 上舰
      Logger.info("Received Message: Guard");
      onGuardBuyHandler(data);
      break;
    case 'INTERACT_WORD': // 用户进入直播间，判断关注
      Logger.info("Received Message: Interact Word");
      onFollowHandler(data);
      break;
    case 'LIKE_INFO_V3_CLICK': // 点赞
      Logger.info("Received Message: Like");
      onLikeHandler(data);
      break;
    default:
      // 弹幕
      if (cmd.startsWith("DANMU_MSG")) {
        Logger.info("Received Message: Danmaku");
        onDanmakuHandler(data);
        break;
      }
      // 其他
      Logger.info("Received Message: Others");
      break;
  }
  Logger.info(JSON.stringify(data));
  Logger.info("Received Message end");
}

// Periodically reporting status back to renderer
// 状态监听
var exiting = false;
setInterval(() => {
  if (mainWindow != null) {
    var status = 0;
    if (portInUse)
      status = 8;
    else if (!connected)
      status = 1;
    else if (!listenersActive)
      status = 7;
    else if (socket == null)
      status = 2;
    else if (calibrateStage == 0 || calibrateStage == 1)
      status = 3;
    else if (calibrateStage == 2 || calibrateStage == 3)
      status = 4;
    else if (!connectedVTube)
      status = 5;
    else if (calibrateStage == -1)
      status = 6;
    else if (badVersion)
      status = 9;
    else if (noResponse)
      status = 10;

    if (!exiting)
      mainWindow.webContents.send("status", status);
  }
}, 100);

// Loading data from file
// If no data exists, create data from default data file
const defaultData = JSON.parse(fs.readFileSync(__dirname + "/defaultData.json", "utf8"));
if (!fs.existsSync(app.getPath("userData")))
  fs.mkdirSync(app.getPath("userData"));
if (!fs.existsSync(app.getPath("userData") + "/data.json")) {
  if (fs.existsSync(__dirname + "/data.json"))
    fs.copyFileSync(__dirname + "/data.json", app.getPath("userData") + "/data.json");
  else
    fs.writeFileSync(app.getPath("userData") + "/data.json", JSON.stringify(defaultData));
}
var data = JSON.parse(fs.readFileSync(app.getPath("userData") + "/data.json", "utf8"));

ipcMain.on("help", () => require('electron').shell.openExternal("https://www.bilibili.com/read/cv24077574"));
ipcMain.on("link", () => require('electron').shell.openExternal("https://github.com/LuiScreaMed/karasubonk"));
ipcMain.on("originalItchLink", () => require('electron').shell.openExternal("https://typeou.itch.io/karasubonk"));
ipcMain.on("originalAuthorLink", () => require('electron').shell.openExternal("https://www.typeou.dev"));
ipcMain.on("creditGithubLink", () => require('electron').shell.openExternal("https://github.com/LuiScreaMed/karasubonk"));
ipcMain.on("bilibiliLink", () => require('electron').shell.openExternal("https://space.bilibili.com/3837681"));

// 发现新版本文字添加跳转
ipcMain.on("toRelease", () => require('electron').shell.openExternal("https://github.com/LuiScreaMed/karasubonk/releases/latest"));

ipcMain.on("getExpressions", getExpressions);

// 重置设置
ipcMain.on("resetComplete", () => {
  exiting = true;
  app.relaunch();
  app.quit();
})


// ----------------
// Websocket Server
// ----------------

const WebSocket = require("ws");
const { exit } = require("process");

var wss, portInUse = false, socket, connectedVTube = false, badVersion = false, noResponse = false, receivedExpressions = false, gettingExpressions = false;

function checkVersion() {
  if (socket != null) {
    socket.send(JSON.stringify({
      "type": "versionReport",
      "version": data.version
    }));
    noResponse = true;

    setTimeout(() => {
      if (noResponse || badVersion)
        checkVersion();
    }, 1000);
  }
}

// 获取表情列表
// get expressions
function getExpressions() {
  if (!gettingExpressions && socket != null) {
    mainWindow.webContents.send("gettingExpression");
    gettingExpressions = true;
    var request = {
      "type": "getExpressionList"
    }
    socket.send(JSON.stringify(request))
  }
}

const MessageType = {
  versionReport: "versionReport",
  calibrating: "calibrating",
  status: "status",
  setAuthVTS: "setAuthVTS",
  getAuthVTS: "getAuthVTS",
  expressions: "expressions",
  log: "log",
  modelLoaded: "modelLoaded"
}

createServer();

function createServer() {
  portInUse = false;

  wss = new WebSocket.Server({ port: data.portThrower });

  wss.on("error", () => {
    portInUse = true;
    // Retry server creation after 3 seconds
    setTimeout(() => {
      createServer();
    }, 3000);
  });

  if (!portInUse) {
    wss.on("connection", function connection(ws) {
      portInUse = false;
      socket = ws;

      if (data.version != null)
        checkVersion();

      socket.on("message", function message(request) {
        request = JSON.parse(request);

        switch (request.type) {
          case MessageType.versionReport: {
            noResponse = false;
            badVersion = parseFloat(request.version) != data.version;
            break;
          }
          case MessageType.calibrating: {
            switch (request.stage) {
              case "min":
                if (request.size > -99) {
                  calibrateStage = 0;
                  calibrate();
                }
                else {
                  setData(request.modelID + "Min", [request.positionX, request.positionY], false);
                  calibrateStage = 2;
                  calibrate();
                }
                break;
              case "max":
                if (request.size < 99) {
                  calibrateStage = 2;
                  calibrate();
                }
                else {
                  setData(request.modelID + "Max", [request.positionX, request.positionY], false);
                  calibrateStage = 4;
                  calibrate();
                }
                break;
            }
            break;
          }
          case MessageType.status: {
            connectedVTube = request.connectedVTube;

            // 第一次连接后获取表情列表
            // get expressions after the first time connected to VTS
            if (connectedVTube && !receivedExpressions) {
              Logger.info("VTS connected, getting expressions");
              getExpressions();
            }
            break;
          }
          case MessageType.setAuthVTS: {
            setData("authVTS", request.token);
            var request = {
              "type": "getAuthVTS",
              "token": request.token
            }
            socket.send(JSON.stringify(request));
            break;
          }
          case MessageType.getAuthVTS: {
            var request = {
              "type": "getAuthVTS",
              "token": data.authVTS
            }
            socket.send(JSON.stringify(request));
            break;
          }
          // 保存vts模型的表情列表
          // save expression list from vts model
          case MessageType.expressions: {
            gettingExpressions = false;
            receivedExpressions = true;
            mainWindow.webContents.send("expressions", request.expressions);
            break;
          }
          // bonker 日志
          // bonker logger
          case MessageType.log: {
            Logger.info("Bonker Log");
            Logger.info(request.log);
            Logger.info("Bonker Log end");
            break;
          }
          // 更换模型
          case MessageType.modelLoaded: {
            getExpressions();
            break;
          }
        }
      });

      ws.on("close", function message() {
        socket = null;
        calibrateStage = -2;
      });
    });
  }
}

// -----------------
// Model Calibration
// -----------------

ipcMain.on("startCalibrate", () => startCalibrate());
ipcMain.on("nextCalibrate", () => nextCalibrate());
ipcMain.on("cancelCalibrate", () => cancelCalibrate());

var calibrateStage = -2;
function startCalibrate() {
  if (socket != null && connectedVTube) {
    calibrateStage = -1;
    calibrate();
  }
}

function nextCalibrate() {
  if (socket != null && connectedVTube) {
    calibrateStage++;
    calibrate();
  }
}

function cancelCalibrate() {
  if (socket != null && connectedVTube) {
    calibrateStage = 4;
    calibrate();
  }
}

function calibrate() {
  var request = {
    "type": "calibrating",
    "stage": calibrateStage
  }
  socket.send(JSON.stringify(request));
}

// -----
// Bonks
// -----

// Acquire a random image, sound, and associated properties
function getImageWeightScaleSoundVolume() {
  var index;
  do {
    index = Math.floor(Math.random() * data.throws.length);
  } while (!data.throws[index].enabled);

  var soundIndex = -1;
  if (hasActiveSound()) {
    do {
      soundIndex = Math.floor(Math.random() * data.impacts.length);
    } while (!data.impacts[soundIndex].enabled);
  }

  return {
    "location": data.throws[index].location,
    "weight": data.throws[index].weight,
    "scale": data.throws[index].scale,
    "sound": data.throws[index].sound != null ? data.throws[index].sound : soundIndex != -1 ? data.impacts[soundIndex].location : null,
    "volume": data.throws[index].volume * (soundIndex != -1 ? data.impacts[soundIndex].volume : 1)
  };
}

// Acquire a set of images, sounds, and associated properties for a default barrage
function getImagesWeightsScalesSoundsVolumes(customAmount) {
  var getImagesWeightsScalesSoundsVolumes = [];

  var count = customAmount == null ? data.barrageCount : customAmount;
  for (var i = 0; i < count; i++)
    getImagesWeightsScalesSoundsVolumes.push(getImageWeightScaleSoundVolume());

  return getImagesWeightsScalesSoundsVolumes;
}

// Test Events
ipcMain.on("single", () => single());
ipcMain.on("barrage", () => barrage());
ipcMain.on("follow", () => onFollowHandler({ data: { msg_type: 2 } }));
ipcMain.on("guard", () => {
  const level = Math.ceil(Math.random() * 3);
  onGuardBuyHandler({ data: { guard_level: level, num: Math.ceil(Math.random() * 2), price: level == 3 ? 198000 : (level == 2 ? 1998000 : 19998000) } });
})
ipcMain.on("superChat", () => onSuperChatHandler({ data: { price: (Math.ceil(Math.random() * 30)) + 30 } }))

// Testing a specific item
ipcMain.on("testItem", (event, message) => testItem(event, message));

function testItem(_, item) {
  console.log("Testing Item");
  if (socket != null) {
    var soundIndex = -1;
    if (hasActiveSound()) {
      do {
        soundIndex = Math.floor(Math.random() * data.impacts.length);
      } while (!data.impacts[soundIndex].enabled);
    }

    var request =
    {
      "type": "single",
      "image": item.location,
      "weight": item.weight,
      "scale": item.scale,
      "sound": item.sound == null && soundIndex != -1 ? data.impacts[soundIndex].location : item.sound,
      "volume": item.volume,
      "data": data
    }
    socket.send(JSON.stringify(request));
  }
}

// A single random bonk
function single() {
  console.log("Sending Single");
  if (socket != null && hasActiveImage()) {
    const imageWeightScaleSoundVolume = getImageWeightScaleSoundVolume();

    var request =
    {
      "type": "single",
      "image": imageWeightScaleSoundVolume.location,
      "weight": imageWeightScaleSoundVolume.weight,
      "scale": imageWeightScaleSoundVolume.scale,
      "sound": imageWeightScaleSoundVolume.sound,
      "volume": imageWeightScaleSoundVolume.volume,
      "data": data
    }
    socket.send(JSON.stringify(request));
  }
}

// A random barrage of bonks
function barrage(customAmount) {
  console.log("Sending Barrage");
  if (socket != null && hasActiveImage()) {
    const imagesWeightsScalesSoundsVolumes = getImagesWeightsScalesSoundsVolumes(customAmount);
    var images = [], weights = [], scales = [], sounds = [], volumes = [];
    for (var i = 0; i < imagesWeightsScalesSoundsVolumes.length; i++) {
      images[i] = imagesWeightsScalesSoundsVolumes[i].location;
      weights[i] = imagesWeightsScalesSoundsVolumes[i].weight;
      scales[i] = imagesWeightsScalesSoundsVolumes[i].scale;
      sounds[i] = imagesWeightsScalesSoundsVolumes[i].sound;
      volumes[i] = imagesWeightsScalesSoundsVolumes[i].volume;
    }

    var request = {
      "type": "barrage",
      "image": images,
      "weight": weights,
      "scale": scales,
      "sound": sounds,
      "volume": volumes,
      "data": data
    }
    socket.send(JSON.stringify(request));
  }
}

// Acquire an image, sound, and associated properties for a custom bonk
function getCustomImageWeightScaleSoundVolume(customName) {
  var index;
  if (data.customBonks[customName].itemsOverride && hasActiveImageCustom(customName)) {
    do {
      index = Math.floor(Math.random() * data.throws.length);
    } while (!data.throws[index].customs.includes(customName));
  }
  else {
    do {
      index = Math.floor(Math.random() * data.throws.length);
    } while (!data.throws[index].enabled);
  }

  var soundIndex = -1;
  if (data.customBonks[customName].soundsOverride && hasActiveSoundCustom(customName)) {
    do {
      soundIndex = Math.floor(Math.random() * data.impacts.length);
    } while (!data.impacts[soundIndex].customs.includes(customName));
  }
  else if (hasActiveSound()) {
    do {
      soundIndex = Math.floor(Math.random() * data.impacts.length);
    } while (!data.impacts[soundIndex].enabled);
  }

  var impactDecalIndex = -1;
  if (hasActiveImpactDecal(customName)) {
    do {
      impactDecalIndex = Math.floor(Math.random() * data.customBonks[customName].impactDecals.length);
    } while (!data.customBonks[customName].impactDecals[impactDecalIndex].enabled);
  }

  var windupSoundIndex = -1;
  if (hasActiveWindupSound(customName)) {
    do {
      windupSoundIndex = Math.floor(Math.random() * data.customBonks[customName].windupSounds.length);
    } while (!data.customBonks[customName].windupSounds[windupSoundIndex].enabled);
  }

  return {
    "location": data.throws[index].location,
    "weight": data.throws[index].weight,
    "scale": data.throws[index].scale,
    "sound": data.throws[index].sound != null ? data.throws[index].sound : (soundIndex != -1 ? data.impacts[soundIndex].location : null),
    "volume": data.throws[index].volume * (soundIndex != -1 ? data.impacts[soundIndex].volume : 1),
    "impactDecal": impactDecalIndex != -1 ? data.customBonks[customName].impactDecals[impactDecalIndex] : null,
    "windupSound": windupSoundIndex != -1 ? data.customBonks[customName].windupSounds[windupSoundIndex] : null
  };
}

// Acquire a set of images, sounds, and associated properties for a custom bonk
// update: 添加自动计数
function getCustomImagesWeightsScalesSoundsVolumes(customName, count) {
  var getImagesWeightsScalesSoundsVolumes = [];
  count = data.customBonks[customName].barrageCountManual ? data.customBonks[customName].barrageCount : count;
  for (var i = 0; i < count; i++)
    // update end
    getImagesWeightsScalesSoundsVolumes.push(getCustomImageWeightScaleSoundVolume(customName));

  return getImagesWeightsScalesSoundsVolumes;
}

ipcMain.on("testCustomBonk", (_, message) => { custom(message); });

// A custom bonk test
// update: 添加自动计数
function custom(customName, count = 1) {
  console.log("Sending Custom");
  if (socket != null && hasActiveImageCustom(customName)) {
    // update end
    const imagesWeightsScalesSoundsVolumes = getCustomImagesWeightsScalesSoundsVolumes(customName, count);
    var images = [], weights = [], scales = [], sounds = [], volumes = [], impactDecals = [], windupSounds = [];
    for (var i = 0; i < imagesWeightsScalesSoundsVolumes.length; i++) {
      images[i] = imagesWeightsScalesSoundsVolumes[i].location;
      weights[i] = imagesWeightsScalesSoundsVolumes[i].weight;
      scales[i] = imagesWeightsScalesSoundsVolumes[i].scale;
      sounds[i] = imagesWeightsScalesSoundsVolumes[i].sound;
      volumes[i] = imagesWeightsScalesSoundsVolumes[i].volume;
      impactDecals[i] = imagesWeightsScalesSoundsVolumes[i].impactDecal;
      windupSounds[i] = imagesWeightsScalesSoundsVolumes[i].windupSound;
    }

    var request = {
      "type": customName,
      "image": images,
      "weight": weights,
      "scale": scales,
      "sound": sounds,
      "volume": volumes,
      "impactDecal": impactDecals,
      "windupSound": windupSounds,
      "data": data
    }
    socket.send(JSON.stringify(request));
  }
}

// ----
// Data
// ----

ipcMain.on("setData", (_, arg) => {
  setData(arg[0], arg[1], true);
});

function setData(field, value, external) {
  data[field] = value;
  fs.writeFileSync(app.getPath("userData") + "/data.json", JSON.stringify(data));
  if (external)
    mainWindow.webContents.send("doneWriting");

  if (field == "version")
    checkVersion();
}

function hasActiveImage() {
  if (data.throws == null || data.throws.length == 0)
    return false;

  var active = false;
  for (var i = 0; i < data.throws.length; i++) {
    if (data.throws[i].enabled) {
      active = true;
      break;
    }
  }
  return active;
}

function hasActiveImageCustom(customName) {
  if (!data.customBonks[customName].itemsOverride)
    return hasActiveImage();

  if (data.throws == null || data.throws.length == 0)
    return false;

  var active = false;
  for (var i = 0; i < data.throws.length; i++) {
    if (data.throws[i].customs.includes(customName)) {
      active = true;
      break;
    }
  }
  return active;
}

function hasActiveImpactDecal(customName) {
  if (data.customBonks[customName].impactDecals == null || data.customBonks[customName].impactDecals.length == 0)
    return false;

  var active = false;
  for (var i = 0; i < data.customBonks[customName].impactDecals.length; i++) {
    if (data.customBonks[customName].impactDecals[i].enabled) {
      active = true;
      break;
    }
  }
  return active;
}

function hasActiveWindupSound(customName) {
  if (data.customBonks[customName].windupSounds == null || data.customBonks[customName].windupSounds.length == 0)
    return false;

  var active = false;
  for (var i = 0; i < data.customBonks[customName].windupSounds.length; i++) {
    if (data.customBonks[customName].windupSounds[i].enabled) {
      active = true;
      break;
    }
  }
  return active;
}

function hasActiveSound() {
  if (data.impacts == null || data.impacts.length == 0)
    return false;

  var active = false;
  for (var i = 0; i < data.impacts.length; i++) {
    if (data.impacts[i].enabled) {
      active = true;
      break;
    }
  }
  return active;
}

function hasActiveSoundCustom(customName) {
  if (!data.customBonks[customName].soundsOverride)
    return hasActiveSound();

  if (data.impacts == null || data.impacts.length == 0)
    return false;

  var active = false;
  for (var i = 0; i < data.impacts.length; i++) {
    if (data.impacts[i].customs.includes(customName)) {
      active = true;
      break;
    }
  }
  return active;
}

/// 电池和瓜子音效判断
function hasActiveCoinSound() {
  if (data.impacts == null || data.impacts.length == 0)
    return false;

  var active = false;
  for (var i = 0; i < data.impacts.length; i++) {
    if (data.impacts[i].coins) {
      active = true;
      break;
    }
  }
  return active;
}

// 大航海音效判断
function hasActiveGuardSound() {
  if (data.impacts == null || data.impacts.length == 0)
    return false;

  var active = false;
  for (var i = 0; i < data.impacts.length; i++) {
    if (data.impacts[i].guards) {
      active = true;
      break;
    }
  }
  return active;
}

// --------------
// coinType
// --------------

const CoinType = {
  silver: 'silver',
  battery: 'battery',
}

function getCoinType(coin_type) {
  if (coin_type === CoinType.silver) return coin_type;
  else return CoinType.battery;
}

// --------------
// Event Handlers
// --------------

// 处理弹幕command
var commandCooldowns = {};
function onDanmakuHandler({ info: [, message] }) {

  if (data.commands != null) {
    for (var i = 0; i < data.commands.length; i++) {
      if (data.commands[i].name != "" &&
        message.includes(data.commands[i].name) &&
        commandCooldowns[data.commands[i].name] == null && data.commands[i].enabled) {
        switch (data.commands[i].bonkType) {
          case "single":
            single();
            break;
          case "barrage":
            barrage();
            break;
          default:
            custom(data.commands[i].bonkType);
            break;
        }

        // 冷却
        if (data.commands[i].cooldown > 0) {
          commandCooldowns[data.commands[i].name] = true;
          setTimeout(() => { delete commandCooldowns[data.commands[i].name]; }, data.commands[i].cooldown * 1000);
        }
        break;
      }
    }
  }
}

// 处理SC
var canSuperChat = true;
function onSuperChatHandler({ data: { price } }) {
  price = price * 10;
  if (canSuperChat && data.superChatEnabled && price >= data.superChatMinBattery) {
    throwCoins({ coinType: CoinType.battery, num: price, max: data.superChatMaxCount, unit: data.superChatCoinUnit });

    if (data.superChatCooldown > 0) {
      canSuperChat = false;
      setTimeout(() => { canSuperChat = true }, data.superChatCooldown * 1000);
    }
  }
}

// 处理礼物
var giftCooldowns = {};
function onGiftHandler({ data: { coin_type, giftName, num, price } }) {
  price = coin_type === "silver" ? price : price / 100;
  // 判断价值
  let canThrow = coin_type === "silver" ? price >= data.coinMinSilver : price >= data.coinMinBattery;
  if (!canThrow) {
    Logger.warn("=== GIFT: Gift price lower than lowest limit, cancelled");
    return;
  }

  // 查找与该礼物名称相同的事件
  let giftEventIndex = -1;
  if (data.gifts != null) {
    for (let i = 0; i < data.gifts.length; i++) {
      if (data.gifts[i].name.toLowerCase() === giftName.toLowerCase()) {
        giftEventIndex = i;
        break;
      }
    }
  }

  // 如果礼物不启用，则都不投掷
  if (giftEventIndex != -1 && !data.gifts[giftEventIndex].enabled) return;

  // 如果查找不到该礼物的事件，则判断是否投掷电池和瓜子
  if (giftEventIndex === -1) {
    if (data.coinsThrowEnabled) {
      Logger.warn("=== GIFT: Gift not found in presets");
      handleGiftToCoins({ coin_type, num, price });
    }
    return;
  }

  // 如果查找到，则投掷绑定好的投掷
  if (giftCooldowns[data.gifts[giftEventIndex].name] == null) {
    if (data.multiGiftsEnabled && !data.giftWithCoinCountEnabled) { // 如果开启复数礼物限制 且 没有开启礼物按照瓜子/电池数量投掷
      num = num > data.multiGiftsMaxCount ? data.multiGiftsMaxCount : num;
      Logger.warn("=== GIFT: Gift with gift number, after clamping: " + num);
    } else if (data.giftWithCoinCountEnabled) { // 如果开启礼物按照瓜子/电池数量投掷
      Logger.warn("=== GIFT: Gift coin counts, ready to calculate");
      num = num * price;
      Logger.warn("=== GIFT: Gift coin counts, num * price: " + num);
      num = Math.ceil(num / data.giftWithCoinCountUnit);
      Logger.warn("=== GIFT: Gift coin counts, Math.ceil(num / data.giftWithCoinCountUnit): " + num);
      num = num > data.giftWithCoinCountMaxCount ? data.giftWithCoinCountMaxCount : num;
      Logger.warn("=== GIFT: Gift coin counts, after clamping: " + num);
    }
    switch (data.gifts[giftEventIndex].bonkType) {
      case "single":
        single();
        break;
      case "barrage":
        barrage();
        break;
      default:
        custom(data.gifts[giftEventIndex].bonkType, num);
        break;
    }

    if (data.gifts[giftEventIndex].cooldown > 0) {
      giftCooldowns[data.gifts[giftEventIndex].name] = true;
      setTimeout(() => { delete giftCooldowns[data.gifts[giftEventIndex].name] }, data.gifts[giftEventIndex].cooldown * 1000);
    }
  }

}

// 礼物通过电池和瓜子投掷
var canThrowGiftToCoins = true;
function handleGiftToCoins({ coin_type, num, price }) {
  if (!canThrowGiftToCoins) return;

  if (data.coinsThrowCooldown > 0) {
    canThrowGiftToCoins = false;
    setTimeout(() => { canThrowGiftToCoins = true }, data.coinsThrowCooldown * 1000);
  }

  throwCoins({
    coinType: getCoinType(coin_type),
    num: num * price,
    max:
      data.coinsThrowMaxCount,
    unit: data.coinsThrowUnit
  });
}

// 投掷电池或瓜子
function throwCoins({ coinType, num, max, unit = 1 }) {
  num = Math.ceil(num / unit);
  if (max) {
    num = num > max ? max : num;
  }
  if (socket != null) {
    var images = [], weights = [], scales = [], sounds = [], volumes = [];
    while (num > 0) {
      num--;
      images.push(data.coinThrows[coinType].location);
      weights.push(coinType === CoinType.battery ? 0.5 : 0.2);
      scales.push(data.coinThrows[coinType].scale);

      if (hasActiveCoinSound()) {
        var soundIndex;
        do {
          soundIndex = Math.floor(Math.random() * data.impacts.length);
        } while (!data.impacts[soundIndex].coins);

        sounds.push(data.impacts[soundIndex].location);
        volumes.push(data.impacts[soundIndex].volume);
      } else {
        sounds.push(null);
        volumes.push(0);
      }
    }

    var request = {
      "type": "barrage",
      "image": images,
      "weight": weights,
      "scale": scales,
      "sound": sounds,
      "volume": volumes,
      "data": data
    }

    console.log('Sending Coins');

    socket.send(JSON.stringify(request));
  }
}

// 处理大航海
var canGuard = true;
function onGuardBuyHandler({ data: { guard_level, num, price } }) {
  if (!canGuard || !data.guardEnabled) return;
  let giftName = `guard${guard_level}`;

  if (data.guardCooldown > 0) {
    canGuard = false;
    setTimeout(() => { canGuard = true }, data.guardCooldown * 1000);
  }

  // 判断大航海投掷数量类型，如果为按月数则直接num，否则按照单月花费元数投掷
  let count = data.guardNumType == "num" ? num : (price / 1000);
  count = Math.ceil(count / data.guardUnit);
  count = count > data.guardMaxCount ? data.guardMaxCount : count;

  if (socket != null && data.guardThrows[giftName]) {
    var images = [], weights = [], scales = [], sounds = [], volumes = [];
    while (count > 0) {
      count--;
      images.push(data.guardThrows[giftName].location);
      weights.push(1.0);
      scales.push(data.guardThrows[giftName].scale);

      if (hasActiveGuardSound()) {
        var soundIndex;
        do {
          soundIndex = Math.floor(Math.random() * data.impacts.length);
        } while (!data.impacts[soundIndex].guards);

        sounds.push(data.impacts[soundIndex].location);
        volumes.push(data.impacts[soundIndex].volume);
      } else {
        sounds.push(null);
        volumes.push(0);
      }
    }

    var request = {
      "type": "barrage",
      "image": images,
      "weight": weights,
      "scale": scales,
      "sound": sounds,
      "volume": volumes,
      "data": data
    }
    socket.send(JSON.stringify(request));
  }
}

// 处理关注
var canFollow = true;
function onFollowHandler({ data: { msg_type } }) {
  if (msg_type !== 2 && msg_type !== 4 && msg_type !== 5) return;
  if (canFollow && data.followEnabled) {
    switch (data.followType) {
      case "single":
        single();
        break;
      case "barrage":
        barrage();
        break;
      default:
        custom(data.followType);
        break;
    }

    if (data.followCooldown > 0) {
      canFollow = false;
      setTimeout(() => { canFollow = true; }, data.followCooldown * 1000);
    }
  }
}

// 处理点赞
var canLike = true;
function onLikeHandler({ data: { msg_type } }) {
  if (canLike && data.likeEnabled) {
    switch (data.likeType) {
      case "single":
        single();
        break;
      case "barrage":
        barrage();
        break;
      default:
        custom(data.likeType);
        break;
    }

    if (data.likeCooldown > 0) {
      canLike = false;
      setTimeout(() => { canLike = true; }, data.likeCooldown * 1000);
    }
  }
}

function renderConsole(...args) {
  mainWindow.webContents.send("consoleLog", ...args);
}

// logger功能
const Logger = {
  info: (...args) => {
    if (data.saveLogs) log.info(...args);
  },
  error: (...args) => {
    if (data.saveLogs) log.error(...args);
  },
  warn: (...args) => {
    if (data.saveLogs) log.warn(...args);
  }
}