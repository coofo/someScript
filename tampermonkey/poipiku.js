// ==UserScript==
// @name         poipiku图片下载
// @namespace    https://github.com/coofo/someScript
// @version      0.0.2
// @description  poipiku图片下载
// @author       coofo
// @include      /^https://poipiku\.com/\d+/\d+\.html/
// @include      /^https://poipiku\.com/(\d+)(/?$|/?\?)/
// @require      https://cdn.bootcss.com/jszip/3.1.5/jszip.min.js
// @connect      img.poipiku.com
// @grant        GM_download
// @grant        GM_xmlhttpRequest
// ==/UserScript==


(function (tools) {
    'use strict';
    //setting
    let setting = tools.setting;
    /**
     * 文件名格式（包括路径）
     * ${userId}       用户ID
     * ${userName}     用户名
     * ${id}           插图ID
     * ${page}         插图序号
     * ${page2}        插图序号（2位）
     * ${page3}        插图序号（3位）
     * ${page4}        插图序号（4位）
     */
    setting.fileNameTemplate = "[poipiku]/[${userId}]${userName}/[${id}]-${page2}";

    /**
     * zip文件名格式（包括路径）
     */
    setting.zipNameTemplate = "[poipiku][${userId}]${userName}[${id}]";

    /**
     * 下载模式
     * single：将图片文件单个下载（如果需要保存的文件有文件夹结构，则需要将tampermonkey下载模式调整为【浏览器API】）
     * zip：将图片打成zip包下载
     */
    setting.downloadMode = "zip";

    //setting end

    console.log(GM_info.downloadMode);

    const userName = $("h2.UserInfoUserName a").html();
    tools.commonUtils.assert.hasLength(userName, "未获取到userName");

    if (tools.poipiku.utils.isUserPage()) {
        //用户页面
        $("a.GiftBtn").after('<a class="BtnBase" id="a_download" style="margin-left: 5px;" href="javascript: void(0);">⬇下载</a>');
        $("#a_download").click(function () {
            if (tools.runtime.nowDownloading) return;
            tools.runtime.nowDownloading = true;

            let getImgUrlFunction = tools.poipiku.api.getOrgImgUrl;
            if (!tools.poipiku.utils.isLogin()) {
                if (confirm("当前未登入，可能无法下载原图，是否继续")) {
                    getImgUrlFunction = tools.poipiku.api.getSmallImgUrl;
                } else {
                    return;
                }
            }

            let btn = $("#a_download");
            tools.runtime.downloadTask.showMsg = function (msg) {
                btn.html(msg);
            };

            tools.runtime.downloadTask.showMsg("分析页面");

            let itemList = $("a.IllustThumbImg");
            for (let i = 0; i < itemList.length; i++) {
                let detailUrl = $(itemList[i]).attr("href");
                let match = detailUrl.match(/\/(\d+)\/(\d+)\.html$/);
                if (match === null) continue;
                tools.poipiku.downloadHelp.addItem(match[1], match[2], userName);
            }
            tools.poipiku.downloadHelp.generateDownloadList(getImgUrlFunction, function () {
                tools.poipiku.downloadHelp.doDownload();
            });
        });

    } else if (tools.poipiku.utils.isDetailPage()) {
        //详情页面
        let span = $('div.IllustItemUser span');
        // span.before('<span class="BtnBase UserInfoCmdFollow UserInfoCmdFollow_581115" style="margin-right: 10px;;padding: 0 10px 0 10px;flex: initial;" id="span_download">⬇下载</span>');
        span.before('<span class="BtnBase UserInfoCmdFollow UserInfoCmdFollow_581115" style="margin-right: 10px;" id="span_download">⬇下载</span>');
        $("#span_download").click(function () {
            if (tools.runtime.nowDownloading) return;
            tools.runtime.nowDownloading = true;

            let url = window.location.href;
            let match = url.match(tools.poipiku.regex.detailUrl);
            console.log(match);

            let getImgUrlFunction = tools.poipiku.api.getOrgImgUrl;
            if (!tools.poipiku.utils.isLogin()) {
                if (confirm("当前未登入，可能无法下载原图，是否继续")) {
                    getImgUrlFunction = tools.poipiku.api.getSmallImgUrl;
                } else {
                    return;
                }
            }

            let btn = $("#span_download");
            tools.runtime.downloadTask.showMsg = function (msg) {
                btn.html(msg);
            };
            tools.runtime.downloadTask.showMsg("开始下载");
            tools.poipiku.downloadHelp.addItem(match[1], match[2], userName);
            tools.poipiku.downloadHelp.generateDownloadList(getImgUrlFunction, function () {
                tools.poipiku.downloadHelp.doDownload();
            });
        });


        // span.before('<span class="BtnBase UserInfoCmdFollow UserInfoCmdFollow_581115" style="margin-right: 10px;"  id="span_download_test">⬇下载测试</span>');
        // $("#span_download_test").click(function () {
        // });
    }


})((function () {
    const tools = {setting: {}, commonUtils: {}, poipiku: {}};
    const constants = {};
    const cache = {};

    tools.runtime = {
        nowDownloading: false,
        downloadTask: {
            waitItemList: [],
            generatedNum: 0,
            waitDownloadList: [],
            downloadFinishNum: 0,
            showMsg: function (msg) {
                console.log(msg);
            },
            clear: function () {
                this.waitItemList = [];
                this.generatedNum = 0;
                this.waitDownloadList = [];
                this.downloadFinishNum = 0;
                this.showMsg = function (msg) {
                    console.log(msg);
                }
            }
        }
    };

    tools.commonUtils.format = {
        num: {
            fullNum: function (num, length) {
                return (Array(length).join('0') + num).slice(-length);
            },
            toThousands: function (value, seperator, digitNum) {
                if ((value = ((value = value + "").replace(/^\s*|\s*$|,*/g, ''))).match(/^\d*\.?\d*$/) == null)
                    return value;
                value = digitNum >= 0 ? (Number(value).toFixed(digitNum) + "") : value;
                let r = [],
                    tl = value.split(".")[0],
                    tr = value.split(".")[1];
                tr = typeof tr !== "undefined" ? tr : "";
                if (seperator != null && seperator !== "") {
                    while (tl.length >= 3) {
                        r.push(tl.substring(tl.length - 3));
                        tl = tl.substring(0, tl.length - 3);
                    }
                    if (tl.length > 0)
                        r.push(tl);
                    r.reverse();
                    r = r.join(seperator);
                    return tr === "" ? r : r + "." + tr;
                }
                return value;
            }
        },
        file: {
            getSuffix: function (name) {
                let index = name.lastIndexOf('.');
                if (index < 0) {
                    return "";
                } else {
                    return name.substring(index + 1);
                }
            }
        },
        string: {
            byMap: function (str, map) {
                let reg = new RegExp('\\${([a-z][a-zA-Z0-9_.]+)}', 'g');
                return str.replace(reg, function (match, pos, originalText) {
                    let key = match.replace(reg, '$1');
                    let value = map[key];
                    if (value === null || value === undefined) {
                        return match;
                    } else {
                        return value;
                    }
                });
            }
        },
        url: {
            fullUrl: function (url) {
                if (url.match(/^[a-zA-Z0-9]+:\/\//) !== null) {
                    return url;
                } else if (url.match(/^\/\/[a-zA-Z0-9]+/) !== null) {
                    return window.location.protocol + url;
                } else if (url.match(/^\/[a-zA-Z0-9]+/) !== null) {
                    return window.location.origin + url;
                } else {
                    return url;
                }
            }
        }
    };

    tools.commonUtils.assert = {
        isTrue: function (value, message) {
            if (true !== value) {
                console.error(message);
                console.error(value);
                throw message;
            }
        },
        isNull: function (value, message) {
            if (value !== null) {
                console.error(message);
                console.error(value);
                throw message;
            }
        },
        notNull: function (value, message) {
            if (value === null) {
                console.error(message);
                console.error(value);
                throw message;
            }
        },
        hasLength: function (value, message) {
            if (!(value !== null && value.length > 0)) {
                console.error(message);
                console.error(value);
                throw message;
            }
        },
    };

    tools.commonUtils.downloadHelp = {
        toBlob: {
            asBlob: function (url, onSuccess) {
                GM_xmlhttpRequest({
                    method:"GET",
                    url:url,
                    responseType : "arraybuffer",
                    onload:function (responseDetails) {
                        onSuccess(responseDetails.response);
                    }
                });

                // let oReq = new XMLHttpRequest();
                // oReq.open("GET", url, true);
                // oReq.responseType = "arraybuffer";
                // oReq.setRequestHeader("origin",null);
                // oReq.onload = function (oEvent) {
                //     onSuccess(oReq.response);
                // };
                // oReq.send(null);
            }
        },
        toUser: {
            asTagA4Url: function (url, fileName) {
                let aLink = document.createElement('a');
                if (fileName) {
                    aLink.download = fileName;
                } else {
                    aLink.download = url.substring(url.lastIndexOf('/') + 1);
                }
                aLink.className = 'download-temp-node';
                aLink.target = "_blank";
                aLink.style = "display:none;";
                aLink.href = url;
                document.body.appendChild(aLink);
                if (document.all) {
                    aLink.click(); //IE
                } else {
                    let evt = document.createEvent("MouseEvents");
                    evt.initEvent("click", true, true);
                    aLink.dispatchEvent(evt); // 其它浏览器
                }
                document.body.removeChild(aLink);
            },
            asTagA4Blob: function (content, fileName) {
                if ('msSaveOrOpenBlob' in navigator) {
                    navigator.msSaveOrOpenBlob(content, fileName);
                } else {
                    let aLink = document.createElement('a');
                    aLink.className = 'download-temp-node';
                    aLink.download = fileName;
                    aLink.style = "display:none;";
                    let blob = new Blob([content], {type: content.type});
                    aLink.href = window.URL.createObjectURL(blob);
                    document.body.appendChild(aLink);
                    if (document.all) {
                        aLink.click(); //IE
                    } else {
                        let evt = document.createEvent("MouseEvents");
                        evt.initEvent("click", true, true);
                        aLink.dispatchEvent(evt); // 其它浏览器
                    }
                    window.URL.revokeObjectURL(aLink.href);
                    document.body.removeChild(aLink);
                }
            },
            asGMdownload: function (url, fileName, setting) {
                let details;
                if (typeof setting === "object" && typeof setting.gmDownload === "object") {
                    details = setting.gmDownload;
                } else {
                    details = {saveAs: false};
                }
                details.url = url;
                details.name = fileName;
                console.log(details.url);
                console.log(details.name);
                GM_download(details);
            }
        }
    };

    tools.poipiku.regex = {
        userUrl: /^https:\/\/poipiku\.com\/(\d+)(\/?$|\/?\?)/,
        detailUrl: /^https:\/\/poipiku\.com\/(\d+)\/(\d+)\.html/
    };

    tools.poipiku.utils = {
        isLogin: function () {
            return $("a.LoginButton").length <= 0;
        },
        isUserPage: function () {
            let url = window.location.href;
            return url.match(tools.poipiku.regex.userUrl) != null;
        },
        isDetailPage: function () {
            let url = window.location.href;
            return url.match(tools.poipiku.regex.detailUrl) != null;
        },
        tryGetImgUrlFromSmallUrl: function (url) {
            let match = url.match(/^(.*)_\d+\.[0-9a-zA-Z]+$/);
            if (match === null) {
                return url;
            }
            return match[1];
        }
    };

    tools.poipiku.api = {
        getSmallImgUrl: function (uid, iid, onSuccess, onError, onComplete) {
            let data = {
                UID: uid,
                IID: iid,
                PAS: "",
                MD: 0,
                TWF: -1
            };
            $.ajax({
                url: "/f/ShowAppendFileF.jsp",
                data: data,
                type: 'post',
                dataType: 'json',
                contentType: "application/x-www-form-urlencoded; charset=UTF-8",
                success: function (request) {
                    console.log(request);

                    let div = document.createElement("div");
                    div.innerHTML = request.html;
                    let imgUrls = [];
                    let imgs = $(div).find("img");
                    for (let i = 0; i < imgs.length; i++) {
                        // imgUrls[i] = $(imgs[i]).attr("src");
                        imgUrls[i] = tools.poipiku.utils.tryGetImgUrlFromSmallUrl($(imgs[i]).attr("src"));
                    }
                    onSuccess(imgUrls);
                },
                error: onError,
                complete: onComplete
            });
        },
        getOrgImgUrl: function (id, td, onSuccess, onError, onComplete) {
            let data = {
                ID: id,
                TD: td,
                AD: -1,
                PAS: ""
            };
            $.ajax({
                url: "/f/ShowIllustDetailF.jsp",
                data: data,
                type: 'post',
                dataType: 'json',
                contentType: "application/x-www-form-urlencoded; charset=UTF-8",
                success: function (request) {
                    console.log(request);
                    let div = document.createElement("div");
                    div.id = "temp";
                    document.body.appendChild(div);
                    div.innerHTML = request.html;
                    let imgs = $("#temp img");
                    console.log(imgs);
                    let imgUrls = [];
                    for (let i = 0; i < imgs.length; i++) {
                        imgUrls[i] = $(imgs[i]).attr("src");
                    }
                    document.body.removeChild(div);

                    onSuccess(imgUrls);
                },
                error: onError,
                complete: onComplete
            });
        }
    };

    tools.poipiku.downloadHelp = {
        addItem: function (userId, id, userName) {
            tools.runtime.downloadTask.waitItemList.push({userId: userId, id: id, userName: userName});
        },
        addDownloadList: function (url, info) {
            tools.runtime.downloadTask.waitDownloadList.push({url: url, info: info});
        },
        generateDownloadList: function (getImgUrlFunction, onFinish) {
            tools.runtime.downloadTask.showMsg("解析地址 0%");
            let list = tools.runtime.downloadTask.waitItemList;
            for (let i = 0; i < list.length; i++) {
                getImgUrlFunction(list[i].userId, list[i].id, function (imgUrls) {
                    tools.runtime.downloadTask.generatedNum++;
                    let completeNum = tools.runtime.downloadTask.generatedNum;
                    let totalNum = tools.runtime.downloadTask.waitItemList.length;
                    let persent = tools.commonUtils.format.num.toThousands(completeNum / totalNum * 100, null, 0) + "%";
                    tools.runtime.downloadTask.showMsg("解析地址 " + persent);

                    for (let j = 0; j < imgUrls.length; j++) {
                        let imgUrl = imgUrls[j];
                        let suffix = tools.commonUtils.format.file.getSuffix(imgUrl);
                        if (suffix.length > 0) {
                            suffix = "." + suffix;
                        }
                        let index = j + 1;
                        let map = {
                            userId: list[i].userId,
                            userName: list[i].userName,
                            id: list[i].id,
                            page: "" + index,
                            page2: tools.commonUtils.format.num.fullNum(index, 2),
                            page3: tools.commonUtils.format.num.fullNum(index, 3),
                            page4: tools.commonUtils.format.num.fullNum(index, 4),
                            suffix: suffix

                        };
                        tools.poipiku.downloadHelp.addDownloadList(imgUrl, map)
                    }

                    if (completeNum >= totalNum) {
                        onFinish();
                    }
                });
            }
        },
        doDownload: function () {
            let setting = tools.setting;
            switch (setting.downloadMode) {
                case "single":
                    this.doDownloadSingle();
                    break;
                case "zip":
                default:
                    this.doDownloadZip();
                    break;
            }
        },
        doDownloadSingle: function () {
            let setting = tools.setting;
            let list = tools.runtime.downloadTask.waitDownloadList;
            let totalNum = list.length;
            if (totalNum <= 0) {
                tools.runtime.downloadTask.showMsg("下载目标为0");
                return;
            }
            tools.runtime.downloadTask.showMsg("下载 0%");

            for (let i = 0; i < list.length; i++) {
                let url = tools.commonUtils.format.url.fullUrl(list[i].url);
                let map = list[i].info;
                let fileName = tools.commonUtils.format.string.byMap(setting.fileNameTemplate, map) + map.suffix;
                tools.commonUtils.downloadHelp.toUser.asGMdownload(url, fileName, {
                    gmDownload: {
                        saveAs: false,
                        onload: function () {
                            tools.runtime.downloadTask.downloadFinishNum++;
                            let completeNum = tools.runtime.downloadTask.downloadFinishNum;
                            let totalNum = tools.runtime.downloadTask.waitDownloadList.length;
                            let persent = tools.commonUtils.format.num.toThousands(completeNum / totalNum * 100, null, 0) + "%";
                            tools.runtime.downloadTask.showMsg("下载 " + persent);
                            if (completeNum >= totalNum) {
                                tools.runtime.downloadTask.showMsg("下载完成");
                            }
                        },
                        onerror: function (e) {
                            console.error("GM_download error");
                            console.error(e);
                        },
                        ontimeout: function (e) {
                            console.error("GM_download timeout");
                            console.error(e);
                        }
                    }
                });
            }
        },
        doDownloadZip: function () {
            let setting = tools.setting;
            let list = tools.runtime.downloadTask.waitDownloadList;
            let totalNum = list.length;
            if (totalNum <= 0) {
                tools.runtime.downloadTask.showMsg("下载目标为0");
                return;
            }
            tools.runtime.downloadTask.showMsg("下载 0%");

            let zip = new JSZip();
            for (let i = 0; i < list.length; i++) {
                // let url = tools.commonUtils.format.url.fullUrl(list[i].url);
                let url = list[i].url;
                let map = list[i].info;
                let fileName = tools.commonUtils.format.string.byMap(setting.fileNameTemplate, map) + map.suffix;
                tools.commonUtils.downloadHelp.toBlob.asBlob(url, function (arrayBuffer) {
                    tools.runtime.downloadTask.downloadFinishNum++;
                    let completeNum = tools.runtime.downloadTask.downloadFinishNum;
                    let totalNum = tools.runtime.downloadTask.waitDownloadList.length;
                    let persent = tools.commonUtils.format.num.toThousands(completeNum / totalNum * 100, null, 0) + "%";
                    tools.runtime.downloadTask.showMsg("下载 " + persent);

                    zip.file(fileName, arrayBuffer);

                    if (completeNum >= totalNum) {
                        zip.generateAsync({type: "blob"}).then(function (content) {

                            let id = "";
                            if (tools.poipiku.utils.isDetailPage()) {
                                id = map.id;
                            }
                            let info = {
                                userId: map.userId,
                                userName: map.userName,
                                id: id,
                                page: "",
                                page2: "",
                                page3: "",
                                page4: ""
                            };

                            let zipFileName = tools.commonUtils.format.string.byMap(setting.zipNameTemplate, info) + ".zip";
                            tools.commonUtils.downloadHelp.toUser.asTagA4Blob(content, zipFileName);
                            tools.runtime.downloadTask.showMsg("下载完成");
                        });
                    }
                })
            }
        }
    };
    return tools;
})());