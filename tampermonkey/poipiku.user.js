// ==UserScript==
// @name         poipiku图片下载
// @namespace    https://github.com/coofo/someScript
// @version      0.1.4
// @license      AGPL License
// @description  poipiku图片下载的试做，需要key才能看的图片要输入key后才能下载
// @author       coofo
// @downloadURL  https://github.com/coofo/someScript/raw/main/tampermonkey/poipiku.user.js
// @supportURL   https://github.com/coofo/someScript/issues
// @include      /^https://poipiku\.com/\d+/\d+\.html/
// @include      /^https://poipiku\.com/(\d+)(/?$|/?\?)/
// @include      /^https://poipiku.com/IllustListPcV\.jsp\?.*ID=(\d+)/
// @require      https://cdn.bootcss.com/jszip/3.1.5/jszip.min.js
// @connect      img.poipiku.com
// @connect      img-org.poipiku.com
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
     * 是否同步下载
     * @type {boolean}
     */
    setting.sync = true;
    /**
     * 下载模式
     * single：将图片文件单个下载（如果需要保存的文件有文件夹结构，则需要将tampermonkey下载模式调整为【浏览器API】）
     * zip：将图片打成zip包下载
     */
    setting.downloadMode = "zip";

    /**
     * 下载失败重试次数
     * @type {number}
     */
    setting.downloadRetryTimes = 2;

    //setting end

    console.log(GM_info.downloadMode);

    const userName = $("h2.UserInfoUserName a").html();
    tools.commonUtils.assert.hasLength(userName, "未获取到userName");

    if (tools.poipiku.utils.isUserPage()) {
        //用户页面
        $("a.GiftBtn").after('<a class="BtnBase" id="a_download" style="margin-left: 5px;" href="javascript: void(0);">⬇下载</a>');
        $("#a_download").click(function () {
            if (!tools.poipiku.utils.isLogin()) {
                alert("请先登入");
                return;
            }
            if (tools.runtime.nowDownloading) return;
            tools.runtime.nowDownloading = true;

            let getImgUrlFunction = tools.poipiku.api.getOrgImgUrl;

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
        span.before('<span class="BtnBase UserInfoCmdFollow UserInfoCmdFollow_581115" style="margin-right: 10px;flex: 0 0 0;padding: 0 13px" id="span_download">⬇下载</span>');
        $("#span_download").click(function () {
            let getImgUrlFunction = tools.poipiku.api.getOrgImgUrl;
            if (!tools.poipiku.utils.isLogin()) {
                alert("请先登入");
                return;
            }
            if (tools.runtime.nowDownloading) return;
            tools.runtime.nowDownloading = true;

            setting.pass = $("input.IllustItemExpandPass").val();
            let url = window.location.href;
            let match = url.match(tools.poipiku.regex.detailUrl);
            // console.log(match);


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
    const constants = {};
    const cache = {};

    const tools = {
        setting: {pass: ""},
        runtime: {
            nowDownloading: false,
            downloadTask: {
                zip: null,
                waitItemList: [],
                getGeneratedNum: function () {
                    let i = 0;
                    for (let j = 0; j < this.waitItemList.length; j++) {
                        if (this.waitItemList[j].complete === true) {
                            i++;
                        }
                    }
                    return i;
                },
                waitDownloadList: [],
                getDownloadedNum: function () {
                    let i = 0;
                    for (let j = 0; j < this.waitDownloadList.length; j++) {
                        if (this.waitDownloadList[j].complete === true) {
                            i++;
                        }
                    }
                    return i;
                },
                showMsg: function (msg) {
                    console.log(msg);
                },
                showFinished: function () {
                    this.showMsg("下载完成：" + tools.runtime.downloadTask.getDownloadedNum());
                },
                clear: function () {
                    this.waitItemList = [];
                    this.waitDownloadList = [];
                    this.showMsg = function (msg) {
                        console.log(msg);
                    }
                }
            }
        },
        commonUtils: {
            format: {
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
            },
            assert: {
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
            },
            downloadHelp: {
                toBlob: {
                    asBlob: function (url, onSuccess) {
                        GM_xmlhttpRequest({
                            method: "GET",
                            url: url,
                            responseType: "arraybuffer",
                            onload: function (responseDetails) {
                                onSuccess(responseDetails);
                            }
                        });
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
                        // console.log(details.url);
                        // console.log(details.name);
                        GM_download(details);
                    }
                }
            },
        },
        poipiku: {
            regex: {
                userUrl: [/^https:\/\/poipiku\.com\/(\d+)(\/?$|\/?\?)/, /https:\/\/poipiku.com\/IllustListPcV\.jsp\?.*ID=(\d+)/],
                detailUrl: /^https:\/\/poipiku\.com\/(\d+)\/(\d+)\.html/
            },
            utils: {
                isLogin: function () {
                    return $("a.LoginButton").length <= 0;
                },
                isUserPage: function () {
                    let url = window.location.href;
                    for (let i = 0; i < tools.poipiku.regex.userUrl.length; i++) {
                        if (url.match(tools.poipiku.regex.userUrl[i]) != null) {
                            return true;
                        }
                    }
                    return false;
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
                },
                tagImgItem: function (userId, id, color) {
                    if (this.isDetailPage()) {
                        $("#span_download").css("border", "2px solid " + color);
                    } else {
                        $("#a_download").css("border", "2px solid " + color);
                        let itemList = $("a.IllustThumbImg");
                        for (let i = 0; i < itemList.length; i++) {
                            let item = $(itemList[i]);
                            let match = item.attr("href").match(/\/(\d+)\/(\d+)\.html$/);
                            // if (match === null || match[1] !== userId || match[2] !== id) continue;
                            // item.css("border","4px solid red");
                            if (match !== null && match[1] === userId && match[2] === id) {
                                item.parent().css("border", "4px solid " + color);
                                return;
                            }
                        }
                    }
                },
                tagZeroImgItem: function (userId, id) {
                    this.tagImgItem(userId, id, "red");
                },
                tagWarnImgItem: function (userId, id) {
                    this.tagImgItem(userId, id, "orange");
                }
            },
            api: {
                /**
                 * 如果当前作品第一张图是直接能看的，该接口的返回中不包括第一张图，该接口预定将不再使用
                 * result_num 返回值统计
                 *     成功返回                1
                 *     sign in                 1
                 *     follower                2
                 *     需要密码但是密码错误    -2
                 *     需要关注                -5
                 *     需要关注                -6
                 */
                getSmallImgUrl: function (uid, iid, onSuccess, onError, onComplete) {
                    let data = {
                        UID: uid,
                        IID: iid,
                        PAS: tools.setting.pass,
                        MD: 0,
                        TWF: 1
                    };
                    $.ajax({
                        url: "/f/ShowAppendFileF.jsp",
                        data: data,
                        type: 'post',
                        dataType: 'json',
                        contentType: "application/x-www-form-urlencoded; charset=UTF-8",
                        success: function (request) {
                            // console.log(request);

                            let div = document.createElement("div");
                            div.innerHTML = request.html;
                            let imgUrls = [];
                            let imgs = $(div).find("img");
                            for (let i = 0; i < imgs.length; i++) {
                                // imgUrls[i] = $(imgs[i]).attr("src");
                                imgUrls[i] = tools.poipiku.utils.tryGetImgUrlFromSmallUrl($(imgs[i]).attr("src"));
                            }
                            if (imgUrls.length <= 0) {
                                tools.poipiku.utils.tagZeroImgItem(uid, iid);
                            }
                            onSuccess(imgUrls);
                        },
                        error: onError,
                        complete: onComplete
                    });
                },
                /**
                 * result 返回值统计
                 *     成功返回                1
                 *     sign in                 1
                 *     需要密码但是密码错误    -3
                 *     需要关注                -3
                 * error_code
                 *     需要关注                -3
                 */
                getOrgImgUrl: function (id, td, onSuccess, onError, onComplete) {
                    let data = {
                        ID: id,
                        TD: td,
                        AD: -1,
                        PAS: tools.setting.pass
                    };
                    $.ajax({
                        url: "/f/ShowIllustDetailF.jsp",
                        data: data,
                        type: 'post',
                        dataType: 'json',
                        contentType: "application/x-www-form-urlencoded; charset=UTF-8",
                        success: function (request) {
                            if (request.error_code === -3) {
                                tools.poipiku.utils.tagWarnImgItem(id, td);
                                tools.poipiku.api.getSmallImgUrl(id, td, onSuccess, onError, onComplete)
                            } else {
                                // console.log(request);
                                let div = document.createElement("div");
                                div.id = "temp";
                                document.body.appendChild(div);
                                div.innerHTML = request.html;
                                let imgs = $("#temp img");
                                // console.log(imgs);
                                let imgUrls = [];
                                for (let i = 0; i < imgs.length; i++) {
                                    imgUrls[i] = $(imgs[i]).attr("src");
                                }
                                if (imgUrls.length <= 0) {
                                    tools.poipiku.utils.tagZeroImgItem(id, td);
                                }
                                document.body.removeChild(div);

                                onSuccess(imgUrls);
                            }
                        },
                        error: onError,
                        complete: onComplete
                    });
                }
            },
            downloadHelp: {
                refreshDownLoadStatus: function () {
                    let completeNum = tools.runtime.downloadTask.getDownloadedNum();
                    let totalNum = tools.runtime.downloadTask.waitDownloadList.length;
                    let percent = tools.commonUtils.format.num.toThousands(completeNum / totalNum * 100, null, 0) + "%";
                    tools.runtime.downloadTask.showMsg("下载 " + percent);
                },
                addItem: function (userId, id, userName) {
                    tools.runtime.downloadTask.waitItemList.push({
                        userId: userId,
                        id: id,
                        userName: userName,
                        complete: false
                    });
                },
                addDownloadList: function (url, info) {
                    tools.runtime.downloadTask.waitDownloadList.push({
                        url: url,
                        info: info,
                        complete: false,
                        lastRetryTimes: tools.setting.downloadRetryTimes
                    });
                },
                generateDownloadList: function (getImgUrlFunction, onFinish) {
                    tools.runtime.downloadTask.showMsg("解析地址 0%");
                    let list = tools.runtime.downloadTask.waitItemList;
                    for (let i = 0; i < list.length; i++) {
                        getImgUrlFunction(list[i].userId, list[i].id, function (imgUrls) {
                            list[i].complete = true;
                            let completeNum = tools.runtime.downloadTask.getGeneratedNum();
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
                    let list = tools.runtime.downloadTask.waitDownloadList;
                    if (list.length <= 0) {
                        tools.runtime.downloadTask.showMsg("下载目标为0");
                        return;
                    }
                    if (tools.setting.sync === false) {
                        this.downloadService.async.exec();
                    } else {
                        this.downloadService.sync.exec();
                    }
                },
                fileNameService: {
                    getFileName: function (downloadItem) {
                        let setting = tools.setting;
                        let map = downloadItem.info;
                        return tools.commonUtils.format.string.byMap(setting.fileNameTemplate, map) + map.suffix;
                    }
                },
                downloadService: {
                    async: {
                        exec: function () {
                            let onSuccess;
                            let downloadFunction;
                            let setting = tools.setting;
                            switch (setting.downloadMode) {
                                case "single":
                                    downloadFunction = this.downloadItemSingle;
                                    onSuccess = function () {
                                        tools.poipiku.downloadHelp.refreshDownLoadStatus();
                                        let downloadTask = tools.runtime.downloadTask;
                                        if (downloadTask.getDownloadedNum() >= downloadTask.waitDownloadList.length) {
                                            tools.runtime.downloadTask.showFinished();
                                        }
                                    };
                                    break;
                                case "zip":
                                default:
                                    downloadFunction = this.downloadItemZip;
                                    let zip = new JSZip();
                                    onSuccess = function (fileName, arrayBuffer, map) {
                                        zip.file(fileName, arrayBuffer);

                                        tools.poipiku.downloadHelp.refreshDownLoadStatus();
                                        let downloadTask = tools.runtime.downloadTask;
                                        if (downloadTask.getDownloadedNum() >= downloadTask.waitDownloadList.length) {
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
                                                tools.runtime.downloadTask.showFinished();
                                            });
                                        }
                                    };
                                    break;
                            }

                            let list = tools.runtime.downloadTask.waitDownloadList;
                            for (let i = 0; i < list.length; i++) {
                                let downloadItem = list[i];
                                downloadFunction(downloadItem, onSuccess);
                            }
                        },
                        downloadItemSingle(downloadItem, onSuccess) {
                            let url = tools.commonUtils.format.url.fullUrl(downloadItem.url);
                            let fileName = tools.poipiku.downloadHelp.fileNameService.getFileName(downloadItem);
                            tools.commonUtils.downloadHelp.toUser.asGMdownload(url, fileName, {
                                gmDownload: {
                                    saveAs: false,
                                    onload: function () {
                                        downloadItem.complete = true;
                                        onSuccess();
                                    },
                                    onerror: function (e) {
                                        console.error("GM_download error: " + url);
                                        console.error(e);
                                        if (downloadItem.lastRetryTimes > 0) {
                                            setTimeout((function () {
                                                downloadItem.lastRetryTimes--;
                                                tools.poipiku.downloadHelp.downloadService.async.downloadItemSingle(downloadItem, onSuccess);
                                            }), 2000)
                                        } else {
                                            console.error("超过重试限制");
                                        }

                                    },
                                    ontimeout: function (e) {
                                        console.error("GM_download timeout");
                                        console.error(e);
                                        if (downloadItem.lastRetryTimes > 0) {
                                            setTimeout((function () {
                                                downloadItem.lastRetryTimes--;
                                                tools.poipiku.downloadHelp.downloadService.async.downloadItemSingle(downloadItem, onSuccess);
                                            }), 2000)
                                        } else {
                                            console.error("超过重试限制");
                                        }
                                    }
                                }
                            });
                        },
                        downloadItemZip(downloadItem, onSuccess) {
                            let map = downloadItem.info;
                            let url = downloadItem.url;
                            let fileName = tools.poipiku.downloadHelp.fileNameService.getFileName(downloadItem);
                            tools.commonUtils.downloadHelp.toBlob.asBlob(url, function (responseDetails) {
                                if (responseDetails.status === 200) {
                                    downloadItem.complete = true;
                                    onSuccess(fileName, responseDetails.response, map);
                                } else {
                                    console.error("download error: " + url);
                                    console.error(responseDetails);
                                    if (downloadItem.lastRetryTimes > 0) {
                                        setTimeout((function () {
                                            downloadItem.lastRetryTimes--;
                                            tools.poipiku.downloadHelp.downloadService.async.downloadItemZip(downloadItem, onSuccess);
                                        }), 2000)
                                    } else {
                                        console.error("超过重试限制");
                                    }
                                }
                            });
                        }
                    },
                    sync: {
                        exec: function () {
                            let setting = tools.setting;
                            switch (setting.downloadMode) {
                                case "single":
                                    this.downloadItemSingle(0);
                                    break;
                                case "zip":
                                default:
                                    tools.runtime.downloadTask.zip = new JSZip();
                                    this.downloadItemZip(0);
                                    break;
                            }
                        },
                        downloadItemSingle: function (index) {
                            let orgIndex = index;
                            let list = tools.runtime.downloadTask.waitDownloadList;
                            if (index >= list.length) {
                                setTimeout((function () {
                                    tools.poipiku.downloadHelp.downloadService.sync.downloadItemSingle(0);
                                }), 500);
                                return;
                            }
                            do {
                                let downloadItem = list[index];
                                if (!downloadItem.complete) {
                                    if (downloadItem.lastRetryTimes > 0) {
                                        let url = tools.commonUtils.format.url.fullUrl(downloadItem.url);
                                        let fileName = tools.poipiku.downloadHelp.fileNameService.getFileName(downloadItem);
                                        tools.commonUtils.downloadHelp.toUser.asGMdownload(url, fileName, {
                                            gmDownload: {
                                                saveAs: false,
                                                onload: function () {
                                                    downloadItem.complete = true;
                                                    tools.poipiku.downloadHelp.refreshDownLoadStatus();
                                                    tools.poipiku.downloadHelp.downloadService.sync.downloadItemSingle(index + 1);
                                                },
                                                onerror: function (e) {
                                                    console.error("GM_download error: " + url);
                                                    console.error(e);
                                                    downloadItem.lastRetryTimes--;
                                                    tools.poipiku.downloadHelp.downloadService.sync.downloadItemSingle(index + 1);

                                                },
                                                ontimeout: function (e) {
                                                    console.error("GM_download timeout");
                                                    console.error(e);
                                                    downloadItem.lastRetryTimes--;
                                                    tools.poipiku.downloadHelp.downloadService.sync.downloadItemSingle(index + 1);
                                                }
                                            }
                                        });
                                        return;
                                    } else {
                                        console.error("超过重试限制：" + downloadItem.url);
                                    }
                                }

                                index++;
                            } while (index < list.length);
                            if (orgIndex === 0) {
                                tools.runtime.downloadTask.showFinished();
                            } else {
                                tools.poipiku.downloadHelp.downloadService.sync.downloadItemSingle(index);
                            }
                        },
                        downloadItemZip: function (index) {
                            let orgIndex = index;
                            let list = tools.runtime.downloadTask.waitDownloadList;
                            if (index >= list.length) {
                                setTimeout((function () {
                                    tools.poipiku.downloadHelp.downloadService.sync.downloadItemZip(0);
                                }), 500);
                                return;
                            }
                            let downloadItem;
                            do {
                                downloadItem = list[index];
                                if (!downloadItem.complete) {
                                    if (downloadItem.lastRetryTimes > 0) {
                                        let url = downloadItem.url;
                                        let fileName = tools.poipiku.downloadHelp.fileNameService.getFileName(downloadItem);
                                        tools.commonUtils.downloadHelp.toBlob.asBlob(url, function (responseDetails) {
                                            if (responseDetails.status === 200) {
                                                tools.runtime.downloadTask.zip.file(fileName, responseDetails.response);
                                                downloadItem.complete = true;
                                                tools.poipiku.downloadHelp.refreshDownLoadStatus();
                                                tools.poipiku.downloadHelp.downloadService.sync.downloadItemZip(index + 1);
                                            } else {
                                                console.error("download error: " + url);
                                                console.error(responseDetails);
                                                downloadItem.lastRetryTimes--;
                                                tools.poipiku.downloadHelp.downloadService.sync.downloadItemZip(index + 1);
                                            }
                                        });
                                        return;
                                    } else {
                                        console.error("超过重试限制：" + downloadItem.url);
                                    }
                                }

                                index++;
                            } while (index < list.length);
                            if (orgIndex === 0) {

                                tools.runtime.downloadTask.zip.generateAsync({type: "blob"}).then(function (content) {
                                    let map = downloadItem.info;
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

                                    let zipFileName = tools.commonUtils.format.string.byMap(tools.setting.zipNameTemplate, info) + ".zip";
                                    tools.commonUtils.downloadHelp.toUser.asTagA4Blob(content, zipFileName);
                                    tools.runtime.downloadTask.showFinished();
                                });
                                tools.runtime.downloadTask.zip = null;
                            } else {
                                tools.poipiku.downloadHelp.downloadService.sync.downloadItemZip(index);
                            }
                        }
                    }
                },
            }
        }
    };

    return tools;
})());