const { app, Menu, Tray, BrowserWindow, ipcMain, session } = require("electron");
const fs = require("fs");
const { KeepLiveWS, getRoomid } = require("bilibili-live-ws");


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

  // 防止按下ALT显示菜单，以及通过快捷键显示devtool
  let menu = new Menu();
  Menu.setApplicationMenu(menu);

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

// --------------
// Authentication
// --------------

var biliClient, connected = false, connecting = false, listenersActive = false;

//连接至房间
async function connect(roomid) {
  connecting = true;
  if (!biliClient && roomid) {
    mainWindow.webContents.send("connectInputDisabled", { input: true, button: true });
    roomid = Number(roomid);
    roomid = await getRoomid(roomid);
    biliClient = new KeepLiveWS(roomid);

    biliClient.on("open", connectOpen);
    biliClient.on("heartbeat", onHeartBeat);
    biliClient.on("msg", onMessage);
  } else {
    disconnect();
  }
}

// 连接开启时
function connectOpen() {
  renderConsole("opened");
  connected = true;
  connecting = false;
  mainWindow.webContents.send("connected");
  mainWindow.webContents.send("connectInputDisabled", { input: true, button: undefined });
  listenersActive = true;
}

// 断开连接
function disconnect() {
  connected = false;
  connecting = false;
  biliClient.off("open", connectOpen);
  biliClient.off("heartbeat", onHeartBeat);
  biliClient.off("msg", onMessage);
  biliClient.close();
  biliClient = undefined;
  listenersActive = false;
  mainWindow.webContents.send("connectInputDisabled", { input: undefined, button: undefined });
}

// 心跳
function onHeartBeat(online) {
  // renderConsole(`online: ${online}`);
}

// 当点击了连接/断开连接按钮后
ipcMain.on("connect", (event, roomid) => {
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
    case 'DANMU_MSG': // 弹幕
      onDanmakuHandler(data);
      break;
    case 'SUPER_CHAT_MESSAGE_JPN':
    case 'SUPER_CHAT_MESSAGE':  // 醒目留言
      onSuperChatHandler(data);
      break;
    case 'SEND_GIFT': // 礼物
      onGiftHandler(data);
      break;
    case 'GUARD_BUY': // 上舰
      onGuardBuyHandler(data);
      break;
    case 'INTERACT_WORD': // 用户进入直播间，判断关注
      onFollowHandler(data);
      break;
    default:
      break;
  }
}

// 处理弹幕中的command
function onDanmakuHandler({ info: [, message, [, uname]] }) {
  console.log(`${uname}: ${message}`);
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

// if (data.accessToken != null)
//   login();

ipcMain.on("help", () => require('electron').shell.openExternal("https://www.bilibili.com/read/cv24077574"));
ipcMain.on("link", () => require('electron').shell.openExternal("https://github.com/LuiScreaMed/karasubonk"));
ipcMain.on("originalItchLink", () => require('electron').shell.openExternal("https://typeou.itch.io/karasubonk"));
ipcMain.on("originalAuthorLink", () => require('electron').shell.openExternal("https://www.typeou.dev"));
ipcMain.on("creditGithubLink", () => require('electron').shell.openExternal("https://github.com/LuiScreaMed/karasubonk"));
ipcMain.on("bilibiliLink", () => require('electron').shell.openExternal("https://space.bilibili.com/3837681"));

ipcMain.on("toBonkerFile", () => {
  // console.log(__dirname);
  require('electron').shell.showItemInFolder(__dirname + '\\bonker.html');
});


// ----------------
// Websocket Server
// ----------------

const WebSocket = require("ws");

var wss, portInUse = false, socket, connectedVTube = false, badVersion = false, noResponse = false;

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

        if (request.type == "versionReport") {
          noResponse = false;
          badVersion = parseFloat(request.version) != data.version;
        }
        if (request.type == "calibrating") {
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
        }
        else if (request.type == "status")
          connectedVTube = request.connectedVTube;
        else if (request.type == "setAuthVTS") {
          setData("authVTS", request.token);
          var request = {
            "type": "getAuthVTS",
            "token": request.token
          }
          socket.send(JSON.stringify(request));
        }
        else if (request.type == "getAuthVTS") {
          var request = {
            "type": "getAuthVTS",
            "token": data.authVTS
          }
          socket.send(JSON.stringify(request));
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
ipcMain.on("guard", () => onGuardBuyHandler({ data: { guard_level: Math.ceil(Math.random() * 3), num: Math.ceil(Math.random() * 10) } }))
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
  console.log("Received Danmaku");

  if (data.commands != null) {
    for (var i = 0; i < data.commands.length; i++) {
      if (data.commands[i].name != "" &&
        data.commands[i].name.toLowerCase() == message.toLowerCase() &&
        commandCooldowns[data.commands[i].name.toLowerCase()] == null && data.commands[i].enabled) {
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

        commandCooldowns[data.commands[i].name.toLowerCase()] = true;
        setTimeout(() => { delete commandCooldowns[data.commands[i].name.toLowerCase()]; }, data.commands[i].cooldown * 1000);
        break;
      }
    }
  }
}

// 处理SC
var canSuperChat = true;
function onSuperChatHandler({ data: { price } }) {
  // console.log(`${uname} 花费了 ${price * 10} 电池发布了一条SC`);
  price = price * 10;
  if (canSuperChat && data.superChatEnabled && price >= data.superChatMinBattery) {
    throwCoins({ coinType: CoinType.battery, num: price, max: data.superChatMaxCount, unit: data.superChatCoinUnit });
    canSuperChat = false;
    setTimeout(() => { canSuperChat = true }, data.superChatCooldown * 1000);
  }
}

// 处理礼物
var giftCooldowns = {};
function onGiftHandler({ data: { coin_type, giftName, num, price } }) {
  // 判断价值
  let canThrow = coin_type === "silver" ? price >= data.coinMinSilver : price >= data.coinMinBattery;
  if (!canThrow) return;

  // 查找与该礼物名称相同的事件
  let giftEventIndex = -1;
  if (data.gifts != null) {
    for (let i = 0; i < data.gifts.length; i++) {
      if (data.gifts[i].name === giftName && data.gifts[i].enabled) {
        giftEventIndex = i;
        break;
      }
    }
  }

  // 如果查找不到该礼物的事件，则判断是否投掷电池和瓜子
  if (giftEventIndex === -1) {
    if (data.coinsThrowEnabled) {
      handleGiftToCoins({ coin_type, num, price });
    }
    return;
  }

  // 如果查找到，则投掷绑定好的投掷
  if (giftCooldowns[data.gifts[giftEventIndex].name] == null && data.gifts[giftEventIndex].enabled) {
    if (data.multiGiftsEnabled) {
      num = num > data.multiGiftsMaxCount ? data.multiGiftsMaxCount : num;
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

    giftCooldowns[data.gifts[giftEventIndex].name] = true;
    setTimeout(() => { delete giftCooldowns[data.gifts[giftEventIndex].name] }, data.gifts[giftEventIndex].cooldown * 1000);
  }

}

// 礼物通过电池和瓜子投掷
var canThrowGiftToCoins = true;
function handleGiftToCoins({ coin_type, num, price }) {
  if (!canThrowGiftToCoins) return;

  canThrowGiftToCoins = false;
  setTimeout(() => { canThrowGiftToCoins = true }, data.coinsThrowCooldown * 1000);
  throwCoins({
    coinType: getCoinType(coin_type),
    num: num * price,
    max:
      data.coinsThrowMaxCount,
    unit: data.coinsThrowUnit
  });
}

// 投掷电池或瓜子
function throwCoins({ coinType, num, max, unit }) {
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
function onGuardBuyHandler({ data: { guard_level, num } }) {
  if (!canGuard || !data.guardEnabled) return;
  canGuard = false;
  setTimeout(() => { canGuard = true }, data.guardCooldown * 1000);
  let giftName = `guard${guard_level}`;

  if (socket != null && data.guardThrows[giftName]) {
    var images = [], weights = [], scales = [], sounds = [], volumes = [];
    while (num > 0) {
      num--;
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
  if (msg_type !== 2) return;
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

function renderConsole(...args) {
  mainWindow.webContents.send("consoleLog", ...args);
}
