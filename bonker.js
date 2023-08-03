// Karasubot Websocket Scripts
const version = 1.07;

var socketKarasu, karasuIsOpen = false;
var isCalibrating = false;

var previousModelPosition = {
    "positionX": 0,
    "positionY": 0,
    "rotation": 0,
    "size": 0
};
function endCalibration() {
    if (isCalibrating) {
        isCalibrating = false;
        document.querySelector("#guide").hidden = true;
        document.querySelector("#guideText").hidden = true;
        if (vTubeIsOpen) {
            var request = {
                "apiName": "VTubeStudioPublicAPI",
                "apiVersion": "1.0",
                "requestID": "9",
                "messageType": "MoveModelRequest",
                "data": {
                    "timeInSeconds": 0.5,
                    "valuesAreRelativeToModel": false,
                    "positionX": previousModelPosition.positionX,
                    "positionY": previousModelPosition.positionY,
                    "rotation": previousModelPosition.rotation,
                    "size": previousModelPosition.size
                }
            }
            socketVTube.onmessage = null;
            socketVTube.send(JSON.stringify(request));
        }
    }
}

var guideX = null, guideY = null;
document.onclick = function (e) {
    guideX = e.clientX;
    guideY = e.clientY;
    document.querySelector("#guide").style.left = (guideX - 25) + "px";
    document.querySelector("#guide").style.top = (guideY - 25) + "px";
}

var badVersion = false, mainVersion;
function tryWarnVersion() {
    document.querySelector("#mainVersion").innerHTML = mainVersion;
    document.querySelector("#bonkerVersion").innerHTML = version;
    document.querySelector("#warnVersion").hidden = !badVersion;
}

function connectKarasu() {
    socketKarasu = new WebSocket("ws://localhost:" + ports[0]);
    socketKarasu.onopen = function () {
        karasuIsOpen = true;
        console.log("Connected to Karasubot!");

        // Stop attempting to reconnect unless we lose connection
        clearInterval(tryConnectKarasu);
        tryConnectKarasu = setInterval(function () {
            if (socketKarasu.readyState != 1) {
                karasuIsOpen = false;
                console.log("Lost connection to Karasubot!");
                endCalibration();
                clearInterval(tryConnectKarasu);
                tryConnectKarasu = setInterval(retryConnectKarasu, 1000 * 3);
            }
        }, 1000 * 3);
    };
    // Process incoming requests
    socketKarasu.onmessage = function (event) {
        var data = JSON.parse(event.data);

        if (data.type == "versionReport") {
            mainVersion = parseFloat(data.version);
            badVersion = mainVersion != version;
            tryWarnVersion();
            socketKarasu.send(JSON.stringify({
                "type": "versionReport",
                "version": version
            }));
        }
        else if (data.type == "calibrating") {
            if (guideX == null)
                guideX = window.innerWidth / 2;
            if (guideY == null)
                guideY = window.innerHeight / 2;
            if (data.stage >= 0 && data.stage != 4) {
                document.querySelector("#guide").hidden = false;
                document.querySelector("#guideText").hidden = false;
            }
            else {
                document.querySelector("#guide").hidden = true;
                document.querySelector("#guideText").hidden = true;
            }
            switch (data.stage) {
                // Stage -1 is storing current position information
                case -1:
                    var request = {
                        "apiName": "VTubeStudioPublicAPI",
                        "apiVersion": "1.0",
                        "requestID": "11",
                        "messageType": "CurrentModelRequest"
                    }
                    socketVTube.onmessage = function (event) {
                        socketVTube.onmessage = null;
                        const modelPosition = JSON.parse(event.data).data.modelPosition;
                        previousModelPosition = {
                            "positionX": modelPosition.positionX,
                            "positionY": modelPosition.positionY,
                            "rotation": modelPosition.rotation,
                            "size": modelPosition.size
                        }
                    }
                    socketVTube.send(JSON.stringify(request));
                    break;
                // Stage 0 is calibrating at smallest size
                case 0:
                    isCalibrating = true;

                    var request = {
                        "apiName": "VTubeStudioPublicAPI",
                        "apiVersion": "1.0",
                        "requestID": "7",
                        "messageType": "MoveModelRequest",
                        "data": {
                            "timeInSeconds": 0.5,
                            "valuesAreRelativeToModel": false,
                            "rotation": 0,
                            "size": -100
                        }
                    }
                    socketVTube.onmessage = null;
                    socketVTube.send(JSON.stringify(request));
                    break;
                // Stage 1 is sending min size position information back
                case 1:
                    var request = {
                        "apiName": "VTubeStudioPublicAPI",
                        "apiVersion": "1.0",
                        "requestID": "8",
                        "messageType": "CurrentModelRequest"
                    }
                    socketVTube.onmessage = function (event) {
                        const tempData = JSON.parse(event.data).data;
                        request = {
                            "type": "calibrating",
                            "stage": "min",
                            "positionX": tempData.modelPosition.positionX - (((guideX / window.innerWidth) * 2) - 1),
                            "positionY": tempData.modelPosition.positionY + (((guideY / window.innerHeight) * 2) - 1),
                            "size": tempData.modelPosition.size,
                            "modelID": tempData.modelID
                        }
                        socketVTube.onmessage = null;
                        socketKarasu.send(JSON.stringify(request));
                    }
                    socketVTube.send(JSON.stringify(request));
                    break;
                // Stage 2 is calibrating at largest size
                case 2:
                    var request = {
                        "apiName": "VTubeStudioPublicAPI",
                        "apiVersion": "1.0",
                        "requestID": "9",
                        "messageType": "MoveModelRequest",
                        "data": {
                            "timeInSeconds": 0.5,
                            "valuesAreRelativeToModel": false,
                            "rotation": 0,
                            "size": 100
                        }
                    }
                    socketVTube.onmessage = null;
                    socketVTube.send(JSON.stringify(request));
                    break;
                // Stage 3 is sending max size position information back
                case 3:
                    var request = {
                        "apiName": "VTubeStudioPublicAPI",
                        "apiVersion": "1.0",
                        "requestID": "10",
                        "messageType": "CurrentModelRequest"
                    }
                    socketVTube.onmessage = function (event) {
                        const tempData = JSON.parse(event.data).data;
                        request = {
                            "type": "calibrating",
                            "stage": "max",
                            "positionX": tempData.modelPosition.positionX - (((guideX / window.innerWidth) * 2) - 1),
                            "positionY": tempData.modelPosition.positionY + (((guideY / window.innerHeight) * 2) - 1),
                            "size": tempData.modelPosition.size,
                            "modelID": tempData.modelID
                        }
                        socketVTube.onmessage = null;
                        socketKarasu.send(JSON.stringify(request));
                    }
                    socketVTube.send(JSON.stringify(request));
                    break;
                // Stage 4 is finishing calibration
                case 4:
                    endCalibration();
                    break;
            }
        }
        else if (data.type == "getAuthVTS") {
            if (data.token == null) {
                console.log("Null Token");
                failedAuth = true;
                tryAuthorization();
            }
            else {
                var request = {
                    "apiName": "VTubeStudioPublicAPI",
                    "apiVersion": "1.0",
                    "requestID": "1",
                    "messageType": "AuthenticationRequest",
                    "data": {
                        "pluginName": "KBonk bilibili", // For avoiding interruption between this plugin with the original plugin
                        "pluginDeveloper": "LuiScreaMed",
                        "authenticationToken": data.token
                    }
                }
                socketVTube.onmessage = function (event) {
                    socketVTube.onmessage = null;
                    response = JSON.parse(event.data);
                    if (response.data.authenticated) {
                        console.log("Authenticated");
                        vTubeIsOpen = true;
                        subscribeModelLoad();
                    }
                    else {
                        console.log("Invalid Token");
                        failedAuth = true;
                        tryAuthorization();
                    }
                }
                socketVTube.send(JSON.stringify(request));
            }
        }
        // 获取表情列表
        // get expressions
        else if (data.type == "getExpressionList") {
            console.log("getExpressionList");
            var request = {
                "apiName": "VTubeStudioPublicAPI",
                "apiVersion": "1.0",
                "requestID": "12",
                "messageType": "ExpressionStateRequest",
                "data": {}
            }

            socketVTube.onmessage = function (event) {
                socketVTube.onmessage = null;
                const tempData = JSON.parse(event.data);
                let expressions = [];
                if (tempData.messageType == "ExpressionStateResponse") {
                    console.log("Received VTS Model Expressions");
                    expressions = tempData.data.expressions;
                }
                else if (tempData.messageType == "APIError")
                    console.log("VTS Model Expressions Request Failed");

                request = {
                    "type": "expressions",
                    "expressions": expressions
                }
                socketKarasu.send(JSON.stringify(request));
            }

            socketVTube.send(JSON.stringify(request));
        }
        else if (!isCalibrating && vTubeIsOpen) {
            var request = {
                "apiName": "VTubeStudioPublicAPI",
                "apiVersion": "1.0",
                "requestID": "3",
                "messageType": "InputParameterListRequest"
            }
            socketVTube.onmessage = async function (event) {
                const tempData = JSON.parse(event.data).data;
                const paramInfo = [...tempData.defaultParameters, ...tempData.customParameters];
                const modelID = tempData.modelID;

                const faceWidthMin = data.data[modelID + "Min"] == null ? 0 : data.data[modelID + "Min"][0];
                const faceHeightMin = data.data[modelID + "Min"] == null ? 0 : data.data[modelID + "Min"][1];
                const faceWidthMax = data.data[modelID + "Max"] == null ? 0 : data.data[modelID + "Max"][0];
                const faceHeightMax = data.data[modelID + "Max"] == null ? 0 : data.data[modelID + "Max"][1];

                let tempParametersH = [data.data.paramsFaceAngleX, data.data.paramsFaceAngleZ, data.data.paramsFacePositionX];
                let tempParametersV = [data.data.paramsFaceAngleY];
                let tempParametersE = [data.data.paramsEyeOpenLeft, data.data.paramsEyeOpenRight];
                if (data.data.customizeInputParams) {
                    for (var i = 0; i < tempParametersH.length; i++) {
                        if (!tempParametersH[i]) {
                            tempParametersH[i] = parametersH[i];
                        }
                    }
                    for (var i = 0; i < tempParametersV.length; i++) {
                        if (!tempParametersV[i]) {
                            tempParametersV[i] = parametersV[i];
                        }
                    }
                    for (var i = 0; i < tempParametersE.length; i++) {
                        if (!tempParametersE[i]) {
                            tempParametersE[i] = parametersE[i];
                        }
                    }
                } else {
                    tempParametersH = parametersH;
                    tempParametersV = parametersV;
                    tempParametersE = parametersE;
                }

                data.data.parametersHorizontal = [];
                for (var i = 0; i < tempParametersH.length; i++) {
                    var value = 0, min = -30, max = 30;
                    for (var j = 0; j < paramInfo.length; j++) {
                        if (paramInfo[j].name == tempParametersH[i]) {
                            value = paramInfo[j].value;
                            min = paramInfo[j].min;
                            max = paramInfo[j].max;
                            break;
                        }
                    }
                    data.data.parametersHorizontal[i] = [tempParametersH[i], value, min, max];
                }

                data.data.parametersVertical = [];
                for (var i = 0; i < tempParametersV.length; i++) {
                    var value = 0, min = -30, max = 30;
                    for (var j = 0; j < paramInfo.length; j++) {
                        if (paramInfo[j].name == tempParametersV[i]) {
                            value = paramInfo[j].value;
                            min = paramInfo[j].min;
                            max = paramInfo[j].max;
                            break;
                        }
                    }
                    data.data.parametersVertical[i] = [tempParametersV[i], value, min, max];
                }

                data.data.parametersEyes = [];
                for (var i = 0; i < tempParametersE.length; i++) {
                    var value = 0, min = 0, max = 1;
                    for (var j = 0; j < paramInfo.length; j++) {
                        if (paramInfo[j].name == tempParametersE[i]) {
                            min = paramInfo[j].min;
                            max = paramInfo[j].max;
                            break;
                        }
                    }
                    data.data.parametersEyes[i] = [tempParametersE[i], Math.abs(max - min)];
                }

                console.log("Received " + data.type);

                switch (data.type) {
                    case "single":
                        bonk(data.image, data.weight, data.scale, data.sound, data.volume, data.data, faceWidthMin, faceWidthMax, faceHeightMin, faceHeightMax, null, false);
                        break;
                    case "barrage":
                        var i = 0;
                        const images = data.image;
                        const weights = data.weight;
                        const scales = data.scale;
                        const sounds = data.sound;
                        const volumes = data.volume;
                        const max = Math.min(images.length, sounds.length, weights.length);

                        bonk(images[i], weights[i], scales[i], sounds[i], volumes[i], data.data, faceWidthMin, faceWidthMax, faceHeightMin, faceHeightMax, null, false);
                        i++;
                        if (i < max) {
                            var bonker = setInterval(function () {
                                bonk(images[i], weights[i], scales[i], sounds[i], volumes[i], data.data, faceWidthMin, faceWidthMax, faceHeightMin, faceHeightMax, null, false);
                                if (++i >= max)
                                    clearInterval(bonker);
                            }, data.data.barrageFrequency * 1000);
                        }
                        break;
                    default:
                        if (data.data.customBonks[data.type].barrageCountOverride)
                            data.data.barrageCount = data.data.customBonks[data.type].barrageCount;
                        if (data.data.customBonks[data.type].barrageFrequencyOverride)
                            data.data.barrageFrequency = data.data.customBonks[data.type].barrageFrequency;
                        if (data.data.customBonks[data.type].throwDurationOverride)
                            data.data.throwDuration = data.data.customBonks[data.type].throwDuration;
                        if (data.data.customBonks[data.type].throwAngleOverride) {
                            data.data.throwAngleMin = data.data.customBonks[data.type].throwAngleMin;
                            data.data.throwAngleMax = data.data.customBonks[data.type].throwAngleMax;
                        }
                        if (data.data.customBonks[data.type].spinSpeedOverride) {
                            data.data.spinSpeedMin = data.data.customBonks[data.type].spinSpeedMin;
                            data.data.spinSpeedMax = data.data.customBonks[data.type].spinSpeedMax;
                        }
                        // 击中后隐藏
                        const hideOnHit = data.data.customBonks[data.type].hideOnHit;

                        var i = 0;
                        const cImages = data.image;
                        const cWeights = data.weight;
                        const cScales = data.scale;
                        const cSounds = data.sound;
                        const cVolumes = data.volume;
                        const cImpactDecals = data.impactDecal;
                        var windupSound = data.windupSound[0];
                        const cMax = Math.min(cImages.length, cSounds.length, cWeights.length, cImpactDecals.length);

                        var windup, canPlayWindup;
                        if (windupSound != null) {
                            windup = new Audio();
                            windup.src = windupSound.location.substr(0, windupSound.location.indexOf("/") + 1) + encodeURIComponent(windupSound.location.substr(windupSound.location.indexOf("/") + 1));
                            windup.volume = windupSound.volume * data.data.volume;
                            canPlayWindup = false;
                            windup.oncanplaythrough = function () { canPlayWindup = true; }
                        }
                        else
                            canPlayWindup = true;

                        while (!canPlayWindup)
                            await new Promise(resolve => setTimeout(resolve, 10));

                        if (windupSound != null)
                            windup.play();

                        setTimeout(() => {
                            bonk(cImages[i], cWeights[i], cScales[i], cSounds[i], cVolumes[i], data.data, faceWidthMin, faceWidthMax, faceHeightMin, faceHeightMax, cImpactDecals[i], hideOnHit);
                            i++;
                            if (i < cMax) {
                                var bonker = setInterval(function () {
                                    bonk(cImages[i], cWeights[i], cScales[i], cSounds[i], cVolumes[i], data.data, faceWidthMin, faceWidthMax, faceHeightMin, faceHeightMax, cImpactDecals[i], hideOnHit);
                                    if (++i >= cMax)
                                        clearInterval(bonker);
                                }, data.data.barrageFrequency * 1000);
                            }
                        }, data.data.customBonks[data.type].windupDelay * 1000);
                        break;
                }
            }
            socketVTube.send(JSON.stringify(request));
        }
    }
}

connectKarasu();
// Retry connection to Karasubot every 5 seconds
var tryConnectKarasu = setInterval(retryConnectKarasu, 1000 * 3);

function retryConnectKarasu() {
    console.log("Retrying connection to Karasubot...");
    connectKarasu();
}

// VTube Studio API Scripts

var socketVTube;
var vTubeIsOpen = false;

function connectVTube() {
    socketVTube = new WebSocket("ws://localhost:" + ports[1]);
    socketVTube.onopen = function () {
        console.log("Connected to VTube Studio!");

        clearInterval(tryConnectVTube);
        tryConnectVTube = setInterval(function () {
            if (socketVTube.readyState != 1) {
                vTubeIsOpen = false;
                console.log("Lost connection to VTube Studio!");
                endCalibration();
                clearInterval(tryConnectVTube);
                tryConnectVTube = setInterval(retryConnectVTube, 1000 * 3);
            }
        }, 1000 * 3);

        setTimeout(tryAuthorization, 1 + Math.random() * 2);
    };
}

connectVTube();
// Retry connection to VTube Studio every 3 seconds
var tryConnectVTube = setInterval(retryConnectVTube, 1000 * 3);

function retryConnectVTube() {
    console.log("Retrying connection to VTube Studio...");
    connectVTube();
}

var failedAuth = false;
function tryAuthorization() {
    if (!vTubeIsOpen && tryConnectVTube == null)
        tryConnectVTube = setInterval(retryConnectVTube, 1000 * 3);
    else if (karasuIsOpen) {
        if (failedAuth) {
            var request = {
                "apiName": "VTubeStudioPublicAPI",
                "apiVersion": "1.0",
                "requestID": "0",
                "messageType": "AuthenticationTokenRequest",
                "data": {
                    "pluginName": "KBonk bilibili", // For avoiding interruption between this plugin with the original plugin
                    "pluginDeveloper": "LuiScreaMed",
                    "pluginIcon": "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UHhsQFIAAAAAAAAAAAAKdmVjdG9yRGF0YWJvb2wBAAAAAFBnUHNlbnVtAAAAAFBnUHMAAAAAUGdQQwAAAABMZWZ0VW50RiNSbHQAAAAAAAAAAAAAAABUb3AgVW50RiNSbHQAAAAAAAAAAAAAAABTY2wgVW50RiNQcmNAWQAAAAAAAAAAABBjcm9wV2hlblByaW50aW5nYm9vbAAAAAAOY3JvcFJlY3RCb3R0b21sb25nAAAAAAAAAAxjcm9wUmVjdExlZnRsb25nAAAAAAAAAA1jcm9wUmVjdFJpZ2h0bG9uZwAAAAAAAAALY3JvcFJlY3RUb3Bsb25nAAAAAAA4QklNA+0AAAAAABAASAAAAAEAAQBIAAAAAQABOEJJTQQmAAAAAAAOAAAAAAAAAAAAAD+AAAA4QklNBA0AAAAAAAQAAAAeOEJJTQQZAAAAAAAEAAAAHjhCSU0D8wAAAAAACQAAAAAAAAAAAQA4QklNJxAAAAAAAAoAAQAAAAAAAAABOEJJTQP1AAAAAABIAC9mZgABAGxmZgAGAAAAAAABAC9mZgABAKGZmgAGAAAAAAABADIAAAABAFoAAAAGAAAAAAABADUAAAABAC0AAAAGAAAAAAABOEJJTQP4AAAAAABwAAD/////////////////////////////A+gAAAAA/////////////////////////////wPoAAAAAP////////////////////////////8D6AAAAAD/////////////////////////////A+gAADhCSU0EAAAAAAAAAgAAOEJJTQQCAAAAAAACAAA4QklNBDAAAAAAAAEBADhCSU0ELQAAAAAABgABAAAAAjhCSU0ECAAAAAAAEAAAAAEAAAJAAAACQAAAAAA4QklNBB4AAAAAAAQAAAAAOEJJTQQaAAAAAAM7AAAABgAAAAAAAAAAAAAAgAAAAIAAAAADVv5QzwAxAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAACAAAAAgAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAABAAAAABAAAAAAAAbnVsbAAAAAIAAAAGYm91bmRzT2JqYwAAAAEAAAAAAABSY3QxAAAABAAAAABUb3AgbG9uZwAAAAAAAAAATGVmdGxvbmcAAAAAAAAA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ZWhpSHpyZVN6TlRjemtjOWQiPz4gPHg6eG1wbWV0YSB4bWxuczp4PSJhZG9iZTpuczptZXRhLyIgeDp4bXB0az0iQWRvYmUgWE1QIENvcmUgNS42LWMxNDUgNzkuMTYzNDk5LCAyMDE4LzA4LzEzLTE2OjQwOjIyICAgICAgICAiPiA8cmRmOlJERiB4bWxuczpyZGY9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkvMDIvMjItcmRmLXN5bnRheC1ucyMiPiA8cmRmOkRlc2NyaXB0aW9uIHJkZjphYm91dD0iIiB4bWxuczp4bXA9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC8iIHhtbG5zOmRjPSJodHRwOi8vcHVybC5vcmcvZGMvZWxlbWVudHMvMS4xLyIgeG1sbnM6cGhvdG9zaG9wPSJodHRwOi8vbnMuYWRvYmUuY29tL3Bob3Rvc2hvcC8xLjAvIiB4bWxuczp4bXBNTT0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wL21tLyIgeG1sbnM6c3RFdnQ9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9zVHlwZS9SZXNvdXJjZUV2ZW50IyIgeG1wOkNyZWF0b3JUb29sPSJBZG9iZSBQaG90b3Nob3AgQ0MgMjAxOSAoV2luZG93cykiIHhtcDpDcmVhdGVEYXRlPSIyMDIzLTA1LTIwVDAxOjE5OjQzKzA4OjAwIiB4bXA6TW9kaWZ5RGF0ZT0iMjAyMy0wNS0zMFQwMjo0ODowNiswODowMCIgeG1wOk1ldGFkYXRhRGF0ZT0iMjAyMy0wNS0zMFQwMjo0ODowNiswODowMCIgZGM6Zm9ybWF0PSJpbWFnZS9qcGVnIiBwaG90b3Nob3A6Q29sb3JNb2RlPSIzIiBwaG90b3Nob3A6SUNDUHJvZmlsZT0ic1JHQiBJRUM2MTk2Ni0yLjEiIHhtcE1NOkluc3RhbmNlSUQ9InhtcC5paWQ6NzlhNzdhNzUtZjMxMi1kYjQyLWI0ZjAtNzRjZTgxZTg0OTcyIiB4bXBNTTpEb2N1bWVudElEPSJhZG9iZTpkb2NpZDpwaG90b3Nob3A6NDhjZTg3MmEtYzRkNi1hMTQ2LTkwOWMtMTdmODc0YjU5MzZkIiB4bXBNTTpPcmlnaW5hbERvY3VtZW50SUQ9InhtcC5kaWQ6MjIzZWI2MzQtYjVmMS04MDQyLTlhYTQtYmE5YjI0MzA3MTlhIj4gPHhtcE1NOkhpc3Rvcnk+IDxyZGY6U2VxPiA8cmRmOmxpIHN0RXZ0OmFjdGlvbj0iY3JlYXRlZCIgc3RFdnQ6aW5zdGFuY2VJRD0ieG1wLmlpZDoyMjNlYjYzNC1iNWYxLTgwNDItOWFhNC1iYTliMjQzMDcxOWEiIHN0RXZ0OndoZW49IjIwMjMtMDUtMjBUMDE6MTk6NDMrMDg6MDAiIHN0RXZ0OnNvZnR3YXJlQWdlbnQ9IkFkb2JlIFBob3Rvc2hvcCBDQyAyMDE5IChXaW5kb3dzKSIvPiA8cmRmOmxpIHN0RXZ0OmFjdGlvbj0iY29udmVydGVkIiBzdEV2dDpwYXJhbWV0ZXJzPSJmcm9tIGltYWdlL3BuZyB0byBpbWFnZS9qcGVnIi8+IDxyZGY6bGkgc3RFdnQ6YWN0aW9uPSJzYXZlZCIgc3RFdnQ6aW5zdGFuY2VJRD0ieG1wLmlpZDo3OWE3N2E3NS1mMzEyLWRiNDItYjRmMC03NGNlODFlODQ5NzIiIHN0RXZ0OndoZW49IjIwMjMtMDUtMzBUMDI6NDg6MDYrMDg6MDAiIHN0RXZ0OnNvZnR3YXJlQWdlbnQ9IkFkb2JlIFBob3Rvc2hvcCBDQyAyMDE5IChXaW5kb3dzKSIgc3RFdnQ6Y2hhbmdlZD0iLyIvPiA8L3JkZjpTZXE+IDwveG1wTU06SGlzdG9yeT4gPC9yZGY6RGVzY3JpcHRpb24+IDwvcmRmOlJERj4gPC94OnhtcG1ldGE+ICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPD94cGFja2V0IGVu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"
                }
            }
            socketVTube.onmessage = function (event) {
                socketVTube.onmessage = null;
                var response = JSON.parse(event.data);
                if (response.messageType == "AuthenticationTokenResponse") {
                    console.log("Received Authentication Token");
                    failedAuth = false;

                    request = {
                        "type": "setAuthVTS",
                        "token": response.data.authenticationToken
                    }
                    socketKarasu.send(JSON.stringify(request));
                }
                else if (response.messageType == "APIError" && response.data.errorID == 50)
                    console.log("Authentication Declined");
            }
            socketVTube.send(JSON.stringify(request));
        }
        else {
            var request = {
                "type": "getAuthVTS"
            }
            socketKarasu.send(JSON.stringify(request));
        }
    }
    else {
        setTimeout(tryAuthorization, 1000);
    }
}

// Report status of VTube studio connection once a second
setInterval(() => {
    if (karasuIsOpen) {
        var request = {
            "type": "status",
            "connectedVTube": vTubeIsOpen
        }
        socketKarasu.send(JSON.stringify(request));
    }
}, 1000);

function bonk(image, weight, scale, sound, volume, data, faceWidthMin, faceWidthMax, faceHeightMin, faceHeightMax, impactDecal, hideOnHit) {
    if (vTubeIsOpen) {
        var request = {
            "apiName": "VTubeStudioPublicAPI",
            "apiVersion": "1.0",
            "requestID": "4",
            "messageType": "CurrentModelRequest"
        }
        socketVTube.onmessage = function (event) {
            const pos = JSON.parse(event.data).data.modelPosition;
            if (pos != null) {
                const offsetX = faceWidthMin + (((pos.size + 100) / 200) * (faceWidthMax - faceWidthMin));
                const offsetY = faceHeightMin + (((pos.size + 100) / 200) * (faceHeightMax - faceHeightMin));
                const xPos = (parseFloat(pos.positionX - offsetX) + 1) / 2;
                const yPos = 1 - ((parseFloat(pos.positionY - offsetY) + 1) / 2);
                const fromLeft = Math.random() * 1.5 - 0.25 < xPos;
                const multH = fromLeft ? 1 : -1;
                const angle = ((Math.random() * (data.throwAngleMax - data.throwAngleMin)) + data.throwAngleMin) * multH;
                const sizeScale = data.itemScaleMin + (((pos.size + 100) / 200) * (data.itemScaleMax - data.itemScaleMin));
                const eyeState = data.closeEyes ? 1 : (data.openEyes ? 2 : (data.hitExpression ? 3 : 0));
                const hitExpressionName = data.hitExpressionName;
                const hitExpressionDuration = data.hitExpressionDuration;
                const flinchRatio = data.modelFlinchRatio;
                const reverseX = data.modelFlinchReverseX ? -1 : 1;
                const reverseY = data.modelFlinchReverseY ? -1 : 1;

                var audio, canPlayAudio;
                if (sound != null) {
                    audio = new Audio();
                    audio.src = sound.substr(0, sound.indexOf("/") + 1) + encodeURIComponent(sound.substr(sound.indexOf("/") + 1));
                    audio.volume = volume * data.volume;
                    canPlayAudio = false;
                    audio.oncanplaythrough = function () { canPlayAudio = true; }
                }
                else
                    canPlayAudio = true;

                var impact, canShowImpact;
                if (impactDecal != null) {
                    impact = new Image();
                    impact.src = "decals/" + encodeURIComponent(impactDecal.location.substr(7));
                    canShowImpact = false;
                    impact.onload = function () { canShowImpact = true; }
                }
                else
                    canShowImpact = true;

                var img = new Image();
                if (image.startsWith("https://static-cdn.jtvnw.net/emoticons/v1/"))
                    img.src = image;
                else
                    img.src = "throws/" + encodeURIComponent(image.substr(7));

                img.onload = async function () {
                    // Don't do anything until both image and audio are ready
                    while (!canPlayAudio || !canShowImpact)
                        await new Promise(resolve => setTimeout(resolve, 10));

                    var randScale = ((pos.size + 100) / 200);
                    var randH = (((Math.random() * 100) - 50) * randScale);
                    var randV = (((Math.random() * 100) - 50) * randScale);

                    var root = document.createElement("div");
                    root.classList.add("thrown");
                    root.style.width = "100%";
                    root.style.height = "100%";
                    root.style.transformOrigin = (((pos.positionX + 1) / 2) * 100) + "% " + ((1 - ((pos.positionY + 1) / 2)) * 100) + "%";
                    if (!data.physicsSim || data.physicsSim && data.physicsRotate)
                        root.style.transform = "rotate(" + pos.rotation + "deg)";
                    var pivot = document.createElement("div");
                    pivot.classList.add("thrown");
                    pivot.style.left = (window.innerWidth * xPos) - (img.width * scale * sizeScale / 2) + randH + "px";
                    pivot.style.top = (window.innerHeight * yPos) - (img.height * scale * sizeScale / 2) + randV + "px";
                    pivot.style.transform = "rotate(" + angle + "deg)";
                    var movement = document.createElement("div");
                    movement.classList.add("animated");
                    var animName = "throw" + (fromLeft ? "Left" : "Right");
                    movement.style.animationName = animName;
                    movement.style.animationDuration = data.throwDuration + "s";
                    movement.style.animationDelay = (data.delay / 1000) + "s";
                    var thrown = document.createElement("img");
                    thrown.classList.add("animated");
                    thrown.src = image;
                    thrown.style.width = img.width * scale * sizeScale + "px";
                    thrown.style.height = img.height * scale * sizeScale + "px";
                    if (data.spinSpeedMax - data.spinSpeedMin == 0)
                        thrown.style.transform = "rotate(" + -angle + "deg)";
                    else {
                        thrown.style.animationName = "spin" + (Math.random() < 0.5 ? "Clockwise " : "CounterClockwise ");
                        thrown.style.animationDuration = (3 / (data.spinSpeedMin + (Math.random() * (data.spinSpeedMax - data.spinSpeedMin)))) + "s";
                        setTimeout(function () {
                            thrown.style.animationDuration = (1 / (data.spinSpeedMin + (Math.random() * (data.spinSpeedMax - data.spinSpeedMin)))) + "s";
                        }, (data.throwDuration * 500) + data.delay);
                        thrown.style.animationIterationCount = "infinite";
                    }

                    movement.appendChild(thrown);
                    pivot.appendChild(movement);
                    root.appendChild(pivot);
                    document.querySelector("body").appendChild(root);

                    setTimeout(function () { flinch(multH, angle, weight, data.parametersHorizontal, data.parametersVertical, data.parametersEyes, data.returnSpeed, eyeState, hitExpressionName, hitExpressionDuration, flinchRatio, reverseX, reverseY); }, data.throwDuration * 500, data.throwAngleMin, data.throwAngleMax);

                    if (sound != null)
                        setTimeout(function () { audio.play(); }, (data.throwDuration * 500) + data.delay);

                    if (impactDecal != null)
                        setTimeout(function () {
                            const hit = document.createElement("img");
                            hit.classList.add("thrown");
                            hit.style.left = (window.innerWidth * xPos) - (impact.width * impactDecal.scale * sizeScale / 2) + randH + "px";
                            hit.style.top = (window.innerHeight * yPos) - (impact.height * impactDecal.scale * sizeScale / 2) + randV + "px";
                            hit.src = "decals/" + encodeURIComponent(impactDecal.location.substr(7));
                            hit.style.width = impact.width * impactDecal.scale * sizeScale + "px";
                            hit.style.height = impact.height * impactDecal.scale * sizeScale + "px";
                            document.querySelector("body").appendChild(hit);

                            setTimeout(function () { hit.remove(); }, impactDecal.duration * 1000);
                        }, (data.throwDuration * 500) + data.delay);

                    if (hideOnHit) {    // 击中后消失
                        setTimeout(function () { document.querySelector("body").removeChild(root); }, (data.throwDuration * 500) + data.delay);
                    } else if (!data.physicsSim)
                        setTimeout(function () { document.querySelector("body").removeChild(root); }, (data.throwDuration * 1000) + data.delay);
                    else {
                        setTimeout(function () {
                            movement.style.animationName = "";
                            pivot.style.transform = "";
                            if (data.spinSpeedMax - data.spinSpeedMin == 0)
                                thrown.style.transform = "";

                            var x = 0, y = 0;
                            var randV = Math.random();
                            var vX = randV * 3 * (fromLeft ? -1 : 1) * data.physicsHorizontal;
                            var vY = (1 - randV) * 10 * (angle < 0 ? -1 : 0.5) * data.physicsVertical;

                            objects.push({
                                "x": x,
                                "y": y,
                                "vX": vX,
                                "vY": vY,
                                "element": movement,
                                "root": root
                            });

                            if (data.physicsFPS != physicsFPS) {
                                physicsFPS = data.physicsFPS;
                                if (physicsSimulator)
                                    clearInterval(physicsSimulator);
                                physicsSimulator = setInterval(simulatePhysics, 1000 / physicsFPS);
                            }
                            physicsGravityMult = data.physicsGravity;
                            physicsGravityReverse = data.physicsReverse;

                            if (!physicsSimulator)
                                physicsSimulator = setInterval(simulatePhysics, 1000 / physicsFPS);
                        }, (data.throwDuration * 500) + data.delay);
                    }
                }
            }
        }
        socketVTube.send(JSON.stringify(request));
    }
}

var physicsSimulator = null;
var physicsFPS = 60, physicsGravityMult = 1, physicsGravityReverse = false;
var objects = [];

function simulatePhysics() {
    for (var i = 0; i < objects.length; i++) {
        objects[i].x += objects[i].vX;
        objects[i].vY += 30 * physicsGravityMult * (physicsGravityReverse ? -1 : 1) * (1 / physicsFPS);
        objects[i].y += objects[i].vY;
        objects[i].element.style.transform = "translate(" + objects[i].x + "vw," + objects[i].y + "vh)";
        if (objects[i].y > 100 || physicsGravityReverse && objects[i].y < -100) {
            document.querySelector("body").removeChild(objects[i].root);
            objects.splice(i--, 1);
        }
    }
}

var expressionTimer;

var parametersH = ["FaceAngleX", "FaceAngleZ", "FacePositionX"], parametersV = ["FaceAngleY"], parametersE = ["EyeOpenLeft", "EyeOpenRight"];
function flinch(multH, angle, mag, paramH, paramV, paramE, returnSpeed, eyeState, hitExpressionName, expressionDuration, flinchRatio, reverseX, reverseY) {
    var parameterValues = [];
    for (var i = 0; i < paramH.length; i++)
        parameterValues.push({ "id": paramH[i][0], "value": /* paramH[i][1] + */ (multH < 0 ? paramH[i][2] : paramH[i][3]) * mag * flinchRatio * reverseX });
    for (var i = 0; i < paramV.length; i++)
        parameterValues.push({ "id": paramV[i][0], "value": /* paramV[i][1] + */ (angle > 0 ? paramV[i][2] : paramV[i][3]) * Math.abs(angle) / 45 * mag * flinchRatio * reverseY });

    if (eyeState == 3) {
        clearTimeout(expressionTimer);
        expressionTimer = null;
        setExpression(hitExpressionName, true);
    }

    var request = {
        "apiName": "VTubeStudioPublicAPI",
        "apiVersion": "1.0",
        "requestID": "5",
        "messageType": "InjectParameterDataRequest",
        "data": {
            "faceFound": false,
            "mode": "add",
            "parameterValues": parameterValues
        }
    }

    var weight = 1, done;
    socketVTube.onmessage = function () {
        weight -= returnSpeed;
        done = weight <= 0;
        if (done)
            weight = 0;

        parameterValues = [];
        for (var i = 0; i < paramH.length; i++)
            parameterValues.push({ "id": paramH[i][0], "value": /* paramH[i][1] + */ (multH < 0 ? paramH[i][2] : paramH[i][3]) * mag * weight * flinchRatio * reverseX });
        for (var i = 0; i < paramV.length; i++)
            parameterValues.push({ "id": paramV[i][0], "value": /* paramV[i][1] + */ (multH * angle > 0 ? paramV[i][2] : paramV[i][3]) * Math.abs(angle) / 45 * mag * weight * flinchRatio * reverseY });

        if (eyeState == 1) {
            for (var i = 0; i < paramE.length; i++)
                parameterValues.push({ "id": paramE[i][0], "value": -paramE[i][1] * weight });
        }
        else if (eyeState == 2) {
            for (var i = 0; i < paramE.length; i++)
                parameterValues.push({ "id": paramE[i][0], "value": paramE[i][1] * weight });
        }

        request = {
            "apiName": "VTubeStudioPublicAPI",
            "apiVersion": "1.0",
            "requestID": "6",
            "messageType": "InjectParameterDataRequest",
            "data": {
                "faceFound": false,
                "mode": "add",
                "parameterValues": parameterValues
            }
        }

        socketVTube.send(JSON.stringify(request));
        if (done) {
            socketVTube.onmessage = null;
            if (eyeState == 3) {
                expressionTimer = setTimeout(() => {
                    clearTimeout(expressionTimer);
                    expressionTimer = null;
                    setExpression(hitExpressionName, false);
                }, expressionDuration * 1000);
            }
        }
    };
    socketVTube.send(JSON.stringify(request));
}

function setExpression(expressionName, flag) {
    var request = {
        "apiName": "VTubeStudioPublicAPI",
        "apiVersion": "1.0",
        "requestID": "13",
        "messageType": "ExpressionActivationRequest",
        "data": {
            "expressionFile": expressionName + ".exp3.json",
            "active": flag
        }
    }

    socketVTube.send(JSON.stringify(request));
}

var modelLoaded = false;

// 注册模型加载事件回调
function subscribeModelLoad() {
    var request = {
        "apiName": "VTubeStudioPublicAPI",
        "apiVersion": "1.0",
        "requestID": "14",
        "messageType": "EventSubscriptionRequest",
        "data": {
            "eventName": "ModelLoadedEvent",
            "subscribe": true,
        }
    }

    socketVTube.onmessage = function (event) {
        socketVTube.onmessage = null;
        const tempData = JSON.parse(event.data);
        if (tempData.messageType == "APIError") {
            setTimeout(() => {
                subscribeModelLoad();
            }, 3000);
        }
    }

    // 接收并判断是否是模型更换事件，如是则判断模型是否更换
    socketVTube.addEventListener("message", (event) => {
        let tempData = JSON.parse(event.data);
        if (tempData.messageType != "ModelLoadedEvent") return;
        if (tempData.data.modelLoaded) {
            if (modelLoaded != false || !karasuIsOpen) return;
            let request = {
                "type": "modelLoaded"
            }
            socketKarasu.send(JSON.stringify(request));
        } else {
            modelLoaded = tempData.data.modelLoaded;
        }

        console.log(tempData.data);
    })

    socketVTube.send(JSON.stringify(request));
}

// 模型加载或卸载的回调
// function onModelLoaded() {

// }