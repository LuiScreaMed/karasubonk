const { ipcRenderer } = require("electron");
const fs = require("fs");

const version = 1.06;

// ------
// Status
// ------

var status = 0;

const statusTitle = [
    "准备就绪！",
    "等待连接直播间...",
    "正在连接网页源...",
    "校准中 (1/2)",
    "校准中 (2/2)",
    "正在连接VTube Studio...",
    "校准",
    "正在激活弹幕事件...",
    "错误：端口被占用",
    "警告：版本不匹配",
    "警告：版本不匹配"
];

const statusDesc = [
    "",
    "<p>点击下方的“连接”按钮连接B站直播间。</p>",
    `<p>如果这条提示没有消失，请在OBS中刷新浏览器源。</p><p>提示：请在OBS中添加该路径下的本地文件为浏览器源（点击文本进行复制）： </p><p><input readonly id="bonkerInput"></p><p>（直播姬用户请直接粘贴在浏览器源的URL一栏）</p>`,
    "<p>请将VTS模型的头部移动至OBS浏览器源的标志上。</p><p>提示：您有可能因为将VTS源置于浏览器源上方导致无法看到标志。</p><p>单击 <mark>下一步</mark> 进行下一步校准</p>",
    "<p>请将VTS模型的头部移动至OBS浏览器源的标志上。</p><p>提示：您有可能因为将VTS源置于浏览器源上方导致无法看到标志。</p><p>单击 <mark>完成</mark> 完成校准</p>",
    ["<p>如果这条提示没有消失，请在OBS中刷新浏览器源。</p><p>如果刷新了浏览器源后仍然无效，请确认VTS中的API已经开启，并且端口为<mark>", "</mark>。</p>"],
    "<p>这项设置用于校准扔出物体的目标方位。</p><p>请点击 \"开始校准\" 进行校准。</p>",
    "",
    ["<p>端口：<mark>", "</mark> 被占用。</p><p>您可以尝试在 <mark>设置 -> 高级设置</mark> 中修改浏览器源的端口。</p><p>端口应在 1024 至 65535 的范围内。</p>"],
    "<p>KBonk 与浏览器源的版本不一致。</p><p>请确认OBS或直播姬中使用的浏览器源文件路径如下（点击文本进行复制）：</p><p><input readonly id='bonkerInput'></p><p>如果确认路径无误，请确认OBS中的源已经刷新。</p>",
    "<p>浏览器源没有返回版本号。</p><p>KBonk与浏览器源可能版本不一致。</p><p>请确认OBS或直播姬中使用的浏览器源文件路径如下（点击文本进行复制）：</p><p><input readonly id='bonkerInput'></p><p>如果确认路径无误，请确认OBS中的源已经刷新。</p>"
];

// consolelog
ipcRenderer.on("consoleLog", (_, ...args) => {
    console.log(...args);
})

// 连接房间状态改变
ipcRenderer.on("connectStatus", (_, status) => {
    setRoomInputStatus(status);
})

ipcRenderer.on("connected", () => {
    document.querySelector("#logout").innerText = "断开连接";
});

// bilibili 连接失败
ipcRenderer.on("biliConnectFailed", () => {
    showToast("B站直播间连接失败，请重试", ToastType.error);
})

// 房间号留空报错
ipcRenderer.on("roomidEmptyError", () => {
    showToast("请输入正确的房间号", ToastType.error);
    setRoomInputStatus(RoomInputStatus.disconnected);
})

// 获取表情回调
ipcRenderer.on("gettingExpression", () => {
    setExpressionDetailStatus(expressionDetailStatus.loading);
})

var userDataPath = null;
ipcRenderer.on("userDataPath", (event, message) => {
    userDataPath = message;
})
ipcRenderer.send("getUserDataPath");

// 设置app底部元素的disable
function setRoomidFormDisabled({ input, button }) {
    document.querySelector("#roomid").disabled = input;
    document.querySelector("#logout").disabled = button;
    document.querySelector("#logout").classList[button ? "add" : "remove"]("disabled");
}

// 连接浏览器源步骤时，路径文本框的复制功能
async function selectAndCopyBonkerPath() {
    this.select();
    await navigator.clipboard.writeText(this.value);
    showToast("已成功复制路径", ToastType.success);
}

// 仅允许输入数字
document.querySelector("#roomid").oninput = function () {
    this.value = this.value.replace(/\D/g, '');
}

// 点击连接房间
document.querySelector("#logout").addEventListener("click", async () => {
    let roomid = document.querySelector("#roomid").value;
    ipcRenderer.send("connect", roomid);
});

document.querySelector("#githubLink a").addEventListener("click", () => { ipcRenderer.send("link"); });

document.querySelector("#originalItchLink").addEventListener("click", () => {
    ipcRenderer.send("originalItchLink");
})
document.querySelector("#originalAuthorLink").addEventListener("click", () => {
    ipcRenderer.send("originalAuthorLink");
})
document.querySelector("#creditGithubLink").addEventListener("click", () => {
    ipcRenderer.send("creditGithubLink");
})
document.querySelector("#bilibiliLink").addEventListener("click", () => {
    ipcRenderer.send("bilibiliLink");
})

// 房间连接状态
const RoomInputStatus = {
    disconnected: 0,
    connecting: 1,
    connected: 2
}

// 房间连接部分的状设置
function setRoomInputStatus(status) {
    switch (status) {
        case RoomInputStatus.disconnected: {
            document.querySelector("#logout").innerText = "连接";
            setRoomidFormDisabled({ button: undefined, input: undefined });
            break;
        }
        case RoomInputStatus.connecting: {
            document.querySelector("#logout").innerText = "连接";
            setRoomidFormDisabled({ button: true, input: true });
            break;
        }
        case RoomInputStatus.connected: {
            document.querySelector("#logout").innerText = "断开连接";
            setRoomidFormDisabled({ button: undefined, input: true });
            break;
        }
    }
}

ipcRenderer.on("status", (event, message) => { setStatus(event, message); });

async function setStatus(_, message) {
    if (status == message) return;
    if (status == 2 || status == 9 || status == 10) {
        document.querySelector("#bonkerInput").removeEventListener("click", selectAndCopyBonkerPath);
    }
    status = message;
    document.querySelector("#status").innerHTML = statusTitle[status];
    document.querySelector("#headerStatusInner").innerHTML = statusTitle[status] + (status != 0 ? " (单击查看详情)" : "");

    if (status == 0) {
        document.querySelector("#headerStatus").classList.remove("errorText");
        document.querySelector("#headerStatus").classList.remove("workingText");
        document.querySelector("#headerStatus").classList.add("readyText");
    }
    else if (status == 8 || status == 9 || status == 10) {
        document.querySelector("#headerStatus").classList.add("errorText");
        document.querySelector("#headerStatus").classList.remove("workingText");
        document.querySelector("#headerStatus").classList.remove("readyText");
    }
    else {
        document.querySelector("#headerStatus").classList.remove("errorText");
        document.querySelector("#headerStatus").classList.add("workingText");
        document.querySelector("#headerStatus").classList.remove("readyText");
    }

    if (status == 5)
        document.querySelector("#statusDesc").innerHTML = statusDesc[status][0] + await getData("portVTubeStudio") + statusDesc[status][1];
    else if (status == 8)
        document.querySelector("#statusDesc").innerHTML = statusDesc[status][0] + await getData("portThrower") + statusDesc[status][1];
    else
        document.querySelector("#statusDesc").innerHTML = statusDesc[status];

    if (status == 2 || status == 9 || status == 10) {
        let bonkerPathInput = document.querySelector("#bonkerInput");
        bonkerPathInput.value = __dirname + '\\bonker.html';
        bonkerPathInput.addEventListener("click", selectAndCopyBonkerPath);
    }

    if (status == 3 || status == 4 || status == 6) {
        if (status == 6)
            document.querySelector("#nextCalibrate").querySelector(".innerTopButton").innerText = "开始校准";
        else if (status == 3)
            document.querySelector("#nextCalibrate").querySelector(".innerTopButton").innerText = "下一步";
        else if (status == 4)
            document.querySelector("#nextCalibrate").querySelector(".innerTopButton").innerText = "完成";
        document.querySelector("#calibrateButtons").classList.remove("hidden");
    }
    else
        document.querySelector("#calibrateButtons").classList.add("hidden");

    // 表情设置判断
    if (status == 0 || status == 3 || status == 4 || status == 6) {
        document.querySelector("#hitExpressionDetail .loadingMask").classList.remove("vtsDisconnect");
    } else {
        document.querySelector("#hitExpressionDetail .loadingMask").classList.add("vtsDisconnect");
    }
}

// ---------
// Libraries
// ---------

// Adding a new image to the list
document.querySelector("#newImage").addEventListener("click", () => { document.querySelector("#loadImage").click(); });
document.querySelector("#loadImage").addEventListener("change", loadImage);
// 替换图片回调
document.querySelector("#replaceImage").addEventListener("change", replaceImage);

async function loadImage() {
    var throws = await getData("throws");
    var files = document.querySelector("#loadImage").files;
    for (var i = 0; i < files.length; i++) {
        // Grab the image that was just loaded
        var imageFile = files[i];
        // If the folder for objects doesn't exist for some reason, make it
        if (!fs.existsSync(userDataPath + "/throws/"))
            fs.mkdirSync(userDataPath + "/throws/");

        // Ensure that we're not overwriting any existing files with the same name
        // If a file already exists, add an interating number to the end until it"s a unique filename
        var append = "";
        if (imageFile.path != userDataPath + "\\throws\\" + imageFile.name)
            while (fs.existsSync(userDataPath + "/throws/" + imageFile.name.substr(0, imageFile.name.lastIndexOf(".")) + append + imageFile.name.substr(imageFile.name.lastIndexOf("."))))
                append = append == "" ? 2 : (append + 1);
        var filename = imageFile.name.substr(0, imageFile.name.lastIndexOf(".")) + append + imageFile.name.substr(imageFile.name.lastIndexOf("."));

        // Make a copy of the file into the local folder
        fs.copyFileSync(imageFile.path, userDataPath + "/throws/" + filename);

        // Add the new image, update the data, and refresh the images page
        throws.unshift({
            "enabled": true,
            "location": "throws/" + filename,
            "weight": 1.0,
            "scale": 1.0,
            "sound": null,
            "volume": 1.0,
            "customs": []
        });
    }
    setData("throws", throws);
    openImages();
    copyFilesToDirectory();

    // Reset the image upload
    document.querySelector("#loadImage").value = null;
}

// 替换图片回调
async function replaceImage() {
    var throws = await getData("throws");
    var files = document.querySelector("#replaceImage").files;
    var imageFile = files[0];
    var location = throws[currentImageIndex].location;
    // 删除原图片
    fs.unlinkSync(userDataPath + "/" + location);

    // 将新图片复制并重命名
    var filename = location.substr(location.lastIndexOf("/") + 1, location.lastIndexOf(".") - (location.lastIndexOf("/") + 1)) + imageFile.name.substr(imageFile.name.lastIndexOf("."));
    fs.copyFileSync(imageFile.path, userDataPath + "/throws/" + filename);

    throws[currentImageIndex].location = "throws/" + filename;
    setData("throws", throws);
    openImages();
    copyFilesToDirectory();

    // Reset the image replace
    document.querySelector("#replaceImage").value = null;
}

document.querySelector("#imageTable").querySelector(".selectAll input").addEventListener("change", async () => {
    document.querySelector("#imageTable").querySelectorAll(".imageEnabled").forEach((element) => {
        element.checked = document.querySelector("#imageTable").querySelector(".selectAll input").checked;
    });
    var throws = await getData("throws");
    for (var i = 0; i < throws.length; i++)
        throws[i].enabled = document.querySelector("#imageTable").querySelector(".selectAll input").checked;
    setData("throws", throws);
});

async function openImages() {
    var throws = await getData("throws");

    document.querySelector("#imageTable").querySelectorAll(".imageRow").forEach((element) => { element.remove(); });

    var allEnabled = true;
    for (var i = 0; i < throws.length; i++) {
        if (!throws[i].enabled) {
            allEnabled = false;
            break;
        }
    }
    document.querySelector("#imageTable").querySelector(".selectAll input").checked = allEnabled;

    if (throws == null)
        setData("throws", []);
    else {
        throws.forEach((_, index) => {
            if (fs.existsSync(userDataPath + "/" + throws[index].location)) {
                var row = document.querySelector("#imageRow").cloneNode(true);
                row.removeAttribute("id");
                row.classList.add("imageRow");
                row.removeAttribute("hidden");
                document.querySelector("#imageTable").appendChild(row);

                row.querySelector(".imageLabel").innerText = throws[index].location.substr(throws[index].location.lastIndexOf('/') + 1);

                row.querySelector(".imageImage").src = userDataPath + "/" + throws[index].location;

                row.querySelector(".imageEnabled").checked = throws[index].enabled;
                row.querySelector(".imageEnabled").addEventListener("change", () => {
                    throws[index].enabled = row.querySelector(".imageEnabled").checked;
                    setData("throws", throws);

                    var allEnabled = true;
                    for (var i = 0; i < throws.length; i++) {
                        if (!throws[i].enabled) {
                            allEnabled = false;
                            break;
                        }
                    }
                    document.querySelector("#imageTable").querySelector(".selectAll input").checked = allEnabled;
                });

                row.querySelector(".imageDetails").addEventListener("click", () => {
                    currentImageIndex = index;
                    openImageDetails();
                    showPanel("imageDetails", true);
                });

                row.querySelector(".imageReplace").addEventListener("click", () => {
                    currentImageIndex = index;
                    document.querySelector("#replaceImage").click();
                })

                row.querySelector(".imageRemove").addEventListener("click", () => {
                    // 删除后删除文件
                    fs.unlinkSync(userDataPath + "/" + throws[index].location);
                    throws.splice(index, 1);
                    setData("throws", throws);
                    openImages();
                });
            }
            else {
                throws.splice(index, 1);
                setData("throws", throws);
            }
        });
    }
}

async function loadImageCustom(customName) {
    var throws = await getData("throws");
    var files = document.querySelector("#loadImageCustom").files;
    for (var i = 0; i < files.length; i++) {
        // Grab the image that was just loaded
        var imageFile = files[i];
        // If the folder for objects doesn't exist for some reason, make it
        if (!fs.existsSync(userDataPath + "/throws/"))
            fs.mkdirSync(userDataPath + "/throws/");

        // Ensure that we're not overwriting any existing files with the same name
        // If a file already exists, add an interating number to the end until it"s a unique filename
        var append = "";
        if (imageFile.path != userDataPath + "\\throws\\" + imageFile.name)
            while (fs.existsSync(userDataPath + "/throws/" + imageFile.name.substr(0, imageFile.name.lastIndexOf(".")) + append + imageFile.name.substr(imageFile.name.lastIndexOf("."))))
                append = append == "" ? 2 : (append + 1);
        var filename = imageFile.name.substr(0, imageFile.name.lastIndexOf(".")) + append + imageFile.name.substr(imageFile.name.lastIndexOf("."));

        // Make a copy of the file into the local folder
        fs.copyFileSync(imageFile.path, userDataPath + "/throws/" + filename);

        // Add the new image, update the data, and refresh the images page
        throws.unshift({
            "enabled": false,
            "location": "throws/" + filename,
            "weight": 1.0,
            "scale": 1.0,
            "sound": null,
            "volume": 1.0,
            "customs": [customName]
        });
    }
    setData("throws", throws);
    openImagesCustom(customName);
    copyFilesToDirectory();

    // Reset the image upload
    document.querySelector("#loadImageCustom").value = null;
}

async function openImagesCustom(customName) {
    // Refresh table to remove old event listeners
    var oldTable = document.querySelector("#imageTableCustom");
    var newTable = oldTable.cloneNode(true);
    oldTable.after(newTable);
    oldTable.remove();

    document.querySelector("#newImageCustom").addEventListener("click", () => { document.querySelector("#loadImageCustom").click(); });
    document.querySelector("#loadImageCustom").addEventListener("change", () => { loadImageCustom(customName); });

    var throws = await getData("throws");

    var allEnabled = true;
    for (var i = 0; i < throws.length; i++) {
        if (!throws[i].customs.includes(customName)) {
            allEnabled = false;
            break;
        }
    }
    document.querySelector("#imageTableCustom").querySelector(".selectAll input").checked = allEnabled;

    document.querySelector("#imageTableCustom").querySelector(".selectAll input").addEventListener("change", () => {
        document.querySelector("#imageTableCustom").querySelectorAll(".imageEnabled").forEach((element) => {
            element.checked = document.querySelector("#imageTableCustom").querySelector(".selectAll input").checked;
        });
        for (var i = 0; i < throws.length; i++) {
            if (document.querySelector("#imageTableCustom").querySelector(".selectAll input").checked && !throws[i].customs.includes(customName))
                throws[i].customs.push(customName);
            else if (!document.querySelector("#imageTableCustom").querySelector(".selectAll input").checked && throws[i].customs.includes(customName))
                throws[i].customs.splice(throws[i].customs.indexOf(customName), 1);
        }
        setData("throws", throws);
    });

    document.querySelector("#imageTableCustom").querySelectorAll(".imageRow").forEach((element) => { element.remove(); });

    if (throws == null)
        setData("throws", []);
    else {
        throws.forEach((_, index) => {
            if (fs.existsSync(userDataPath + "/" + throws[index].location)) {
                var row = document.querySelector("#imageRowCustom").cloneNode(true);
                row.removeAttribute("id");
                row.classList.add("imageRow");
                row.removeAttribute("hidden");
                document.querySelector("#imageTableCustom").appendChild(row);

                row.querySelector(".imageLabel").innerText = throws[index].location.substr(throws[index].location.lastIndexOf('/') + 1);

                row.querySelector(".imageImage").src = userDataPath + "/" + throws[index].location;

                row.querySelector(".imageEnabled").checked = throws[index].customs.includes(customName);
                row.querySelector(".imageEnabled").addEventListener("change", () => {
                    if (!row.querySelector(".imageEnabled").checked && throws[index].customs.includes(customName))
                        throws[index].customs.splice(throws[index].customs.indexOf(customName), 1);
                    else if (row.querySelector(".imageEnabled").checked && !throws[index].customs.includes(customName))
                        throws[index].customs.push(customName);
                    setData("throws", throws);

                    var allEnabled = true;
                    for (var i = 0; i < throws.length; i++) {
                        if (!throws[i].customs.includes(customName)) {
                            allEnabled = false;
                            break;
                        }
                    }
                    document.querySelector("#imageTableCustom").querySelector(".selectAll input").checked = allEnabled;
                });
            }
            else {
                throws.splice(index, 1);
                setData("throws", throws);
            }
        });
    }
}

async function loadSoundCustom(customName) {
    var impacts = await getData("impacts");
    var files = document.querySelector("#loadSoundCustom").files;
    for (var i = 0; i < files.length; i++) {
        var soundFile = files[i];
        if (!fs.existsSync(userDataPath + "/impacts/"))
            fs.mkdirSync(userDataPath + "/impacts/");

        var append = "";
        if (soundFile.path != userDataPath + "\\impacts\\" + soundFile.name)
            while (fs.existsSync(userDataPath + "/impacts/" + soundFile.name.substr(0, soundFile.name.lastIndexOf(".")) + append + soundFile.name.substr(soundFile.name.lastIndexOf("."))))
                append = append == "" ? 2 : (append + 1);
        var filename = soundFile.name.substr(0, soundFile.name.lastIndexOf(".")) + append + soundFile.name.substr(soundFile.name.lastIndexOf("."));

        fs.copyFileSync(soundFile.path, userDataPath + "/impacts/" + filename);

        impacts.unshift({
            "location": "impacts/" + filename,
            "volume": 1.0,
            "enabled": false,
            "customs": [customName]
        });
    }
    setData("impacts", impacts);
    openSoundsCustom(customName);
    copyFilesToDirectory();

    document.querySelector("#loadSoundCustom").value = null;
}

async function openSoundsCustom(customName) {
    // Refresh table to remove old event listeners
    var oldTable = document.querySelector("#soundTableCustom");
    var newTable = oldTable.cloneNode(true);
    oldTable.after(newTable);
    oldTable.remove();

    document.querySelector("#newSoundCustom").addEventListener("click", () => { document.querySelector("#loadSoundCustom").click(); });
    document.querySelector("#loadSoundCustom").addEventListener("change", () => { loadSoundCustom(customName); });

    var impacts = await getData("impacts");

    var allEnabled = true;
    for (var i = 0; i < impacts.length; i++) {
        if (!impacts[i].customs.includes(customName)) {
            allEnabled = false;
            break;
        }
    }
    document.querySelector("#soundTableCustom").querySelector(".selectAll input").checked = allEnabled;

    document.querySelector("#soundTableCustom").querySelector(".selectAll input").addEventListener("change", () => {
        document.querySelector("#soundTableCustom").querySelectorAll(".imageEnabled").forEach((element) => {
            element.checked = document.querySelector("#soundTableCustom").querySelector(".selectAll input").checked;
        });
        for (var i = 0; i < impacts.length; i++) {
            if (document.querySelector("#soundTableCustom").querySelector(".selectAll input").checked && !impacts[i].customs.includes(customName))
                impacts[i].customs.push(customName);
            else if (!document.querySelector("#soundTableCustom").querySelector(".selectAll input").checked && impacts[i].customs.includes(customName))
                impacts[i].customs.splice(impacts[i].customs.indexOf(customName), 1);
        }
        setData("impacts", impacts);
    });

    document.querySelector("#soundTableCustom").querySelectorAll(".soundRow").forEach((element) => { element.remove(); });

    if (impacts == null)
        setData("impacts", []);
    else {
        impacts.forEach((_, index) => {
            if (fs.existsSync(userDataPath + "/" + impacts[index].location)) {
                var row = document.querySelector("#soundRowCustom").cloneNode(true);
                row.removeAttribute("id");
                row.classList.add("soundRow");
                row.removeAttribute("hidden");
                row.querySelector(".imageLabel").innerText = impacts[index].location.substr(impacts[index].location.lastIndexOf('/') + 1);
                document.querySelector("#soundTableCustom").appendChild(row);

                row.querySelector(".imageEnabled").checked = impacts[index].customs.includes(customName);
                row.querySelector(".imageEnabled").addEventListener("change", () => {
                    if (!row.querySelector(".imageEnabled").checked && impacts[index].customs.includes(customName))
                        impacts[index].customs.splice(impacts[index].customs.indexOf(customName), 1);
                    else if (row.querySelector(".imageEnabled").checked && !impacts[index].customs.includes(customName))
                        impacts[index].customs.push(customName);
                    setData("impacts", impacts);

                    for (var i = 0; i < impacts.length; i++) {
                        if (!impacts[i].customs.includes(customName)) {
                            allEnabled = false;
                            break;
                        }
                    }
                    document.querySelector("#soundTableCustom").querySelector(".selectAll input").checked = allEnabled;
                });
            }
            else {
                impacts.splice(index, 1);
                setData("impacts", impacts);
            }
        });
    }
}

async function loadImpactDecal(customName) {
    var customBonks = await getData("customBonks");
    var files = document.querySelector("#loadImpactDecal").files;
    for (var i = 0; i < files.length; i++) {
        var imageFile = files[i];
        if (!fs.existsSync(userDataPath + "/decals/"))
            fs.mkdirSync(userDataPath + "/decals/");

        var append = "";
        if (imageFile.path != userDataPath + "\\decals\\" + imageFile.name)
            while (fs.existsSync(userDataPath + "/decals/" + imageFile.name.substr(0, imageFile.name.lastIndexOf(".")) + append + imageFile.name.substr(imageFile.name.lastIndexOf("."))))
                append = append == "" ? 2 : (append + 1);
        var filename = imageFile.name.substr(0, imageFile.name.lastIndexOf(".")) + append + imageFile.name.substr(imageFile.name.lastIndexOf("."));

        fs.copyFileSync(imageFile.path, userDataPath + "/decals/" + filename);

        customBonks[customName].impactDecals.unshift({
            "location": "decals/" + filename,
            "duration": 0.25,
            "scale": 1,
            "enabled": true
        });
    }
    setData("customBonks", customBonks);
    openImpactDecals(customName);
    copyFilesToDirectory();

    document.querySelector("#loadImpactDecal").value = null;
}

async function openImpactDecals(customName) {
    // Refresh table to remove old event listeners
    var oldTable = document.querySelector("#impactDecalsTable");
    var newTable = oldTable.cloneNode(true);
    oldTable.after(newTable);
    oldTable.remove();

    document.querySelector("#newImpactDecal").addEventListener("click", () => { document.querySelector("#loadImpactDecal").click(); });
    document.querySelector("#loadImpactDecal").addEventListener("change", () => { loadImpactDecal(customName) });

    var customBonks = await getData("customBonks");

    var allEnabled = true;
    for (var i = 0; i < customBonks[customName].impactDecals.length; i++) {
        if (!customBonks[customName].impactDecals[i].enabled) {
            allEnabled = false;
            break;
        }
    }
    document.querySelector("#impactDecalsTable").querySelector(".selectAll input").checked = allEnabled;

    document.querySelector("#impactDecalsTable").querySelector(".selectAll input").addEventListener("change", async () => {
        document.querySelector("#impactDecalsTable").querySelectorAll(".imageEnabled").forEach((element) => {
            element.checked = document.querySelector("#impactDecalsTable").querySelector(".selectAll input").checked;
        });
        for (var i = 0; i < customBonks[customName].impactDecals.length; i++)
            customBonks[customName].impactDecals[i].enabled = document.querySelector("#impactDecalsTable").querySelector(".selectAll input").checked;
        setData("customBonks", customBonks);
    });

    document.querySelector("#impactDecalsTable").querySelectorAll(".imageRow").forEach((element) => { element.remove(); });

    customBonks[customName].impactDecals.forEach((_, index) => {
        if (fs.existsSync(userDataPath + "/" + customBonks[customName].impactDecals[index].location)) {
            var row = document.querySelector("#impactDecalRow").cloneNode(true);
            row.removeAttribute("id");
            row.classList.add("imageRow");
            row.removeAttribute("hidden");
            row.querySelector(".imageLabel").innerText = customBonks[customName].impactDecals[index].location.substr(customBonks[customName].impactDecals[index].location.lastIndexOf('/') + 1);
            document.querySelector("#impactDecalsTable").appendChild(row);

            row.querySelector(".imageImage").src = userDataPath + "/" + customBonks[customName].impactDecals[index].location;

            row.querySelector(".imageRemove").addEventListener("click", () => {
                customBonks[customName].impactDecals.splice(index, 1);
                setData("customBonks", customBonks);
                openImpactDecals(customName);
            });

            row.querySelector(".imageEnabled").checked = customBonks[customName].impactDecals[index].enabled;
            row.querySelector(".imageEnabled").addEventListener("change", () => {
                customBonks[customName].impactDecals[index].enabled = row.querySelector(".imageEnabled").checked;
                setData("customBonks", customBonks);

                var allEnabled = true;
                for (var i = 0; i < customBonks[customName].impactDecals.length; i++) {
                    if (!customBonks[customName].impactDecals[i].enabled) {
                        allEnabled = false;
                        break;
                    }
                }
                document.querySelector("#impactDecalsTable").querySelector(".selectAll input").checked = allEnabled;
            });

            row.querySelector(".decalDuration").value = customBonks[customName].impactDecals[index].duration;
            row.querySelector(".decalDuration").addEventListener("change", () => {
                clampValue(row.querySelector(".decalDuration").value, 0, null);
                customBonks[customName].impactDecals[index].duration = parseFloat(row.querySelector(".decalDuration").value);
                setData("customBonks", customBonks);
            });

            row.querySelector(".decalScale").value = customBonks[customName].impactDecals[index].scale;
            row.querySelector(".decalScale").addEventListener("change", () => {
                clampValue(row.querySelector(".decalScale"), 0, null);
                customBonks[customName].impactDecals[index].scale = parseFloat(row.querySelector(".decalScale").value);
                setData("customBonks", customBonks);
            });
        }
        else {
            customBonks[customName].impactDecals.splice(index, 1);
            setData("customBonks", customBonks);
        }
    });
}

async function loadWindupSound(customName) {
    var customBonks = await getData("customBonks");
    var files = document.querySelector("#loadWindupSound").files;
    for (var i = 0; i < files.length; i++) {
        var soundFile = files[i];
        if (!fs.existsSync(userDataPath + "/windups/"))
            fs.mkdirSync(userDataPath + "/windups/");

        var append = "";
        if (soundFile.path != userDataPath + "\\windups\\" + soundFile.name)
            while (fs.existsSync(userDataPath + "/windups/" + soundFile.name.substr(0, soundFile.name.lastIndexOf(".")) + append + soundFile.name.substr(soundFile.name.lastIndexOf("."))))
                append = append == "" ? 2 : (append + 1);
        var filename = soundFile.name.substr(0, soundFile.name.lastIndexOf(".")) + append + soundFile.name.substr(soundFile.name.lastIndexOf("."));

        fs.copyFileSync(soundFile.path, userDataPath + "/windups/" + filename);

        customBonks[customName].windupSounds.unshift({
            "location": "windups/" + filename,
            "volume": 1.0,
            "enabled": true
        });
    }
    setData("customBonks", customBonks);
    openWindupSounds(customName);
    copyFilesToDirectory();

    document.querySelector("#loadWindupSound").value = null;
}

async function openWindupSounds(customName) {
    // Refresh table to remove old event listeners
    var oldTable = document.querySelector("#windupSoundTable");
    var newTable = oldTable.cloneNode(true);
    oldTable.after(newTable);
    oldTable.remove();

    document.querySelector("#newWindupSound").addEventListener("click", () => { document.querySelector("#loadWindupSound").click(); });
    document.querySelector("#loadWindupSound").addEventListener("change", () => { loadWindupSound(customName) });

    var customBonks = await getData("customBonks");

    var allEnabled = true;
    for (var i = 0; i < customBonks[customName].windupSounds.length; i++) {
        if (!customBonks[customName].windupSounds[i].enabled) {
            allEnabled = false;
            break;
        }
    }
    document.querySelector("#windupSoundTable").querySelector(".selectAll input").checked = allEnabled;

    document.querySelector("#windupSoundTable").querySelector(".selectAll input").addEventListener("change", async () => {
        document.querySelector("#windupSoundTable").querySelectorAll(".imageEnabled").forEach((element) => {
            element.checked = document.querySelector("#windupSoundTable").querySelector(".selectAll input").checked;
        });
        for (var i = 0; i < customBonks[customName].windupSounds.length; i++)
            customBonks[customName].windupSounds[i].enabled = document.querySelector("#windupSoundTable").querySelector(".selectAll input").checked;
        setData("customBonks", customBonks);
    });

    document.querySelector("#windupSoundTable").querySelectorAll(".soundRow").forEach((element) => { element.remove(); });

    customBonks[customName].windupSounds.forEach((_, index) => {
        if (fs.existsSync(userDataPath + "/" + customBonks[customName].windupSounds[index].location)) {
            var row = document.querySelector("#windupSoundRow").cloneNode(true);
            row.removeAttribute("id");
            row.classList.add("soundRow");
            row.removeAttribute("hidden");
            row.querySelector(".imageLabel").innerText = customBonks[customName].windupSounds[index].location.substr(customBonks[customName].windupSounds[index].location.lastIndexOf('/') + 1);
            document.querySelector("#windupSoundTable").appendChild(row);

            row.querySelector(".imageRemove").addEventListener("click", () => {
                customBonks[customName].windupSounds.splice(index, 1);
                setData("customBonks", customBonks);
                openWindupSounds(customName);
            });

            row.querySelector(".imageEnabled").checked = customBonks[customName].windupSounds[index].enabled;
            row.querySelector(".imageEnabled").addEventListener("change", () => {
                customBonks[customName].windupSounds[index].enabled = row.querySelector(".imageEnabled").checked;
                setData("customBonks", customBonks);

                var allEnabled = true;
                for (var i = 0; i < customBonks[customName].windupSounds.length; i++) {
                    if (!customBonks[customName].windupSounds[i].enabled) {
                        allEnabled = false;
                        break;
                    }
                }
                document.querySelector("#windupSoundTable").querySelector(".selectAll input").checked = allEnabled;
            });

            row.querySelector(".soundVolume").value = customBonks[customName].windupSounds[index].volume;
            row.querySelector(".soundVolume").addEventListener("change", () => {
                clampValue(row.querySelector(".soundVolume"), 0, 1);
                customBonks[customName].windupSounds[index].volume = parseFloat(row.querySelector(".soundVolume").value);
                setData("customBonks", customBonks);
            });
        }
        else {
            customBonks[customName].windupSounds.splice(index, 1);
            setData("customBonks", customBonks);
        }
    });
}

document.querySelector("#guard3").querySelector(".guardImageScale").addEventListener("change", async () => {
    var guardThrows = await getData("guardThrows");
    guardThrows.guard3.scale = parseFloat(document.querySelector("#guard3").querySelector(".guardImageScale").value);
    setData("guardThrows", guardThrows);
});
document.querySelector("#guardImageAdd3").addEventListener("click", () => { document.querySelector("#loadGuardImage3").click(); });
document.querySelector("#loadGuardImage3").addEventListener("change", () => { loadGuardImage("3") });

document.querySelector("#guard2").querySelector(".guardImageScale").addEventListener("change", async () => {
    var guardThrows = await getData("guardThrows");
    guardThrows.guard2.scale = parseFloat(document.querySelector("#guard2").querySelector(".guardImageScale").value);
    setData("guardThrows", guardThrows);
});
document.querySelector("#guardImageAdd2").addEventListener("click", () => { document.querySelector("#loadGuardImage2").click(); });
document.querySelector("#loadGuardImage2").addEventListener("change", () => { loadGuardImage("2") });

document.querySelector("#guard1").querySelector(".guardImageScale").addEventListener("change", async () => {
    var guardThrows = await getData("guardThrows");
    guardThrows.guard1.scale = parseFloat(document.querySelector("#guard1").querySelector(".guardImageScale").value);
    setData("guardThrows", guardThrows);
});
document.querySelector("#guardImageAdd1").addEventListener("click", () => { document.querySelector("#loadGuardImage1").click(); });
document.querySelector("#loadGuardImage1").addEventListener("change", () => { loadGuardImage("1") });

async function loadGuardImage(key) {
    var guardThrows = await getData("guardThrows");
    var files = document.querySelector("#loadGuardImage" + key).files;
    // Grab the image that was just loaded
    var imageFile = files[0];
    // If the folder for objects doesn't exist for some reason, make it
    if (!fs.existsSync(userDataPath + "/throws/"))
        fs.mkdirSync(userDataPath + "/throws/");

    // Ensure that we're not overwriting any existing files with the same name
    // If a file already exists, add an interating number to the end until it"s a unique filename
    var append = "";
    if (imageFile.path != userDataPath + "\\throws\\" + imageFile.name)
        while (fs.existsSync(userDataPath + "/throws/" + imageFile.name.substr(0, imageFile.name.lastIndexOf(".")) + append + imageFile.name.substr(imageFile.name.lastIndexOf("."))))
            append = append == "" ? 2 : (append + 1);
    var filename = imageFile.name.substr(0, imageFile.name.lastIndexOf(".")) + append + imageFile.name.substr(imageFile.name.lastIndexOf("."));

    // Make a copy of the file into the local folder
    fs.copyFileSync(imageFile.path, userDataPath + "/throws/" + filename);

    // Add the new image, update the data, and refresh the images page
    guardThrows[`guard${key}`].location = "throws/" + filename;
    setData("guardThrows", guardThrows);
    openGuardImages();
    copyFilesToDirectory();

    // Reset the image upload
    document.querySelector("#loadGuardImage" + key).value = null;
}

async function openGuardImages() {
    var guardThrows = await getData("guardThrows");

    if (guardThrows == null) {
        guardThrows = defaultData.guardThrows;
        setData("guardThrows", guardThrows);
    }

    document.querySelector("#guard3").querySelector(".imageImage").src = userDataPath + "/" + guardThrows.guard3.location;
    document.querySelector("#guard3").querySelector(".guardImageScale").value = guardThrows.guard3.scale;

    document.querySelector("#guard2").querySelector(".imageImage").src = userDataPath + "/" + guardThrows.guard2.location;
    document.querySelector("#guard2").querySelector(".guardImageScale").value = guardThrows.guard2.scale;

    document.querySelector("#guard1").querySelector(".imageImage").src = userDataPath + "/" + guardThrows.guard1.location;
    document.querySelector("#guard1").querySelector(".guardImageScale").value = guardThrows.guard1.scale;
}

// 电池瓜子操作
document.querySelector("#coinBattery").querySelector(".coinImageScale").addEventListener("change", async () => {
    let coinThrows = await getData("coinThrows");
    coinThrows.battery.scale = parseFloat(document.querySelector("#coinBattery").querySelector(".coinImageScale").value);
    setData("coinThrows", coinThrows);
});
document.querySelector("#coinBatteryAdd").addEventListener("click", () => {
    document.querySelector("#loadCoinImagebattery").click();
});
document.querySelector("#loadCoinImagebattery").addEventListener("change", () => {
    loadCoinImage("battery");
})

document.querySelector("#coinSilver").querySelector(".coinImageScale").addEventListener("change", async () => {
    let coinThrows = await getData("coinThrows");
    coinThrows.silver.scale = parseFloat(document.querySelector("#coinSilver").querySelector(".coinImageScale").value);
    setData("coinThrows", coinThrows);
});
document.querySelector("#coinSilverAdd").addEventListener("click", () => {
    document.querySelector("#loadCoinImagesilver").click();
});
document.querySelector("#loadCoinImagesilver").addEventListener("change", () => {
    loadCoinImage("silver");
})

// 加载电池瓜子图片
async function loadCoinImage(key) {
    var coinThrows = await getData("coinThrows");
    var files = document.querySelector("#loadCoinImage" + key).files;
    // Grab the image that was just loaded
    var imageFile = files[0];
    // If the folder for objects doesn't exist for some reason, make it
    if (!fs.existsSync(userDataPath + "/throws/"))
        fs.mkdirSync(userDataPath + "/throws/");

    // Ensure that we're not overwriting any existing files with the same name
    // If a file already exists, add an interating number to the end until it"s a unique filename
    var append = "";
    if (imageFile.path != userDataPath + "\\throws\\" + imageFile.name)
        while (fs.existsSync(userDataPath + "/throws/" + imageFile.name.substr(0, imageFile.name.lastIndexOf(".")) + append + imageFile.name.substr(imageFile.name.lastIndexOf("."))))
            append = append == "" ? 2 : (append + 1);
    var filename = imageFile.name.substr(0, imageFile.name.lastIndexOf(".")) + append + imageFile.name.substr(imageFile.name.lastIndexOf("."));

    // Make a copy of the file into the local folder
    fs.copyFileSync(imageFile.path, userDataPath + "/throws/" + filename);

    // Add the new image, update the data, and refresh the images page
    coinThrows[key].location = "throws/" + filename;
    setData("coinThrows", coinThrows);
    openCoinImages();
    copyFilesToDirectory();

    // Reset the image upload
    document.querySelector("#loadCoinImage" + key).value = null;
}

async function openCoinImages() {
    var coinThrows = await getData("coinThrows");

    if (coinThrows == null) {
        coinThrows = defaultData.coinThrows;
        setData("coinThrows", coinThrows);
    }

    document.querySelector("#coinBattery").querySelector(".imageImage").src = userDataPath + "/" + coinThrows.battery.location;
    document.querySelector("#coinBattery").querySelector(".coinImageScale").value = coinThrows.battery.scale;

    document.querySelector("#coinSilver").querySelector(".imageImage").src = userDataPath + "/" + coinThrows.silver.location;
    document.querySelector("#coinSilver").querySelector(".coinImageScale").value = coinThrows.silver.scale;
}

document.querySelector("#loadImageSound").addEventListener("change", loadImageSound);

async function loadImageSound() {
    // Grab the image that was just loaded
    var soundFile = document.querySelector("#loadImageSound").files[0];
    // If the folder for objects doesn"t exist for some reason, make it
    if (!fs.existsSync(userDataPath + "/impacts/"))
        fs.mkdirSync(userDataPath + "/impacts/");

    // Ensure that we're not overwriting any existing files with the same name
    // If a file already exists, add an interating number to the end until it"s a unique filename
    var append = "";
    if (soundFile.path != userDataPath + "\\impacts\\" + soundFile.name)
        while (fs.existsSync(userDataPath + "/impacts/" + soundFile.name.substr(0, soundFile.name.lastIndexOf(".")) + append + soundFile.name.substr(soundFile.name.lastIndexOf("."))))
            append = append == "" ? 2 : (append + 1);
    var filename = soundFile.name.substr(0, soundFile.name.lastIndexOf(".")) + append + soundFile.name.substr(soundFile.name.lastIndexOf("."));

    // Make a copy of the file into the local folder
    fs.copyFileSync(soundFile.path, userDataPath + "/impacts/" + filename);

    // Get the existing images, add the new image, update the data, and refresh the images page
    var throws = await getData("throws");
    throws[currentImageIndex].sound = "impacts/" + filename;
    setData("throws", throws);

    // Reset the image upload
    document.querySelector("#loadImageSound").value = null;
    openImageDetails(currentImageIndex);
    copyFilesToDirectory();
}

var currentImageIndex = -1;
async function openImageDetails() {
    var throws = await getData("throws");

    // Refresh nodes to remove old listeners
    var oldButton = document.querySelector("#testImage");
    var newButton = document.querySelector("#testImage").cloneNode(true);
    oldButton.after(newButton);
    oldButton.remove();

    var oldTable = document.querySelector("#testImage");
    var newTable = oldTable.cloneNode(true);
    oldTable.after(newTable);
    oldTable.remove();

    document.querySelector("#testImage").addEventListener("click", () => testItem(currentImageIndex));

    const details = document.querySelector("#imageDetails");

    details.querySelector(".imageLabel").innerText = throws[currentImageIndex].location.substr(throws[currentImageIndex].location.lastIndexOf('/') + 1);

    details.querySelector(".imageImage").src = userDataPath + "/" + throws[currentImageIndex].location;
    details.querySelector(".imageImage").style.transform = "scale(" + throws[currentImageIndex].scale + ")";
    details.querySelector(".imageWeight").value = throws[currentImageIndex].weight;
    details.querySelector(".imageScale").value = throws[currentImageIndex].scale;
    if (throws[currentImageIndex].sound != null) {
        details.querySelector(".imageSoundName").value = throws[currentImageIndex].sound.substr(8);
        details.querySelector(".imageSoundRemove").removeAttribute("disabled");
    }
    else {
        details.querySelector(".imageSoundName").value = null;
        details.querySelector(".imageSoundRemove").disabled = "disabled";
    }

    details.querySelector(".imageWeight").addEventListener("change", () => {
        throws[currentImageIndex].weight = parseFloat(details.querySelector(".imageWeight").value);
        setData("throws", throws);
    });

    details.querySelector(".imageScale").addEventListener("change", () => {
        throws[currentImageIndex].scale = parseFloat(details.querySelector(".imageScale").value);
        details.querySelector(".imageImage").style.transform = "scale(" + throws[currentImageIndex].scale + ")";
        setData("throws", throws);
    });

    details.querySelector(".imageSoundVolume").value = throws[currentImageIndex].volume;
    details.querySelector(".imageSoundVolume").addEventListener("change", () => {
        throws[currentImageIndex].volume = parseFloat(details.querySelector(".imageSoundVolume").value);
        setData("throws", throws);
    });

    details.querySelector(".imageSoundRemove").addEventListener("click", () => {
        throws[currentImageIndex].sound = null;
        setData("throws", throws);
        details.querySelector(".imageSoundName").value = null;
        details.querySelector(".imageSoundRemove").disabled = "disabled";
    });

}

// 击中音效
document.querySelector("#newSound").addEventListener("click", () => { document.querySelector("#loadSound").click(); });
document.querySelector("#loadSound").addEventListener("change", loadSound);
// 替换音频回调
document.querySelector("#replaceSound").addEventListener("change", replaceSound);

var currentSoundIndex = -1;

async function loadSound() {
    var impacts = await getData("impacts");
    var files = document.querySelector("#loadSound").files;
    for (var i = 0; i < files.length; i++) {
        var soundFile = files[i];
        if (!fs.existsSync(userDataPath + "/impacts/"))
            fs.mkdirSync(userDataPath + "/impacts/");

        var append = "";
        if (soundFile.path != userDataPath + "\\impacts\\" + soundFile.name)
            while (fs.existsSync(userDataPath + "/impacts/" + soundFile.name.substr(0, soundFile.name.lastIndexOf(".")) + append + soundFile.name.substr(soundFile.name.lastIndexOf("."))))
                append = append == "" ? 2 : (append + 1);
        var filename = soundFile.name.substr(0, soundFile.name.lastIndexOf(".")) + append + soundFile.name.substr(soundFile.name.lastIndexOf("."));

        fs.copyFileSync(soundFile.path, userDataPath + "/impacts/" + filename);

        impacts.unshift({
            "location": "impacts/" + filename,
            "volume": 1.0,
            "enabled": true,
            "coins": false,
            "guards": false,
            "customs": []
        });
    }
    setData("impacts", impacts);
    openSounds();
    copyFilesToDirectory();

    document.querySelector("#loadSound").value = null;
}

// 替换击中音效回调
async function replaceSound() {
    var impacts = await getData("impacts");
    var files = document.querySelector("#replaceSound").files;
    var soundFile = files[0];
    var location = impacts[currentSoundIndex].location;

    // 删除原音效
    fs.unlinkSync(userDataPath + "/" + location);

    // 将新音效复制并重命名
    var filename = location.substr(location.lastIndexOf("/") + 1, location.lastIndexOf(".") - (location.lastIndexOf("/") + 1)) + soundFile.name.substr(soundFile.name.lastIndexOf("."));
    fs.copyFileSync(soundFile.path, userDataPath + "/impacts/" + filename);

    impacts[currentSoundIndex].location = "impacts/" + filename;
    setData("impacts", impacts);
    openSounds();
    copyFilesToDirectory();

    // Reset the sound replace
    document.querySelector("#replaceSound").value = null;
}

document.querySelector("#soundTable").querySelector(".selectAll input").addEventListener("change", async () => {
    document.querySelector("#soundTable").querySelectorAll(".imageEnabled").forEach((element) => {
        element.checked = document.querySelector("#soundTable").querySelector(".selectAll input").checked;
    });
    var impacts = await getData("impacts");
    for (var i = 0; i < impacts.length; i++)
        impacts[i].enabled = document.querySelector("#soundTable").querySelector(".selectAll input").checked;
    setData("impacts", impacts);
});

async function openSounds() {
    var impacts = await getData("impacts");

    document.querySelector("#soundTable").querySelectorAll(".soundRow").forEach((element) => { element.remove(); });

    if (impacts == null)
        setData("impacts", []);
    else {
        impacts.forEach((_, index) => {
            if (fs.existsSync(userDataPath + "/" + impacts[index].location)) {
                var row = document.querySelector("#soundRow").cloneNode(true);
                row.removeAttribute("id");
                row.classList.add("soundRow");
                row.removeAttribute("hidden");
                row.querySelector(".imageLabel").innerText = impacts[index].location.substr(impacts[index].location.lastIndexOf('/') + 1);
                document.querySelector("#soundTable").appendChild(row);

                // 受击音效预览
                row.querySelector(".soundPreview").addEventListener("click", () => {
                    previewAudio(impacts[index].location, impacts[index].volume);
                })

                row.querySelector(".imageRemove").addEventListener("click", () => {// 删除后删除文件
                    fs.unlinkSync(userDataPath + "/" + impacts[index].location);
                    impacts.splice(index, 1);
                    setData("impacts", impacts);
                    openSounds();
                });

                row.querySelector(".soundReplace").addEventListener("click", () => {
                    currentSoundIndex = index;
                    document.querySelector("#replaceSound").click();
                })

                row.querySelector(".imageEnabled").checked = impacts[index].enabled;
                row.querySelector(".imageEnabled").addEventListener("change", () => {
                    impacts[index].enabled = row.querySelector(".imageEnabled").checked;
                    setData("impacts", impacts);

                    var allEnabled = true;
                    for (var i = 0; i < impacts.length; i++) {
                        if (!impacts[i].enabled) {
                            allEnabled = false;
                            break;
                        }
                    }
                    document.querySelector("#soundTable").querySelector(".selectAll input").checked = allEnabled;
                });

                row.querySelector(".soundVolume").value = impacts[index].volume;
                row.querySelector(".soundVolume").addEventListener("change", () => {
                    clampValue(row.querySelector(".soundVolume"), 0, 1);
                    impacts[index].volume = parseFloat(row.querySelector(".soundVolume").value);
                    setData("impacts", impacts);
                });
            }
            else {
                impacts.splice(index, 1);
                setData("impacts", impacts);
            }
        });
    }
}

// 大航海音效操作
document.querySelector("#newGuardSound").addEventListener("click", () => { document.querySelector("#loadGuardSound").click(); });
document.querySelector("#loadGuardSound").addEventListener("change", loadGuardSound);

async function loadGuardSound() {
    var impacts = await getData("impacts");
    var files = document.querySelector("#loadGuardSound").files;
    for (var i = 0; i < files.length; i++) {
        var soundFile = files[i];
        if (!fs.existsSync(userDataPath + "/impacts/"))
            fs.mkdirSync(userDataPath + "/impacts/");

        var append = "";
        while (fs.existsSync(userDataPath + "/impacts/" + soundFile.name.substr(0, soundFile.name.lastIndexOf(".")) + append + soundFile.name.substr(soundFile.name.lastIndexOf("."))))
            append = append == "" ? 2 : (append + 1);
        var filename = soundFile.name.substr(0, soundFile.name.lastIndexOf(".")) + append + soundFile.name.substr(soundFile.name.lastIndexOf("."));

        fs.copyFileSync(soundFile.path, userDataPath + "/impacts/" + filename);

        impacts.unshift({
            "location": "impacts/" + filename,
            "volume": 1.0,
            "enabled": false,
            "coins": false,
            "guards": true,
            "customs": []
        });
    }
    setData("impacts", impacts);
    openGuardSounds();
    copyFilesToDirectory();

    document.querySelector("#loadGuardSound").value = null;
}

document.querySelector("#guardSoundTable").querySelector(".selectAll input").addEventListener("change", async () => {
    document.querySelector("#guardSoundTable").querySelectorAll(".imageEnabled").forEach((element) => {
        element.checked = document.querySelector("#guardSoundTable").querySelector(".selectAll input").checked;
    });
    var impacts = await getData("impacts");
    for (var i = 0; i < impacts.length; i++)
        impacts[i].guards = document.querySelector("#guardSoundTable").querySelector(".selectAll input").checked;
    setData("impacts", impacts);
});

async function openGuardSounds() {
    var impacts = await getData("impacts");

    document.querySelectorAll(".guardSoundRow").forEach((element) => { element.remove(); });

    if (impacts == null)
        setData("impacts", []);
    else {
        impacts.forEach((_, index) => {
            if (fs.existsSync(userDataPath + "/" + impacts[index].location)) {
                var row = document.querySelector("#guardSoundRow").cloneNode(true);
                row.removeAttribute("id");
                row.classList.add("guardSoundRow");
                row.removeAttribute("hidden");
                row.querySelector(".imageLabel").innerText = impacts[index].location.substr(impacts[index].location.lastIndexOf('/') + 1);
                document.querySelector("#guardSoundTable").appendChild(row);

                row.querySelector(".imageEnabled").checked = impacts[index].guards;
                row.querySelector(".imageEnabled").addEventListener("change", () => {
                    impacts[index].guards = row.querySelector(".imageEnabled").checked;
                    setData("impacts", impacts);

                    var allEnabled = true;
                    for (var i = 0; i < impacts.length; i++) {
                        if (!impacts[i].guards) {
                            allEnabled = false;
                            break;
                        }
                    }
                    document.querySelector("#guardSoundTable").querySelector(".selectAll input").checked = allEnabled;
                });
            }
            else {
                impacts.splice(index, 1);
                setData("impacts", impacts);
            }
        });
    }
}

// 电池瓜子音效操作
document.querySelector("#newCoinSound").addEventListener("click", () => { document.querySelector("#loadCoinSound").click(); });
document.querySelector("#loadCoinSound").addEventListener("change", loadCoinSound);

async function loadCoinSound() {
    var impacts = await getData("impacts");
    var files = document.querySelector("#loadCoinSound").files;
    for (var i = 0; i < files.length; i++) {
        var soundFile = files[i];
        if (!fs.existsSync(userDataPath + "/impacts/"))
            fs.mkdirSync(userDataPath + "/impacts/");

        var append = "";
        while (fs.existsSync(userDataPath + "/impacts/" + soundFile.name.substr(0, soundFile.name.lastIndexOf(".")) + append + soundFile.name.substr(soundFile.name.lastIndexOf("."))))
            append = append == "" ? 2 : (append + 1);
        var filename = soundFile.name.substr(0, soundFile.name.lastIndexOf(".")) + append + soundFile.name.substr(soundFile.name.lastIndexOf("."));

        fs.copyFileSync(soundFile.path, userDataPath + "/impacts/" + filename);

        impacts.unshift({
            "location": "impacts/" + filename,
            "volume": 1.0,
            "enabled": false,
            "coins": true,
            "guards": false,
            "customs": []
        });
    }
    setData("impacts", impacts);
    openCoinSounds();
    copyFilesToDirectory();

    document.querySelector("#loadCoinSound").value = null;
}

document.querySelector("#coinSoundTable").querySelector(".selectAll input").addEventListener("change", async () => {
    document.querySelector("#coinSoundTable").querySelectorAll(".imageEnabled").forEach((element) => {
        element.checked = document.querySelector("#coinSoundTable").querySelector(".selectAll input").checked;
    });
    var impacts = await getData("impacts");
    for (var i = 0; i < impacts.length; i++)
        impacts[i].coins = document.querySelector("#coinSoundTable").querySelector(".selectAll input").checked;
    setData("impacts", impacts);
});

async function openCoinSounds() {
    var impacts = await getData("impacts");

    document.querySelectorAll(".coinSoundRow").forEach((element) => { element.remove(); });

    if (impacts == null)
        setData("impacts", []);
    else {
        impacts.forEach((_, index) => {
            if (fs.existsSync(userDataPath + "/" + impacts[index].location)) {
                var row = document.querySelector("#coinSoundRow").cloneNode(true);
                row.removeAttribute("id");
                row.classList.add("coinSoundRow");
                row.removeAttribute("hidden");
                row.querySelector(".imageLabel").innerText = impacts[index].location.substr(impacts[index].location.lastIndexOf('/') + 1);
                document.querySelector("#coinSoundTable").appendChild(row);

                row.querySelector(".imageEnabled").checked = impacts[index].coins;
                row.querySelector(".imageEnabled").addEventListener("change", () => {
                    impacts[index].coins = row.querySelector(".imageEnabled").checked;
                    setData("impacts", impacts);

                    var allEnabled = true;
                    for (var i = 0; i < impacts.length; i++) {
                        if (!impacts[i].coins) {
                            allEnabled = false;
                            break;
                        }
                    }
                    document.querySelector("#coinSoundTable").querySelector(".selectAll input").checked = allEnabled;
                });
            }
            else {
                impacts.splice(index, 1);
                setData("impacts", impacts);
            }
        });
    }
}

document.querySelector("#bonksAdd").addEventListener("click", addBonk);

async function addBonk() {
    var newBonkNumber = 1;
    var customBonks = await getData("customBonks");
    if (customBonks == null)
        customBonks = {};

    while (customBonks["自定义投掷 " + newBonkNumber] != null)
        newBonkNumber++;

    customBonks["自定义投掷 " + newBonkNumber] = {
        "barrageCountManual": false,
        "barrageCount": 1,
        "barrageFrequencyOverride": false,
        "barrageFrequency": await getData("barrageFrequency"),
        "throwDurationOverride": false,
        "throwDuration": await getData("throwDuration"),
        "throwAngleOverride": false,
        "throwAngleMin": await getData("throwAngleMin"),
        "throwAngleMax": await getData("throwAngleMax"),
        "spinSpeedMin": await getData("spinSpeedMin"),
        "spinSpeedMax": await getData("spinSpeedMax"),
        "itemsOverride": false,
        "soundsOverride": false,
        "hideOnHit": false,
        "impactDecals": [],
        "windupSounds": [],
        "windupDelay": 0
    };

    setData("customBonks", customBonks);

    var throws = await getData("throws");
    for (var i = 0; i < throws.length; i++)
        if (throws[i].enabled)
            throws[i].customs.push("自定义投掷 " + newBonkNumber);
    setData("throws", throws);

    var impacts = await getData("impacts");
    for (var i = 0; i < impacts.length; i++)
        if (impacts[i].enabled)
            impacts[i].customs.push("自定义投掷 " + newBonkNumber);
    setData("impacts", impacts);

    openBonks();
}

async function bonkDetails(customBonkName) {
    var customBonks = await getData("customBonks");

    if (customBonks[customBonkName] != null) {
        showPanel("bonkDetails", true);

        // Copy new elements to remove all old listeners
        var oldTable = document.querySelector("#bonkDetailsTable");
        var newTable = oldTable.cloneNode(true);
        oldTable.after(newTable);
        oldTable.remove();

        const bonkDetailsTable = document.querySelector("#bonkDetailsTable");

        // Bonk Name
        bonkDetailsTable.querySelector(".bonkName").value = customBonkName;
        bonkDetailsTable.querySelector(".bonkName").addEventListener("change", async () => {
            customBonks = await getData("customBonks");
            if (customBonks[bonkDetailsTable.querySelector(".bonkName").value] == null) {
                customBonks[bonkDetailsTable.querySelector(".bonkName").value] = customBonks[customBonkName];
                delete customBonks[customBonkName];

                var throws = await getData("throws");
                for (var i = 0; i < throws.length; i++) {
                    if (throws[i].customs.includes(customBonkName)) {
                        throws[i].customs.splice(throws[i].customs.indexOf(customBonkName), 1);
                        throws[i].customs.push(bonkDetailsTable.querySelector(".bonkName").value);
                    }
                }
                setData("throws", throws);

                var impacts = await getData("impacts");
                for (var i = 0; i < impacts.length; i++) {
                    if (impacts[i].customs.includes(customBonkName)) {
                        impacts[i].customs.splice(impacts[i].customs.indexOf(customBonkName), 1);
                        impacts[i].customs.push(bonkDetailsTable.querySelector(".bonkName").value);
                    }
                }
                setData("impacts", impacts);

                customBonkName = bonkDetailsTable.querySelector(".bonkName").value;
            }
            else {
                // Error: Name exists
            }
            setData("customBonks", customBonks);
        });

        // 手动投掷数
        bonkDetailsTable.querySelector(".barrageCountManual").checked = customBonks[customBonkName].barrageCountManual || false;
        bonkDetailsTable.querySelector(".barrageCount").disabled = !customBonks[customBonkName].barrageCountManual || false;
        bonkDetailsTable.querySelector(".barrageCountManual").addEventListener("change", async () => {
            customBonks = await getData("customBonks");
            customBonks[customBonkName].barrageCountManual = bonkDetailsTable.querySelector(".barrageCountManual").checked;
            bonkDetailsTable.querySelector(".barrageCount").disabled = !customBonks[customBonkName].barrageCountManual;
            setData("customBonks", customBonks);
        });

        // Barrage Count
        bonkDetailsTable.querySelector(".barrageCount").value = customBonks[customBonkName].barrageCount;
        bonkDetailsTable.querySelector(".barrageCount").addEventListener("change", async () => {
            customBonks = await getData("customBonks");
            customBonks[customBonkName].barrageCount = parseInt(bonkDetailsTable.querySelector(".barrageCount").value);
            setData("customBonks", customBonks);
        });

        // Barrage Frequency
        bonkDetailsTable.querySelector(".barrageFrequencyOverride").checked = customBonks[customBonkName].barrageFrequencyOverride;
        bonkDetailsTable.querySelector(".barrageFrequency").disabled = !customBonks[customBonkName].barrageFrequencyOverride;
        bonkDetailsTable.querySelector(".barrageFrequencyOverride").addEventListener("change", async () => {
            customBonks = await getData("customBonks");
            customBonks[customBonkName].barrageFrequencyOverride = bonkDetailsTable.querySelector(".barrageFrequencyOverride").checked;
            bonkDetailsTable.querySelector(".barrageFrequency").disabled = !customBonks[customBonkName].barrageFrequencyOverride;
            setData("customBonks", customBonks);
        });

        bonkDetailsTable.querySelector(".barrageFrequency").value = customBonks[customBonkName].barrageFrequency;
        bonkDetailsTable.querySelector(".barrageFrequency").addEventListener("change", async () => {
            customBonks = await getData("customBonks");
            customBonks[customBonkName].barrageFrequency = parseFloat(bonkDetailsTable.querySelector(".barrageFrequency").value);
            setData("customBonks", customBonks);
        });

        // Throw Duration
        bonkDetailsTable.querySelector(".throwDurationOverride").checked = customBonks[customBonkName].throwDurationOverride;
        bonkDetailsTable.querySelector(".throwDuration").disabled = !customBonks[customBonkName].throwDurationOverride;
        bonkDetailsTable.querySelector(".throwDurationOverride").addEventListener("change", async () => {
            customBonks = await getData("customBonks");
            customBonks[customBonkName].throwDurationOverride = bonkDetailsTable.querySelector(".throwDurationOverride").checked;
            bonkDetailsTable.querySelector(".throwDuration").disabled = !customBonks[customBonkName].throwDurationOverride;
            setData("customBonks", customBonks);
        });

        bonkDetailsTable.querySelector(".throwDuration").value = customBonks[customBonkName].throwDuration;
        bonkDetailsTable.querySelector(".throwDuration").addEventListener("change", async () => {
            customBonks = await getData("customBonks");
            customBonks[customBonkName].throwDuration = parseFloat(bonkDetailsTable.querySelector(".throwDuration").value);
            setData("customBonks", customBonks);
        });

        // Spin Speed
        bonkDetailsTable.querySelector(".spinSpeedOverride").checked = customBonks[customBonkName].spinSpeedOverride;
        bonkDetailsTable.querySelector(".spinSpeedMin").disabled = !customBonks[customBonkName].spinSpeedOverride;
        bonkDetailsTable.querySelector(".spinSpeedMax").disabled = !customBonks[customBonkName].spinSpeedOverride;
        bonkDetailsTable.querySelector(".spinSpeedOverride").addEventListener("change", async () => {
            customBonks = await getData("customBonks");
            customBonks[customBonkName].spinSpeedOverride = bonkDetailsTable.querySelector(".spinSpeedOverride").checked;
            bonkDetailsTable.querySelector(".spinSpeedMin").disabled = !customBonks[customBonkName].spinSpeedOverride;
            bonkDetailsTable.querySelector(".spinSpeedMax").disabled = !customBonks[customBonkName].spinSpeedOverride;
            setData("customBonks", customBonks);
        });

        bonkDetailsTable.querySelector(".spinSpeedMin").value = customBonks[customBonkName].spinSpeedMin;
        bonkDetailsTable.querySelector(".spinSpeedMin").addEventListener("change", async () => {
            customBonks = await getData("customBonks");
            customBonks[customBonkName].spinSpeedMin = parseFloat(bonkDetailsTable.querySelector(".spinSpeedMin").value);
            setData("customBonks", customBonks);
        });

        // Throw Angle Max
        bonkDetailsTable.querySelector(".spinSpeedMax").value = customBonks[customBonkName].spinSpeedMax;
        bonkDetailsTable.querySelector(".spinSpeedMax").addEventListener("change", async () => {
            customBonks = await getData("customBonks");
            customBonks[customBonkName].spinSpeedMax = parseFloat(bonkDetailsTable.querySelector(".spinSpeedMax").value);
            setData("customBonks", customBonks);
        });

        // Throw Angle
        bonkDetailsTable.querySelector(".throwAngleOverride").checked = customBonks[customBonkName].throwAngleOverride;
        bonkDetailsTable.querySelector(".throwAngleMin").disabled = !customBonks[customBonkName].throwAngleOverride;
        bonkDetailsTable.querySelector(".throwAngleMax").disabled = !customBonks[customBonkName].throwAngleOverride;
        bonkDetailsTable.querySelector(".throwAngleOverride").addEventListener("change", async () => {
            customBonks = await getData("customBonks");
            customBonks[customBonkName].throwAngleOverride = bonkDetailsTable.querySelector(".throwAngleOverride").checked;
            bonkDetailsTable.querySelector(".throwAngleMin").disabled = !customBonks[customBonkName].throwAngleOverride;
            bonkDetailsTable.querySelector(".throwAngleMax").disabled = !customBonks[customBonkName].throwAngleOverride;
            setData("customBonks", customBonks);
        });

        bonkDetailsTable.querySelector(".throwAngleMin").value = customBonks[customBonkName].throwAngleMin;
        bonkDetailsTable.querySelector(".throwAngleMin").addEventListener("change", async () => {
            customBonks = await getData("customBonks");
            customBonks[customBonkName].throwAngleMin = parseInt(bonkDetailsTable.querySelector(".throwAngleMin").value);
            setData("customBonks", customBonks);
        });

        bonkDetailsTable.querySelector(".throwAngleMax").value = customBonks[customBonkName].throwAngleMax;
        bonkDetailsTable.querySelector(".throwAngleMax").addEventListener("change", async () => {
            customBonks = await getData("customBonks");
            customBonks[customBonkName].throwAngleMax = parseInt(bonkDetailsTable.querySelector(".throwAngleMax").value);
            setData("customBonks", customBonks);
        });

        // Items
        bonkDetailsTable.querySelector(".imagesOverride").checked = customBonks[customBonkName].itemsOverride;
        bonkDetailsTable.querySelector(".images").disabled = !customBonks[customBonkName].itemsOverride;
        bonkDetailsTable.querySelector(".imagesOverride").addEventListener("change", async () => {
            customBonks = await getData("customBonks");
            customBonks[customBonkName].itemsOverride = bonkDetailsTable.querySelector(".imagesOverride").checked;
            bonkDetailsTable.querySelector(".images").disabled = !customBonks[customBonkName].itemsOverride;
            setData("customBonks", customBonks);
        });

        bonkDetailsTable.querySelector(".images").addEventListener("click", () => {
            if (!bonkDetailsTable.querySelector(".images").disabled) {
                openImagesCustom(customBonkName);
                showPanel("bonkImagesCustom", true);
            }
        });

        // Sounds
        bonkDetailsTable.querySelector(".soundsOverride").checked = customBonks[customBonkName].soundsOverride;
        bonkDetailsTable.querySelector(".sounds").disabled = !customBonks[customBonkName].soundsOverride;
        bonkDetailsTable.querySelector(".soundsOverride").addEventListener("change", async () => {
            customBonks = await getData("customBonks");
            customBonks[customBonkName].soundsOverride = bonkDetailsTable.querySelector(".soundsOverride").checked;
            bonkDetailsTable.querySelector(".sounds").disabled = !customBonks[customBonkName].soundsOverride;
            setData("customBonks", customBonks);
        });

        bonkDetailsTable.querySelector(".sounds").addEventListener("click", () => {
            if (!bonkDetailsTable.querySelector(".sounds").disabled) {
                openSoundsCustom(customBonkName);
                showPanel("bonkSoundsCustom", true);
            }
        });

        // Impact Decals
        bonkDetailsTable.querySelector(".impactDecals").addEventListener("click", () => {
            openImpactDecals(customBonkName);
            showPanel("impactDecals", true);
        });

        // Windup Sounds
        bonkDetailsTable.querySelector(".windupSounds").addEventListener("click", () => {
            openWindupSounds(customBonkName);
            showPanel("windupSounds", true);
        });

        // Windup Delay
        bonkDetailsTable.querySelector(".windupDelay").value = customBonks[customBonkName].windupDelay;
        bonkDetailsTable.querySelector(".windupDelay").addEventListener("change", async () => {
            customBonks = await getData("customBonks");
            customBonks[customBonkName].windupDelay = parseFloat(bonkDetailsTable.querySelector(".windupDelay").value);
            setData("customBonks", customBonks);
        });

        // 击中后消失
        bonkDetailsTable.querySelector(".hideOnHit").checked = customBonks[customBonkName].hideOnHit;
        bonkDetailsTable.querySelector(".hideOnHit").addEventListener("change", async () => {
            customBonks = await getData("customBonks");
            customBonks[customBonkName].hideOnHit = bonkDetailsTable.querySelector(".hideOnHit").checked;
            setData("customBonks", customBonks);
        })
    }
}

async function openBonks() {
    var customBonks = await getData("customBonks");

    document.querySelectorAll(".customBonkRow").forEach(element => { element.remove(); });

    if (customBonks == null)
        setData("customBonks", {});
    else {
        for (const key in customBonks) {
            const row = document.querySelector("#customBonkRow").cloneNode(true);
            row.removeAttribute("id");
            row.removeAttribute("hidden");
            row.classList.add("customBonkRow");
            document.querySelector("#bonksTable").appendChild(row);

            row.querySelector(".bonkDetailsButton").addEventListener("click", () => {
                bonkDetails(key);
            });

            row.querySelector(".imageLabel").innerText = key;

            row.querySelector(".imageRemove").addEventListener("click", async () => {
                delete customBonks[key];
                setData("customBonks", customBonks);

                var throws = await getData("throws");
                for (var i = 0; i < throws.length; i++) {
                    if (throws[i].customs.includes(key))
                        throws[i].customs.splice(throws[i].customs.indexOf(key), 1);
                }
                setData("throws", throws);

                var impacts = await getData("impacts");
                for (var i = 0; i < impacts.length; i++) {
                    if (impacts[i].customs.includes(key))
                        impacts[i].customs.splice(impacts[i].customs.indexOf(key), 1);
                }

                setData("impacts", impacts);

                let eventType = await getData("commands");
                for (var i = 0; i < eventType.length; i++) {
                    if (eventType[i].bonkType == key)
                        eventType[i].bonkType = "single";
                }
                setData("commands", eventType);

                eventType = await getData("gifts");
                for (let i = 0; i < eventType.length; i++) {
                    if (eventType[i].bonkType == key)
                        eventType[i].bonkType = "single";
                }
                setData("gifts", eventType);

                openBonks();
            });
        };
    }
}

async function openTestBonks() {
    var customBonks = await getData("customBonks");

    document.querySelectorAll(".testCustom").forEach(element => { element.remove(); });

    if (customBonks == null)
        setData("customBonks", {});
    else {
        for (const key in customBonks) {
            const row = document.querySelector("#testCustom").cloneNode(true);
            row.removeAttribute("id");
            row.removeAttribute("hidden");
            row.classList.add("testCustom");
            document.querySelector("#testCustom").after(row);

            row.querySelector(".innerTopButton").innerText = key;

            row.addEventListener("click", () => testCustomBonk(key));
        };
    }
}

document.querySelector("#giftAdd").addEventListener("click", newGift);

// 添加礼物类型事件
async function newGift() {
    var gifts = await getData("gifts");

    gifts.push({
        enabled: true,
        name: "",
        cooldown: 0,
        bonkType: "single"
    })

    setData("gifts", gifts);

    openEvents();
}

document.querySelector("#commandAdd").addEventListener("click", newCommand);

// Create a new command event
async function newCommand() {
    var commands = await getData("commands");

    commands.push({
        "enabled": true,
        "name": "",
        "cooldown": 0,
        "bonkType": "single"
    });

    setData("commands", commands);

    openEvents();
}

async function openEvents() {
    const customBonks = await getData("customBonks");

    // 读取礼物类型列表
    var gifts = await getData("gifts");

    document.querySelectorAll(".giftsRow").forEach(element => { element.remove(); });

    gifts.forEach((_, index) => {
        var row = document.querySelector("#giftsRow").cloneNode(true);
        row.removeAttribute("id");
        row.classList.add("giftsRow");
        row.classList.remove("hidden");
        document.querySelector("#giftsRow").after(row);

        row.querySelector(".giftEnabled").checked = gifts[index].enabled;
        row.querySelector(".giftEnabled").addEventListener("change", () => {
            gifts[index].enabled = row.querySelector(".giftEnabled").checked;
            setData("gifts", gifts);
        });

        row.querySelector(".giftName").value = gifts[index].name;
        row.querySelector(".giftName").addEventListener("change", () => {
            gifts[index].name = row.querySelector(".giftName").value;
            setData("gifts", gifts);
        });

        row.querySelector(".giftCooldown").value = gifts[index].cooldown;
        row.querySelector(".giftCooldown").addEventListener("change", () => {
            gifts[index].cooldown = row.querySelector(".giftCooldown").value;
            setData("gifts", gifts);
        });

        for (var key in customBonks) {
            var customBonk = document.createElement("option");
            customBonk.value = key;
            customBonk.innerText = key;
            row.querySelector(".bonkType").appendChild(customBonk);
        }

        row.querySelector(".bonkType").value = gifts[index].bonkType;
        row.querySelector(".bonkType").addEventListener("change", () => {
            gifts[index].bonkType = row.querySelector(".bonkType").value;
            setData("gifts", gifts);
        });

        row.querySelector(".giftRemove").addEventListener("click", () => {
            gifts.splice(index, 1);
            setData("gifts", gifts);
            openEvents();
        });

    })


    // Fill command rows
    var commands = await getData("commands");

    document.querySelectorAll(".commandsRow").forEach(element => { element.remove(); });

    commands.forEach((_, index) => {
        var row = document.querySelector("#commandsRow").cloneNode(true);
        row.removeAttribute("id");
        row.classList.add("commandsRow");
        row.classList.remove("hidden");
        document.querySelector("#commandsRow").after(row);

        row.querySelector(".commandEnabled").checked = commands[index].enabled;
        row.querySelector(".commandEnabled").addEventListener("change", () => {
            commands[index].enabled = row.querySelector(".commandEnabled").checked;
            setData("commands", commands);
        });

        row.querySelector(".commandName").value = commands[index].name;
        row.querySelector(".commandName").addEventListener("change", () => {
            commands[index].name = row.querySelector(".commandName").value;
            setData("commands", commands);
        });

        row.querySelector(".commandCooldown").value = commands[index].cooldown;
        row.querySelector(".commandCooldown").addEventListener("change", () => {
            commands[index].cooldown = row.querySelector(".commandCooldown").value;
            setData("commands", commands);
        });

        for (var key in customBonks) {
            var customBonk = document.createElement("option");
            customBonk.value = key;
            customBonk.innerText = key;
            row.querySelector(".bonkType").appendChild(customBonk);
        }

        row.querySelector(".bonkType").value = commands[index].bonkType;
        row.querySelector(".bonkType").addEventListener("change", () => {
            commands[index].bonkType = row.querySelector(".bonkType").value;
            setData("commands", commands);
        });

        row.querySelector(".commandRemove").addEventListener("click", () => {
            commands.splice(index, 1);
            setData("commands", commands);
            openEvents();
        });
    });

    var node = document.querySelector("#followType");
    while (node.childElementCount > 4)
        node.removeChild(node.lastChild);

    for (var key in customBonks) {
        var customBonk = document.createElement("option");
        customBonk.value = key;
        customBonk.innerText = key;
        node.appendChild(customBonk);
    }
}

// ----
// 表情
// Expressions
// ----

document.querySelector("#expressionRefresh").addEventListener("click", () => {
    ipcRenderer.send("getExpressions");
});

// 选择后保存已选择的表情名称
document.querySelector("#hitExpressionSelect").addEventListener("change", function () {
    setData("hitExpressionName", this.options[this.selectedIndex].innerText);
});

ipcRenderer.on("expressions", async (_, expressions) => {
    let select = document.querySelector("#hitExpressionSelect");

    select.options.length = 1;

    // 将VTS获取的表情列表插入到select
    for (let i = 0; i < expressions.length; i++) {
        var expression = document.createElement("option");
        expression.innerText = expressions[i].name;
        expression.value = expressions[i].file;
        select.appendChild(expression);
    }

    // 获取是否勾选了表情功能
    let hitExpressionEnabled = await getData("hitExpression");
    // 获取已经选择了的表情
    let hitExpressionName = await getData("hitExpressionName");

    if (hitExpressionName != null) {
        const options = select.options;
        for (let i = 0; i < options.length; i++) {
            if (hitExpressionName == options[i].innerText) {
                select.selectedIndex = i;
                break;
            }
        }
    }

    setExpressionDetailStatus(hitExpressionEnabled ? expressionDetailStatus.idle : expressionDetailStatus.disabled);
});

const expressionDetailStatus = {
    idle: 0,
    loading: 1,
    disabled: 2,
}

// 设置开关表情后表情选项的显示
function setExpressionDetailStatus(status) {
    let mask = document.querySelector("#hitExpressionDetail .loadingMask");
    switch (status) {
        case expressionDetailStatus.idle: {
            mask.classList.add("idle");
            mask.classList.remove("disabled");
            mask.classList.remove("loading");
            break;
        }
        case expressionDetailStatus.disabled: {
            mask.classList.add("disabled");
            mask.classList.remove("idle");
            mask.classList.remove("loading");
            break;
        }
        case expressionDetailStatus.loading: {
            mask.classList.add("loading");
            mask.classList.remove("disabled");
            mask.classList.remove("idle");
            break;
        }
    }
}

// ----
// Data
// ----

const defaultData = JSON.parse(fs.readFileSync(__dirname + "/defaultData.json", "utf8"));

// Counter for number of writes that are being attempted
// Will only attempt to load data if not currently writing
// Inter-process communication means this is necessary
var isWriting = 0;
ipcRenderer.on("doneWriting", () => {
    if (--isWriting < 0)
        isWriting = 0;
});

// Get requested data, waiting for any current writes to finish first
async function getData(field) {
    while (isWriting > 0)
        await new Promise(resolve => setTimeout(resolve, 10));

    if (!fs.existsSync(userDataPath + "/data.json"))
        fs.writeFileSync(userDataPath + "/data.json", JSON.stringify(defaultData));

    var data;
    // An error should only be thrown if the other process is in the middle of writing to the file.
    // If so, it should finish shortly and this loop will exit.
    while (data == null) {
        try {
            data = JSON.parse(fs.readFileSync(userDataPath + "/data.json", "utf8"));
        } catch { }
    }
    data = JSON.parse(fs.readFileSync(userDataPath + "/data.json", "utf8"));
    return data[field];
}

// Send new data to the main process to write to file
function setData(field, value) {
    isWriting++;
    ipcRenderer.send("setData", [field, value]);

    if (field == "portThrower" || field == "portVTubeStudio")
        setPorts();
}

// If ports change, write them to the file read by the Browser Source file
async function setPorts() {
    fs.writeFileSync(__dirname + "/ports.js", "const ports = [ " + await getData("portThrower") + ", " + await getData("portVTubeStudio") + " ];");
}

// Load the requested data and apply it to the relevant settings field
async function loadData(field) {
    // Enable physics simulation for all users upon updating to 1.19
    if (field == "physicsSim") {
        var didPhysicsUpdate = await getData("didPhysicsUpdate");
        if (didPhysicsUpdate == null) {
            setData("physicsSim", true);
            setData("didPhysicsUpdate", true);
        }
    }

    const thisData = await getData(field);
    if (thisData != null) {
        if (document.querySelector("#" + field).type == "checkbox")
            document.querySelector("#" + field).checked = thisData;
        else {
            document.querySelector("#" + field).value = thisData;
            if (field == "portThrower" || field == "portVTubeStudio")
                setPorts();
        }
    }
    else {
        const node = document.querySelector("#" + field);
        const val = node.type == "checkbox" ? node.checked : (node.type == "number" || node.type == "range" ? parseFloat(node.value) : node.value);
        setData(field, val);
    }
}

const folders = ["throws", "impacts", "decals", "windups"];
function copyFilesToDirectory() {
    folders.forEach((folder) => {
        if (!fs.existsSync(__dirname + "/" + folder))
            fs.mkdirSync(__dirname + "/" + folder);

        fs.readdirSync(userDataPath + "/" + folder).forEach(file => {
            fs.copyFileSync(userDataPath + "/" + folder + "/" + file, __dirname + "/" + folder + "/" + file);
        });
    })
}

// Place all settings from data into the proper location on load
window.onload = async function () {
    // UPDATE 1.19 (or new installation)
    if (!fs.existsSync(userDataPath))
        fs.mkdirSync(userDataPath);

    if (!fs.existsSync(userDataPath + "/data.json") && fs.existsSync(__dirname + "/data.json"))
        fs.copyFileSync(__dirname + "/data.json", userDataPath + "/data.json");

    ///没有当前文件夹则创建
    folders.forEach((folder) => {
        if (!fs.existsSync(userDataPath + "/" + folder))
            fs.mkdirSync(userDataPath + "/" + folder);

        if (!fs.existsSync(__dirname + "/" + folder))
            fs.mkdirSync(__dirname + "/" + folder);

        fs.readdirSync(__dirname + "/" + folder).forEach(file => {
            if (!fs.existsSync(userDataPath + "/" + folder + "/" + file))
                fs.copyFileSync(__dirname + "/" + folder + "/" + file, userDataPath + "/" + folder + "/" + file);
        });
    })

    // 获取房间号
    var roomid = await getData("roomid");
    document.querySelector("#roomid").value = roomid;
    setData("roomid", roomid);

    // 发现新版本文字添加跳转
    document.querySelector("#newVersion").addEventListener("click", () => {
        ipcRenderer.send("toRelease");
    });

    // UPDATING FROM 1.0.1 OR EARLIER
    var throws = await getData("throws");
    for (var i = 0; i < throws.length; i++) {
        if (Array.isArray(throws[i])) {
            throws[i] = {
                "location": throws[i][0],
                "weight": throws[i][1],
                "scale": throws[i][2],
                "sound": throws[i][3],
                "volume": throws[i][4] == null ? 1 : throws[i][4],
                "enabled": true,
                "customs": []
            };
        }
    }
    setData("throws", throws);

    var commands = await getData("commands");
    if (commands == null) {
        commands = [];

        setData("commands", commands);
    }

    var gifts = await getData("gifts");
    if (gifts == null) {
        gifts = [];

        setData("gifts", gifts);
    }

    // UPDATE 1.12
    var customBonks = await getData("customBonks");
    if (customBonks != null) {
        for (const key in customBonks) {
            if (customBonks[key].spinSpeedOverride == null)
                customBonks[key].spinSpeedOverride = false;
            if (customBonks[key].spinSpeedMin == null)
                customBonks[key].spinSpeedMin = 5;
            if (customBonks[key].spinSpeedMax == null)
                customBonks[key].spinSpeedMax = 10;
        }

        setData("customBonks", customBonks);
    }

    var tray = await getData("minimizeToTray");
    if (tray == null)
        setData("minimizeToTray", false);

    // 最少电池和瓜子设置
    loadData("coinMinBattery");
    loadData("coinMinSilver");

    // 投掷电池和瓜子设置
    loadData("coinsThrowEnabled");
    loadData("coinsThrowMaxCount");
    loadData("coinsThrowUnit");
    loadData("coinsThrowCooldown");

    // 复数礼物限制
    loadData("multiGiftsEnabled");
    loadData("multiGiftsMaxCount");

    // 关注
    loadData("followEnabled");
    loadData("followType");
    loadData("followCooldown");

    // 醒目留言
    loadData("superChatEnabled");
    loadData("superChatMinBattery");
    loadData("superChatMaxCount");
    loadData("superChatCoinUnit");
    loadData("superChatCooldown");

    // 大航海
    loadData("guardEnabled");
    loadData("guardCooldown");
    loadData("guardMaxCount");
    loadData("guardUnit");
    getData("guardNumType").then((res) => {
        if (res) {
            document.querySelector("#guardNumType").value = res;
        }
    })

    getData("customizeInputParams").then((res) => {
        document.querySelector("#customizeInputParams").checked = res;
        if (res) {
            document.querySelector("#customizeInputParamsDetail .disableMask").classList.add("hidden")
        }
    })

    loadData("barrageCount");
    loadData("barrageFrequency");
    loadData("throwDuration");
    loadData("returnSpeed");
    loadData("throwAngleMin");
    loadData("throwAngleMax");
    loadData("physicsSim");
    loadData("physicsFPS");
    loadData("physicsGravity");
    loadData("physicsReverse");
    loadData("physicsRotate");
    loadData("physicsHorizontal");
    loadData("physicsVertical");
    loadData("spinSpeedMin");
    loadData("spinSpeedMax");
    loadData("closeEyes");
    loadData("openEyes");
    loadData("itemScaleMin");
    loadData("itemScaleMax");
    loadData("delay");
    loadData("volume");
    loadData("portThrower");
    loadData("portVTubeStudio");
    loadData("minimizeToTray");
    loadData("hitExpression");
    loadData("hitExpressionDuration");
    loadData("giftWithCoinCountEnabled");
    loadData("giftWithCoinCountMaxCount");
    loadData("giftWithCoinCountUnit");
    loadData("saveLogs");
    loadData("modelFlinchRatio");
    loadData("modelFlinchReverseX");
    loadData("modelFlinchReverseY");
    loadData("paramsFaceAngleX");
    loadData("paramsFaceAngleY");
    loadData("paramsFaceAngleZ");
    loadData("paramsFacePositionX");
    loadData("paramsEyeOpenLeft");
    loadData("paramsEyeOpenRight");

    openImages();
    openGuardImages();
    openCoinImages();
    copyFilesToDirectory();

    checkVersion();
    document.title += " " + version;
    setData("version", version);
}

// Event listeners for changing settings

// 单个礼物最少价值
document.querySelector("#coinMinBattery").addEventListener("change", () => { clampValue(document.querySelector("#coinMinBattery"), 0, null); setData("coinMinBattery", parseInt(document.querySelector("#coinMinBattery").value)) });
document.querySelector("#coinMinSilver").addEventListener("change", () => { clampValue(document.querySelector("#coinMinSilver"), 0, null); setData("coinMinSilver", parseInt(document.querySelector("#coinMinSilver").value)) });

// 投掷瓜子电池
document.querySelector("#coinsThrowEnabled").addEventListener("change", () => setData("coinsThrowEnabled", document.querySelector("#coinsThrowEnabled").checked));
document.querySelector("#coinsThrowMaxCount").addEventListener("change", () => { clampValue(document.querySelector("#coinsThrowMaxCount"), 1, null); setData("coinsThrowMaxCount", parseInt(document.querySelector("#coinsThrowMaxCount").value)) });
document.querySelector("#coinsThrowUnit").addEventListener("change", () => { clampValue(document.querySelector("#coinsThrowUnit"), 0, null); setData("coinsThrowUnit", parseInt(document.querySelector("#coinsThrowUnit").value)) });
document.querySelector("#coinsThrowCooldown").addEventListener("change", () => { clampValue(document.querySelector("#coinsThrowCooldown"), 0, null); setData("coinsThrowCooldown", parseFloat(document.querySelector("#coinsThrowCooldown").value)) });

// 复数礼物
document.querySelector("#multiGiftsEnabled").addEventListener("change", () => setData("multiGiftsEnabled", document.querySelector("#multiGiftsEnabled").checked));
document.querySelector("#multiGiftsMaxCount").addEventListener("change", () => { clampValue(document.querySelector("#multiGiftsMaxCount"), 1, null); setData("multiGiftsMaxCount", parseInt(document.querySelector("#multiGiftsMaxCount").value)) });

// 复数礼物跟随瓜子电池数量
document.querySelector("#giftWithCoinCountEnabled").addEventListener("change", () => { setData("giftWithCoinCountEnabled", document.querySelector("#giftWithCoinCountEnabled").checked) });
document.querySelector("#giftWithCoinCountMaxCount").addEventListener("change", () => { clampValue(document.querySelector("#giftWithCoinCountMaxCount"), 0, null); setData("giftWithCoinCountMaxCount", parseInt(document.querySelector("#giftWithCoinCountMaxCount").value)) });
document.querySelector("#giftWithCoinCountUnit").addEventListener("change", () => { clampValue(document.querySelector("#giftWithCoinCountUnit"), 1, null); setData("giftWithCoinCountUnit", parseInt(document.querySelector("#giftWithCoinCountUnit").value)) });

// 关注
document.querySelector("#followEnabled").addEventListener("change", () => setData("followEnabled", document.querySelector("#followEnabled").checked));
document.querySelector("#followType").addEventListener("change", () => setData("followType", document.querySelector("#followType").value));
document.querySelector("#followCooldown").addEventListener("change", () => { clampValue(document.querySelector("#followCooldown"), 0, null); setData("followCooldown", parseFloat(document.querySelector("#followCooldown").value)) });

// 醒目留言
document.querySelector("#superChatEnabled").addEventListener("change", () => setData("superChatEnabled", document.querySelector("#superChatEnabled").checked));
document.querySelector("#superChatMinBattery").addEventListener("change", () => { clampValue(document.querySelector("#superChatMinBattery"), 300, null); setData("superChatMinBattery", parseInt(document.querySelector("#superChatMinBattery").value)) });
document.querySelector("#superChatMaxCount").addEventListener("change", () => { clampValue(document.querySelector("#superChatMaxCount"), 1, null); setData("superChatMaxCount", parseInt(document.querySelector("#superChatMaxCount").value)) });
document.querySelector("#superChatCoinUnit").addEventListener("change", () => { clampValue(document.querySelector("#superChatCoinUnit"), 1, null); setData("superChatCoinUnit", parseInt(document.querySelector("#superChatCoinUnit").value)) });
document.querySelector("#superChatCooldown").addEventListener("change", () => { clampValue(document.querySelector("#superChatCooldown"), 0, null); setData("superChatCooldown", parseInt(document.querySelector("#superChatCooldown").value)) });

// 大航海
document.querySelector("#guardEnabled").addEventListener("change", () => setData("guardEnabled", document.querySelector("#guardEnabled").checked));
document.querySelector("#guardCooldown").addEventListener("change", () => { clampValue(document.querySelector("#guardCooldown"), 0, null); setData("guardCooldown", parseFloat(document.querySelector("#guardCooldown").value)) });
document.querySelector("#guardNumType").addEventListener("change", () => setData("guardNumType", document.querySelector("#guardNumType").value));
document.querySelector("#guardMaxCount").addEventListener("change", () => { clampValue(document.querySelector("#guardMaxCount"), 1, null); setData("guardMaxCount", parseInt(document.querySelector("#guardMaxCount").value)) });
document.querySelector("#guardUnit").addEventListener("change", () => { clampValue(document.querySelector("#guardUnit"), 1, null); setData("guardUnit", parseInt(document.querySelector("#guardUnit").value)) });

// 设置
document.querySelector("#barrageCount").addEventListener("change", () => { clampValue(document.querySelector("#barrageCount"), 0, null); setData("barrageCount", parseInt(document.querySelector("#barrageCount").value)) });
document.querySelector("#barrageFrequency").addEventListener("change", () => { clampValue(document.querySelector("#barrageFrequency"), 0, null); setData("barrageFrequency", parseFloat(document.querySelector("#barrageFrequency").value)) });
document.querySelector("#throwDuration").addEventListener("change", () => { clampValue(document.querySelector("#throwDuration"), 0.1, null); setData("throwDuration", parseFloat(document.querySelector("#throwDuration").value)) });
document.querySelector("#returnSpeed").addEventListener("change", () => { clampValue(document.querySelector("#returnSpeed"), 0, null); setData("returnSpeed", parseFloat(document.querySelector("#returnSpeed").value)) });
document.querySelector("#throwAngleMin").addEventListener("change", () => { clampValue(document.querySelector("#throwAngleMin"), -90, parseFloat(document.querySelector("#throwAngleMax").value)); setData("throwAngleMin", parseFloat(document.querySelector("#throwAngleMin").value)) });
document.querySelector("#throwAngleMax").addEventListener("change", () => { clampValue(document.querySelector("#throwAngleMax"), parseFloat(document.querySelector("#throwAngleMin").value), null); setData("throwAngleMax", parseFloat(document.querySelector("#throwAngleMax").value)) });
document.querySelector("#spinSpeedMin").addEventListener("change", () => { clampValue(document.querySelector("#spinSpeedMin"), 0, parseFloat(document.querySelector("#spinSpeedMax").value)); setData("spinSpeedMin", parseFloat(document.querySelector("#spinSpeedMin").value)) });
document.querySelector("#spinSpeedMax").addEventListener("change", () => { clampValue(document.querySelector("#spinSpeedMax"), parseFloat(document.querySelector("#spinSpeedMin").value), null); setData("spinSpeedMax", parseFloat(document.querySelector("#spinSpeedMax").value)) });
document.querySelector("#physicsSim").addEventListener("change", () => setData("physicsSim", document.querySelector("#physicsSim").checked));
document.querySelector("#physicsFPS").addEventListener("change", () => { clampValue(document.querySelector("#physicsFPS"), 1, 60); setData("physicsFPS", parseFloat(document.querySelector("#physicsFPS").value)) });
document.querySelector("#physicsGravity").addEventListener("change", () => { clampValue(document.querySelector("#physicsGravity"), 0.01, null); setData("physicsGravity", parseFloat(document.querySelector("#physicsGravity").value)) });
document.querySelector("#physicsReverse").addEventListener("change", () => setData("physicsReverse", document.querySelector("#physicsReverse").checked));
document.querySelector("#physicsRotate").addEventListener("change", () => setData("physicsRotate", document.querySelector("#physicsRotate").checked));
document.querySelector("#physicsHorizontal").addEventListener("change", () => { setData("physicsHorizontal", parseFloat(document.querySelector("#physicsHorizontal").value)) });
document.querySelector("#physicsVertical").addEventListener("change", () => { setData("physicsVertical", parseFloat(document.querySelector("#physicsVertical").value)) });
document.querySelector("#hitExpressionDuration").addEventListener("change", () => { clampValue(document.querySelector("#hitExpressionDuration"), 0, null); setData("hitExpressionDuration", parseFloat(document.querySelector('#hitExpressionDuration').value)); });
document.querySelector("#saveLogs").addEventListener("change", () => setData("saveLogs", document.querySelector("#saveLogs").checked));
document.querySelector("#modelFlinchReverseX").addEventListener("change", () => setData("modelFlinchReverseX", document.querySelector("#modelFlinchReverseX").checked))
document.querySelector("#modelFlinchReverseY").addEventListener("change", () => setData("modelFlinchReverseY", document.querySelector("#modelFlinchReverseY").checked))

document.querySelector("#customizeInputParams").addEventListener("change", () => {
    const checked = document.querySelector("#customizeInputParams").checked;
    setData("customizeInputParams", checked);
    if (checked) {
        document.querySelector("#customizeInputParamsDetail .disableMask").classList.add("hidden");
    } else {
        document.querySelector("#customizeInputParamsDetail .disableMask").classList.remove("hidden");
    }
})

document.querySelector("#closeEyes").addEventListener("change", function () {
    const val = this.checked;
    setData("closeEyes", val);
    if (val) {
        document.querySelector("#openEyes").checked = false;
        setData("openEyes", false);
        document.querySelector("#hitExpression").checked = false;
        setData("hitExpression", false);
        setExpressionDetailStatus(expressionDetailStatus.disabled);
    }
});

document.querySelector("#openEyes").addEventListener("change", function () {
    const val = this.checked;
    setData("openEyes", val);
    if (val) {
        document.querySelector("#closeEyes").checked = false;
        setData("closeEyes", false);
        document.querySelector("#hitExpression").checked = false;
        setData("hitExpression", false);
        setExpressionDetailStatus(expressionDetailStatus.disabled);
    }
});

// 添加切换表情的监听
document.querySelector("#hitExpression").addEventListener("change", function () {
    const val = this.checked;
    setData("hitExpression", val);
    if (val) {
        document.querySelector("#closeEyes").checked = false;
        setData("closeEyes", false);
        document.querySelector("#openEyes").checked = false;
        setData("openEyes", false);
        setExpressionDetailStatus(expressionDetailStatus.idle);
    } else {
        setExpressionDetailStatus(expressionDetailStatus.disabled);
    }
})

document.querySelector("#itemScaleMin").addEventListener("change", () => { clampValue(document.querySelector("#itemScaleMin"), 0, parseFloat(document.querySelector("#itemScaleMax").value)); setData("itemScaleMin", parseFloat(document.querySelector("#itemScaleMin").value)) });
document.querySelector("#itemScaleMax").addEventListener("change", () => { clampValue(document.querySelector("#itemScaleMax"), parseFloat(document.querySelector("#itemScaleMin").value), null); setData("itemScaleMax", parseFloat(document.querySelector("#itemScaleMax").value)) });
document.querySelector("#delay").addEventListener("change", () => { clampValue(document.querySelector("#delay"), 0, null); setData("delay", parseInt(document.querySelector("#delay").value)) });
document.querySelector("#volume").addEventListener("change", () => { clampValue(document.querySelector("#volume"), 0, 1); setData("volume", parseFloat(document.querySelector("#volume").value)) });
document.querySelector("#portThrower").addEventListener("change", () => setData("portThrower", parseInt(document.querySelector("#portThrower").value)));
document.querySelector("#portVTubeStudio").addEventListener("change", () => setData("portVTubeStudio", parseInt(document.querySelector("#portVTubeStudio").value)));
document.querySelector("#minimizeToTray").addEventListener("change", () => setData("minimizeToTray", document.querySelector("#minimizeToTray").checked));
document.querySelector("#modelFlinchRatio").addEventListener("change", () => { clampValue(document.querySelector("#modelFlinchRatio"), 0, 1); setData("modelFlinchRatio", parseFloat(document.querySelector("#modelFlinchRatio").value)) });

// 自定义参数
document.querySelector("#paramsFaceAngleX").addEventListener("change", () => setData("paramsFaceAngleX", document.querySelector("#paramsFaceAngleX").value));
document.querySelector("#paramsFaceAngleY").addEventListener("change", () => setData("paramsFaceAngleY", document.querySelector("#paramsFaceAngleY").value));
document.querySelector("#paramsFaceAngleZ").addEventListener("change", () => setData("paramsFaceAngleZ", document.querySelector("#paramsFaceAngleZ").value));
document.querySelector("#paramsFacePositionX").addEventListener("change", () => setData("paramsFacePositionX", document.querySelector("#paramsFacePositionX").value));
document.querySelector("#paramsEyeOpenLeft").addEventListener("change", () => setData("paramsEyeOpenLeft", document.querySelector("#paramsEyeOpenLeft").value));
document.querySelector("#paramsEyeOpenRight").addEventListener("change", () => setData("paramsEyeOpenRight", document.querySelector("#paramsEyeOpenRight").value));

// 重置设置
let clickedReset = false;
let resetBtnTimer = null;
document.querySelector("#resetSettings").addEventListener("click", () => {
    if (clickedReset) {
        resetSettings();
    } else {
        clickedReset = true;
        document.querySelector("#resetSettings .confirm").classList.add("showConfirm");
        resetBtnTimer = setTimeout(() => {
            clearTimeout(resetBtnTimer);
            resetBtnTimer = null;
            clickedReset = false;
            document.querySelector("#resetSettings .confirm").classList.remove("showConfirm");
        }, 3000);
    }
})

function clampValue(node, min, max) {
    var val = node.value;
    if (min != null && val < min)
        val = min;
    if (max != null && val > max)
        val = max;
    node.value = val;
}

// -----------------
// Window Animations
// -----------------

var currentPanel = document.querySelector("#bonkImages"), playing = false;

// Window Event Listeners
document.querySelector("#header").addEventListener("click", () => { showPanelLarge("statusWindow"); });

document.querySelector("#helpButton").addEventListener("click", () => { ipcRenderer.send("help"); });
document.querySelector("#calibrateButton").addEventListener("click", () => { showPanelLarge("statusWindow", true); });
document.querySelector("#settingsButton").addEventListener("click", () => { showPanelLarge("settings"); });
document.querySelector("#testBonksButton").addEventListener("click", () => { showPanelLarge("testBonks"); });

document.querySelector("#imagesButton").addEventListener("click", () => { showPanel("bonkImages"); });
document.querySelector("#soundsButton").addEventListener("click", () => { showPanel("bonkSounds"); });
document.querySelector("#customButton").addEventListener("click", () => { showPanel("customBonks"); });
document.querySelector("#eventsButton").addEventListener("click", () => { showPanel("events"); });

document.querySelector("#imagesDefaultTab").addEventListener("click", () => { showTab("imageTable", ["guardImageTable", "coinImageTable"], "imagesDefaultTab", ["imagesGuardTab", "imagesCoinTab"]); });
document.querySelector("#imagesGuardTab").addEventListener("click", () => { showTab("guardImageTable", ["imageTable", "coinImageTable"], "imagesGuardTab", ["imagesDefaultTab", "imagesCoinTab"]); });
document.querySelector("#imagesCoinTab").addEventListener("click", () => { showTab("coinImageTable", ["imageTable", "guardImageTable"], "imagesCoinTab", ["imagesDefaultTab", "imagesGuardTab"]); });

document.querySelector("#soundsDefaultTab").addEventListener("click", () => { showTab("soundTable", ["guardSoundTable", "coinSoundTable"], "soundsDefaultTab", ["soundsGuardTab", "soundsCoinTab"]); });
document.querySelector("#soundsGuardTab").addEventListener("click", () => { showTab("guardSoundTable", ["soundTable", "coinSoundTable"], "soundsGuardTab", ["soundsDefaultTab", "soundsCoinTab"]); });
document.querySelector("#soundsCoinTab").addEventListener("click", () => { showTab("coinSoundTable", ["soundTable", "guardSoundTable"], "soundsCoinTab", ["soundsDefaultTab", "soundsGuardTab"]) });

document.querySelectorAll(".windowBack").forEach((element) => { element.addEventListener("click", () => { back(); }) });

function showTab(show, hide, select, deselect) {
    if (show == "soundTable")
        openSounds();
    else if (show == "guardSoundTable")
        openGuardSounds();
    else if (show == "coinSoundTable")
        openCoinSounds();

    for (var i = 0; i < hide.length; i++)
        document.querySelector("#" + hide[i]).classList.add("hidden");

    document.querySelector("#" + show).classList.remove("hidden");

    for (var i = 0; i < deselect.length; i++)
        document.querySelector("#" + deselect[i]).classList.remove("selectedTab");

    document.querySelector("#" + select).classList.add("selectedTab");
}

function removeAll(panel) {
    panel.classList.remove("leftIn");
    panel.classList.remove("rightIn");
    panel.classList.remove("upIn");
    panel.classList.remove("downIn");

    panel.classList.remove("leftOut");
    panel.classList.remove("rightOut");
    panel.classList.remove("upOut");
    panel.classList.remove("downOut");
}

var panelStack = [];

function back() {
    if (!playingLarge && openPanelLarge) {
        openPanelLarge = false;

        var anim = Math.floor(Math.random() * 4);
        switch (anim) {
            case 0:
                anim = "left";
                break;
            case 1:
                anim = "right";
                break;
            case 2:
                anim = "up";
                break;
            case 3:
                anim = "down";
                break;
        }

        removeAll(document.querySelector("#wideWindow"));
        document.querySelector("#wideWindow").classList.add(anim + "Out");

        if (currentPanelLarge.id == "statusWindow" && (status == 3 || status == 4 || status == 7)) {
            cancelCalibrate = true;
            ipcRenderer.send("cancelCalibrate");
        }

        playingLarge = true;
        setTimeout(() => {
            currentPanelLarge.classList.add("hidden");
            currentPanelLarge = null;
            playingLarge = false;
            cancelCalibrate = false;
            document.querySelector("#wideWindow").classList.add("hidden");
        }, 500);
    }
    else if (panelStack.length > 0)
        showPanel(panelStack.pop(), false);
}

function showPanel(panel, stack) {
    if (!playing) {
        if (document.querySelector("#" + panel) != currentPanel) {
            playing = true;

            var anim = Math.floor(Math.random() * 4);
            switch (anim) {
                case 0:
                    anim = "left";
                    break;
                case 1:
                    anim = "right";
                    break;
                case 2:
                    anim = "up";
                    break;
                case 3:
                    anim = "down";
                    break;
            }

            var oldPanel = currentPanel;
            removeAll(oldPanel);
            oldPanel.classList.add(anim + "Out");

            setTimeout(() => {
                oldPanel.classList.add("hidden");
            }, 500);

            if (stack == null)
                panelStack = [];

            if (stack == null || !stack) {

                document.querySelector("#sideBar").querySelectorAll(".overlayButton").forEach((element) => { element.classList.remove("buttonSelected"); });

                if (panel == "bonkImages") {
                    document.querySelector("#imagesButton").querySelector(".overlayButton").classList.add("buttonSelected");
                    openImages();
                }
                else if (panel == "bonkSounds") {
                    document.querySelector("#soundsButton").querySelector(".overlayButton").classList.add("buttonSelected");
                    openSounds();
                    openGuardSounds();
                    openCoinSounds();
                }
                else if (panel == "customBonks") {
                    document.querySelector("#customButton").querySelector(".overlayButton").classList.add("buttonSelected");
                    openBonks();
                }
                else if (panel == "events") {
                    document.querySelector("#eventsButton").querySelector(".overlayButton").classList.add("buttonSelected");
                    openEvents();
                }
            }
            else if (stack)
                panelStack.push(oldPanel.id);

            currentPanel = document.querySelector("#" + panel);
            currentPanel.classList.remove("hidden");
            removeAll(currentPanel);
            currentPanel.classList.add(anim + "In");

            setTimeout(() => {
                playing = false;
            }, 500);
        }
    }
}

var currentPanelLarge, playingLarge = false, openPanelLarge = false, cancelCalibrate = false;

function showPanelLarge(panel) {
    if (!playingLarge) {
        if (document.querySelector("#" + panel) != currentPanelLarge) {
            var anim = Math.floor(Math.random() * 4);
            switch (anim) {
                case 0:
                    anim = "left";
                    break;
                case 1:
                    anim = "right";
                    break;
                case 2:
                    anim = "up";
                    break;
                case 3:
                    anim = "down";
                    break;
            }

            if (panel == "testBonks")
                openTestBonks();

            var oldPanel = currentPanelLarge;
            currentPanelLarge = document.querySelector("#" + panel);
            removeAll(currentPanelLarge);
            currentPanelLarge.classList.remove("hidden");

            if (!openPanelLarge) {
                openPanelLarge = true;
                removeAll(document.querySelector("#wideWindow"));
                document.querySelector("#wideWindow").classList.remove("hidden");
                document.querySelector("#wideWindow").classList.add(anim + "In");
            }
            else {
                if (oldPanel != null) {
                    if (oldPanel.id == "statusWindow" && (status == 3 || status == 4 || status == 7))
                        ipcRenderer.send("cancelCalibrate");

                    removeAll(oldPanel);
                    oldPanel.classList.add(anim + "Out");
                    setTimeout(() => {
                        oldPanel.classList.add("hidden");
                    }, 500);
                }

                currentPanelLarge.classList.add(anim + "In");
            }

            playingLarge = true;
            setTimeout(() => {
                playingLarge = false;
            }, 500);
        }
        else
            back();
    }
}

// 检查版本
function checkVersion() {
    var versionRequest = new XMLHttpRequest();
    versionRequest.onreadystatechange = function () {
        if (this.readyState == 4 && this.status == 200) {
            const latestVersion = JSON.parse(this.responseText);
            if (parseFloat(latestVersion.tag_name) > version)
                document.querySelector("#newVersion").classList.remove("hidden");
        }
    };
    // Open the request and send it.
    versionRequest.open("GET", "https://api.github.com/repos/LuiScreaMed/karasubonk/releases/latest", true);
    versionRequest.send();
}

// -----------------------
// Testing and Calibration
// -----------------------

document.querySelector("#testSingle").addEventListener("click", () => { ipcRenderer.send("single"); });
document.querySelector("#testBarrage").addEventListener("click", () => { ipcRenderer.send("barrage"); });
document.querySelector("#testGuard").addEventListener("click", () => { ipcRenderer.send("guard"); });
document.querySelector("#testFollow").addEventListener("click", () => { ipcRenderer.send("follow"); });
document.querySelector("#testSuperChat").addEventListener("click", () => { ipcRenderer.send("superChat"); });

document.querySelector("#calibrateButton").addEventListener("click", () => { if (!cancelCalibrate) ipcRenderer.send("startCalibrate"); });
document.querySelector("#nextCalibrate").addEventListener("click", () => { ipcRenderer.send("nextCalibrate"); });
document.querySelector("#cancelCalibrate").addEventListener("click", () => { ipcRenderer.send("cancelCalibrate"); back(); });

// Test a specific item
async function testItem(index) {
    const throws = await getData("throws");
    ipcRenderer.send("testItem", throws[index]);
}

function testCustomBonk(customName) {
    ipcRenderer.send("testCustomBonk", customName);
}

// Toast 气泡
async function showToast(text = "", type = "default", duration = 1500) {
    let toast = document.createElement("div");
    toast.classList.add("toast");
    toast.innerText = text;
    toast.classList.add("show");
    toast.classList.add(type);
    document.body.prepend(toast);
    await sleep(400);
    setTimeout(async () => {
        toast.classList.remove("show");
        toast.classList.add("hide");

        await sleep(400);
        toast.remove();
    }, duration)
}

// toast type 气泡类型
const ToastType = {
    success: "success",
    error: "error",
    default: "default"
}

// sleep function
function sleep(duration) {
    return new Promise(function (resolve) {
        setTimeout(resolve, duration);
    });
}

var audio;
// audio preview
// 音频预览
async function previewAudio(sound, volume) {
    let globalVolume = await getData("volume");
    if (audio) {
        if (!audio.paused) {
            audio.pause();
        }
        audio = undefined;
    }
    audio = new Audio();
    audio.addEventListener('canplaythrough', function () {
        this.addEventListener('ended', () => {
            audio = undefined;
        })
        this.play();
    });
    audio.volume = volume * globalVolume;
    audio.src = userDataPath + "/" + sound.substr(0, sound.indexOf("/") + 1) + encodeURIComponent(sound.substr(sound.indexOf("/") + 1));
}

// 重置设置
async function resetSettings() {
    ipcRenderer.send("logger", "ResetSettings, deleting user data...");
    let mask = document.createElement("div");
    mask.classList.add("resetMask");
    mask.innerText = "正在重置设置...";
    mask.classList.add("show");
    document.body.prepend(mask);
    try {
        if (deleteDirAndFiles(userDataPath)) {
            mask.innerText = "重置完成，将在3秒后重启...";
            setTimeout(() => {
                ipcRenderer.send("resetComplete");
            }, 3000);
        } else {
            showToast("重置失败！", ToastType.error)
            mask.classList.remove("show");
            mask.classList.add("hide");

            await sleep(400);
            mask.remove();
        }
    } catch (e) {
        console.log(e);
        ipcRenderer.send("logger", "ResetSettings failed", e);
        showToast("重置失败！", ToastType.error)
        mask.classList.remove("show");
        mask.classList.add("hide");

        await sleep(400);
        mask.remove();
    }
}

// 删除文件夹和文件
function deleteDirAndFiles(path) {
    // console.log("currentpath: " + path);
    let files = [];
    if (fs.existsSync(path)) {

        files = fs.readdirSync(path);
        // console.log(files);
        for (let i = 0; i < files.length; i++) {
            let curPath = path + "\\" + files[i];
            // console.log(files[i])
            if (fs.statSync(curPath).isDirectory()) {
                deleteDirAndFiles(curPath);
            } else {
                try {
                    fs.unlinkSync(curPath);
                } catch (e) { }
            }
        }

        try {
            fs.rmdirSync(path);
        } catch (e) { }
        return true;
    } else {
        return false;
    }
}